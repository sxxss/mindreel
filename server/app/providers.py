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
    """扫描出所有顶层平衡的 {...} / [...] 子串（正确处理字符串字面量与转义）。

    模型有时会先吐一段坏 JSON、再用 ```json 围栏重写一份完整的；
    把每个候选都抽出来逐个尝试解析，能把这种「写了两遍」的情况救回来。
    """
    spans: list[str] = []
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
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
            elif ch == open_ch:
                if depth == 0:
                    start = i
                depth += 1
            elif ch == close_ch and depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    spans.append(text[start: i + 1])
    return spans


def _repair_json(text: str) -> str:
    """字符串感知地修两类 deepseek 高频小毛病（只在字符串外动手，绝不碰 HTML 内容）：
    - 空值：`"durationMs":,` / `"k": }` → 补 0（本 schema 里空值几乎都是数字字段）。
    - 拖尾逗号：`,}` / `,]` → 删掉逗号。
    """
    out: list[str] = []
    in_str = False
    esc = False
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
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
