"""Python → Node/Remotion 渲染桥接。

混合架构：Python 负责 API/agents/编排，渲染这一环交给
Node + Remotion（它需要 Chromium）。两边通过 data/ 下的
artifacts JSON 文件作为契约对接——Python 把 scene-spec/voice-track/timeline 落盘后，
这里以子进程方式调用 Node 渲染 CLI，CLI 读同一份 data/ 产出 MP4。

Node CLI 用法（见 apps/render/src/cli/render.ts）：
    pnpm -F @auto/render render --project=<id> --output=<path>
它读取环境变量 AUTO_DATA_DIR 定位 data/，并把 RenderArtifact JSON 打到 stdout。
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from .config import settings


class RenderError(RuntimeError):
    pass


def _default_output_path(project_id: str) -> Path:
    return (settings.projects_dir / project_id / "renders" / "video.mp4").resolve()


async def render_project(project_id: str, output_path: str | Path | None = None,
                         timeout_seconds: int = 1800) -> dict[str, Any]:
    """调 Node 渲染 CLI 生成 MP4，返回解析后的 RenderArtifact。"""
    out = Path(output_path).resolve() if output_path else _default_output_path(project_id)
    out.parent.mkdir(parents=True, exist_ok=True)

    env = {**_os_environ(), "AUTO_DATA_DIR": str(settings.data_dir.resolve())}
    proc = await asyncio.create_subprocess_exec(
        "pnpm", "-F", "@auto/render", "render",
        f"--project={project_id}", f"--output={out}",
        cwd=str(settings.repo_root),
        env=env,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError as e:
        proc.kill()
        raise RenderError(f"渲染超时（>{timeout_seconds}s）") from e

    if proc.returncode != 0:
        tail = (stderr or b"").decode("utf-8", "replace")[-800:]
        raise RenderError(f"Node 渲染失败（exit {proc.returncode}）：\n{tail}")

    text = (stdout or b"").decode("utf-8", "replace").strip()
    # CLI 末尾打印 RenderArtifact JSON；容忍前面可能有日志，取最后一个 JSON 对象。
    start = text.rfind("{\n")
    if start == -1:
        start = text.find("{")
    try:
        return json.loads(text[start:]) if start != -1 else {"outputPath": str(out)}
    except json.JSONDecodeError:
        return {"outputPath": str(out)}


async def export_web_deck(project_id: str, output_path: str | Path | None = None,
                          timeout_seconds: int = 300) -> Path:
    """调 Node 导出 CLI 生成自包含交互网页课件（音频内嵌 base64），返回 HTML 文件路径。"""
    out = (Path(output_path).resolve() if output_path
           else (settings.projects_dir / project_id / "exports" / "deck.html").resolve())
    out.parent.mkdir(parents=True, exist_ok=True)
    env = {**_os_environ(), "AUTO_DATA_DIR": str(settings.data_dir.resolve())}
    proc = await asyncio.create_subprocess_exec(
        "pnpm", "-F", "@auto/render", "export-web",
        f"--project={project_id}", f"--output={out}",
        cwd=str(settings.repo_root), env=env,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    try:
        _stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_seconds)
    except asyncio.TimeoutError as e:
        proc.kill()
        raise RenderError(f"网页导出超时（>{timeout_seconds}s）") from e
    if proc.returncode != 0:
        tail = (stderr or b"").decode("utf-8", "replace")[-800:]
        raise RenderError(f"网页导出失败（exit {proc.returncode}）：\n{tail}")
    return out


def _os_environ() -> dict[str, str]:
    import os
    return dict(os.environ)
