"""OpenAI 兼容的 LLM / TTS 客户端。

- LLM：调 /chat/completions，response_format=json_object，带退避重试。
- TTS：调 /v1/audio/speech，返回音频字节。
deepseek 等模型偶尔把本应是对象的结果包成数组，这里也做一次拆包兜底。
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx

from .models import ProviderEntry


class ProviderError(RuntimeError):
    pass


def _trim_base(url: str) -> str:
    return url.rstrip("/")


async def _post_with_retry(client: httpx.AsyncClient, url: str, *, headers: dict, json_body: dict,
                           attempts: int = 4) -> httpx.Response:
    last: Exception | None = None
    for i in range(attempts):
        try:
            resp = await client.post(url, headers=headers, json=json_body, timeout=120)
            if resp.status_code in (429,) or resp.status_code >= 500:
                raise ProviderError(f"upstream {resp.status_code}")
            return resp
        except (httpx.HTTPError, ProviderError) as e:  # 网络瞬断 / 429 / 5xx → 退避重试
            last = e
            if i == attempts - 1:
                break
            await asyncio.sleep(0.5 * (2 ** i))
    raise ProviderError(f"request failed after {attempts} attempts: {last}")


def _unwrap(value: Any) -> Any:
    """response_format=json_object 期望顶层是对象；个别模型会包成单元素数组。"""
    if isinstance(value, list) and len(value) == 1 and isinstance(value[0], dict):
        return value[0]
    return value


def _balanced_spans(text: str) -> list[str]:
    """扫描出所有【真正顶层】的平衡 {...} / [...] 子串（统一深度，正确处理字符串/转义）。

    用单一深度计数（{ 和 [ 都 +1，} 和 ] 都 -1），只在深度归零时收一个跨度——
    这样对象里【嵌套】的数组/对象不会被当成候选。否则一个外层对象坏掉时，
    会误把里面某个恰好合法的嵌套数组（如 prerequisites）当结果返回。
    模型「先吐坏 JSON、再重写一份」这种顶层并列的情况仍能各自被收到。
    """
    spans: list[str] = []
    depth = 0
    start = -1
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            if depth == 0:
                start = i
            depth += 1
        elif ch in "}]" and depth > 0:
            depth -= 1
            if depth == 0 and start >= 0:
                spans.append(text[start: i + 1])
    return spans


_VALUE_START = set('"{[+-.0123456789') | {"t", "f", "n"}  # JSON 值合法的起始字符


def _repair_json(text: str) -> str:
    """字符串感知地修三类 deepseek 高频小毛病（只在字符串外动手，绝不碰 HTML 内容）：
    - 空值：`"durationMs":,` / `"k": }` → 补 0（本 schema 里空值几乎都是数字字段）。
    - 值位置数字前的乱码：`"expectedSeconds":島25` → `:25`（模型偶尔在数字前粘个杂字符）。
    - 拖尾逗号：`,}` / `,]` → 删掉逗号。
    """
    out: list[str] = []
    in_str = False
    esc = False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if in_str:
            if esc:
                out.append(ch)
                esc = False
            elif ch == "\\":
                out.append(ch)
                esc = True
            elif ch == '"':
                out.append(ch)
                in_str = False
            elif ch == "\n":      # 字符串内的真实换行/制表符是非法 JSON，转义掉
                out.append("\\n")
            elif ch == "\r":
                out.append("\\r")
            elif ch == "\t":
                out.append("\\t")
            else:
                out.append(ch)
            i += 1
            continue
        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue
        if ch == ":":
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in ",}]":  # 冒号后直接是结束符 → 空值
                out.append(": 0")
                i += 1
                continue
            # 冒号后是非法的值起始字符（模型把数值字段写成了乱码 token，
            # 如 `島25`、`𝑥`、`Duration.FromSeconds(2)`）→ 提取其中的数字；
            # 没有数字就补 0。扫到下一个分隔符为止，遇到引号说明其实是字符串值，放弃。
            if j < n and text[j] not in _VALUE_START and text[j] not in ",}]":
                m = j
                while m < n and text[m] not in ',}]"':
                    m += 1
                if m < n and text[m] == '"':
                    out.append(ch)  # 值其实是字符串，别动
                    i += 1
                    continue
                num = re.search(r"\d+", text[j:m])
                out.append(": " + (num.group(0) if num else "0"))
                i = m
                continue
        if ch == ",":
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in "}]":  # 拖尾逗号 → 丢弃
                i += 1
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def _iter_json_candidates(text: str):
    # 1) ```json ... ``` 围栏块（按出现顺序）——模型重写时通常用围栏包住最终版
    for m in re.finditer(r"```(?:json|JSON)?\s*\n?(.*?)```", text, re.DOTALL):
        c = m.group(1).strip()
        if c:
            yield c
    # 2) 平衡括号子串（兜住「写了两遍」「前后有解说文字」等情况）
    spans = _balanced_spans(text)
    yield from spans
    # 3) 原文整体
    yield text.strip()
    # 4) 上述候选的「修复版」（补空值、删拖尾逗号）—— 放最后，原文能解析就不动它
    for cand in [*spans, text.strip()]:
        yield _repair_json(cand)


def _parse_content(content: str) -> Any:
    if not content or not content.strip():
        raise ProviderError("模型返回了空内容")
    last_err: json.JSONDecodeError | None = None
    for cand in _iter_json_candidates(content):
        try:
            return _unwrap(json.loads(cand))
        except json.JSONDecodeError as e:
            last_err = e
            continue
    raise ProviderError(f"模型返回的不是合法 JSON（{last_err}）") from last_err


async def generate_json(cfg: ProviderEntry, *, system: str, user: str,
                        temperature: float = 0.3) -> Any:
    if not cfg.baseUrl:
        raise ProviderError("LLM 未配置 baseUrl，请在 /providers 设置")
    headers = {"Content-Type": "application/json"}
    if cfg.apiKey:
        headers["Authorization"] = f"Bearer {cfg.apiKey}"
    body = {
        "model": cfg.model or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 16384,
        # 结构化 JSON：首轮低温更稳；失败重试时上层会调高温度，强制换一个采样，
        # 以逃出 deepseek 偶发的「数值字段被幻觉成奇怪 token」这类可复现的坏输出。
        "temperature": temperature,
    }
    async with httpx.AsyncClient() as client:
        resp = await _post_with_retry(
            client, f"{_trim_base(cfg.baseUrl)}/chat/completions", headers=headers, json_body=body
        )
    if resp.status_code >= 400:
        raise ProviderError(f"LLM {resp.status_code}: {resp.text[:200]}")
    content = resp.json()["choices"][0]["message"].get("content") or ""
    return _parse_content(content)


async def complete_text(cfg: ProviderEntry, *, system: str, user: str,
                        temperature: float = 0.3, max_tokens: int = 16384) -> str:
    """返回模型的原始文本（不强制 JSON）。用于「结构 JSON + HTML 分隔块」这种
    HTML 不进 JSON 的输出协议——HTML 当纯文本拿回来，避免转义导致的 JSON 损坏。"""
    if not cfg.baseUrl:
        raise ProviderError("LLM 未配置 baseUrl，请在 /providers 设置")
    headers = {"Content-Type": "application/json"}
    if cfg.apiKey:
        headers["Authorization"] = f"Bearer {cfg.apiKey}"
    body = {
        "model": cfg.model or "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    async with httpx.AsyncClient() as client:
        resp = await _post_with_retry(
            client, f"{_trim_base(cfg.baseUrl)}/chat/completions", headers=headers, json_body=body
        )
    if resp.status_code >= 400:
        raise ProviderError(f"LLM {resp.status_code}: {resp.text[:200]}")
    content = resp.json()["choices"][0]["message"].get("content") or ""
    if not content.strip():
        raise ProviderError("模型返回了空内容")
    return content


async def synthesize_speech(cfg: ProviderEntry, *, text: str, voice: str | None = None,
                            fmt: str = "mp3", speed: float = 1.0) -> bytes:
    if not cfg.baseUrl:
        raise ProviderError("TTS 未配置 baseUrl，请在 /providers 设置")
    headers = {"Content-Type": "application/json"}
    if cfg.apiKey:
        headers["Authorization"] = f"Bearer {cfg.apiKey}"
    body = {
        "model": cfg.model or "tts-1",
        "input": text,
        "voice": voice or cfg.voice or "alloy",
        "response_format": fmt,
        "speed": speed,
    }
    async with httpx.AsyncClient() as client:
        resp = await _post_with_retry(
            client, f"{_trim_base(cfg.baseUrl)}/audio/speech", headers=headers, json_body=body
        )
    if resp.status_code >= 400:
        raise ProviderError(f"TTS {resp.status_code}: {resp.text[:200]}")
    return resp.content
