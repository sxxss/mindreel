"""Mindreel Python 后端入口（FastAPI）。

提供：健康检查、项目 CRUD、资料源、生成流水线（job/action）、事件流（轮询 + SSE）、
artifact 读取、媒体文件服务、provider 配置与测试。接口形状对齐前端 @auto/shared 契约，
现有 React 前端只需把 VITE_API_BASE_URL 指向本服务即可直接使用。
"""
from __future__ import annotations

import hashlib
import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from . import pipeline, render_bridge, store
from .config import settings
from .models import (
    AppendSourceInput,
    CreateProjectInput,
    Project,
    ProviderConfig,
    SourceDocument,
    UpdateProjectInput,
)
from .providers import ProviderError, generate_json, synthesize_speech

app = FastAPI(title="Mindreel API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


def _require_project(pid: str) -> Project:
    try:
        return store.get_project(pid)
    except FileNotFoundError:
        raise HTTPException(404, f"project {pid} not found")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ── 项目 ──────────────────────────────────────────────────────────────────────
def _to_list_item(p: Project) -> dict:
    return {
        "id": p.id, "title": p.title, "topic": p.topic, "audience": p.audience,
        "durationTargetSeconds": p.durationTargetSeconds, "language": p.language,
        "createdAt": p.createdAt, "updatedAt": p.updatedAt, "status": p.status,
        "theme": p.theme, "sourceCount": len(p.sources),
        "latestArtifacts": {k: v.model_dump(mode="json") for k, v in p.latestArtifacts.items()},
    }


@app.get("/api/projects")
def list_projects() -> list[dict]:
    return [_to_list_item(p) for p in store.list_projects()]


@app.post("/api/projects")
def create_project(body: CreateProjectInput) -> Project:
    pid = store.new_id()
    ts = store.now_iso()
    project = Project(
        id=pid, title=body.title, topic=body.topic, audience=body.audience,
        durationTargetSeconds=body.durationTargetSeconds, language=body.language,
        theme=body.theme or "deep-space", sources=[], createdAt=ts, updatedAt=ts,
        status="active", latestArtifacts={},
    )
    return store.save_project(project)


@app.get("/api/projects/{pid}")
def get_project(pid: str) -> Project:
    return _require_project(pid)


@app.patch("/api/projects/{pid}")
def update_project(pid: str, body: UpdateProjectInput) -> Project:
    project = _require_project(pid)
    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(400, "至少要提供一个可修改字段")
    for k, v in patch.items():
        setattr(project, k, v)
    project.updatedAt = store.now_iso()
    return store.save_project(project)


# ── 资料源 ────────────────────────────────────────────────────────────────────
@app.post("/api/projects/{pid}/sources")
def append_source(pid: str, body: AppendSourceInput) -> SourceDocument:
    if body.kind == "url" and not body.url:
        raise HTTPException(400, "url 类型的资料必须提供 url")
    project = _require_project(pid)
    source = SourceDocument(
        id=store.new_id("src"), kind=body.kind, title=body.title, body=body.body,
        digest=_digest(body.body), createdAt=store.now_iso(), url=body.url,
    )
    project.sources.append(source)
    project.updatedAt = store.now_iso()
    store.save_project(project)
    return source


# ── 生成流水线：job / action ────────────────────────────────────────────────────
@app.post("/api/projects/{pid}/jobs")
async def create_job(pid: str, body: dict) -> dict:
    _require_project(pid)
    kind = body.get("kind")
    if kind not in pipeline.JOB_KIND_TO_STAGES:
        raise HTTPException(400, f"未知 job kind：{kind}")
    job = pipeline.start_job(pid, kind, options=body.get("options"))
    return job.public()


@app.post("/api/projects/{pid}/actions")
async def stage_action(pid: str, body: dict) -> dict:
    _require_project(pid)
    action = body.get("action")
    stage = body.get("stage")
    if action == "approve-stage":
        # 仅记录审批，不重跑：创建一个不含阶段的 job，立即成功
        kind = pipeline.ACTION_STAGE_TO_KIND.get(stage, "qa")
        job = pipeline.start_job(pid, kind, options=body, stages_override=[])
        return job.public()
    if action in ("rerun-stage", "rewrite-beat", "change-scene-template", "resynthesize-voice"):
        internal = pipeline.ACTION_STAGE_TO_INTERNAL.get(stage)
        if internal is None:
            raise HTTPException(400, f"该阶段不支持此操作：{stage}")
        kind = pipeline.ACTION_STAGE_TO_KIND[stage]
        job = pipeline.start_job(pid, kind, options=body, stages_override=[internal])
        return job.public()
    if action == "continue-downstream":
        internal = pipeline.ACTION_STAGE_TO_INTERNAL.get(stage)
        if internal is None:
            raise HTTPException(400, f"无法从该阶段继续：{stage}")
        idx = pipeline.ALL_STAGES.index(internal)
        downstream = pipeline.ALL_STAGES[idx:]
        job = pipeline.start_job(pid, "autopilot", options=body, stages_override=downstream)
        return job.public()
    raise HTTPException(400, f"未知 action：{action}")


# ── 事件流：轮询 + SSE ──────────────────────────────────────────────────────────
@app.get("/api/projects/{pid}/pipeline-events")
def pipeline_events(pid: str) -> list[dict]:
    _require_project(pid)
    return pipeline.manager.project_events(pid)


@app.get("/api/projects/{pid}/events")
async def project_events_sse(pid: str):
    _require_project(pid)

    async def stream():
        for ev in list(pipeline.manager.project_events(pid)):
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        q = pipeline.manager.subscribe(pid)
        try:
            while True:
                ev = await q.get()
                yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"
        finally:
            pipeline.manager.unsubscribe(pid, q)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── artifact ──────────────────────────────────────────────────────────────────
@app.get("/api/projects/{pid}/artifacts/{kind}")
def get_artifact(pid: str, kind: str):
    try:
        return store.load_artifact(pid, kind)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


@app.get("/api/projects/{pid}/artifacts/{kind}/versions/{version}")
def get_artifact_version(pid: str, kind: str, version: int):
    try:
        return store.load_artifact(pid, kind, version)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))


# ── 媒体文件（渲染产物 / 音频）──────────────────────────────────────────────────
@app.get("/api/projects/{pid}/media")
def project_media(pid: str, path: str):
    # 安全校验：必须留在 data/projects 内
    if path.startswith("/") or ".." in path or not path.startswith("projects/"):
        raise HTTPException(400, "非法的媒体路径")
    full = (settings.data_dir / path).resolve()
    if not str(full).startswith(str(settings.data_dir.resolve())) or not full.is_file():
        raise HTTPException(404, "媒体文件不存在")
    return FileResponse(str(full))


@app.get("/api/projects/{pid}/export/web")
async def export_web(pid: str):
    """导出自包含交互网页课件（音频内嵌），由 Node 导出器生成，直接回传 HTML。"""
    project = _require_project(pid)
    if "timeline" not in project.latestArtifacts or "scene-spec" not in project.latestArtifacts:
        raise HTTPException(409, "项目尚未生成完整内容（缺 scene-spec / timeline），无法导出网页版")
    try:
        html_path = await render_bridge.export_web_deck(pid)
    except render_bridge.RenderError as e:
        raise HTTPException(500, str(e))
    filename = f"{project.title or pid}.html"
    return FileResponse(str(html_path), media_type="text/html; charset=utf-8",
                        filename=filename)


# ── provider 配置 ─────────────────────────────────────────────────────────────
@app.get("/api/providers")
def get_providers() -> ProviderConfig:
    return store.load_providers()


@app.put("/api/providers")
def put_providers(cfg: ProviderConfig) -> ProviderConfig:
    return store.save_providers(cfg)


@app.post("/api/providers/test")
async def test_provider(body: dict) -> dict:
    kind = body.get("kind", "llm")
    cfg = store.load_providers()
    entry = getattr(cfg, kind, None)
    if entry is None:
        raise HTTPException(400, f"unknown provider kind: {kind}")
    if not entry.baseUrl:
        return {"ok": False, "message": "缺少 baseUrl", "latencyMs": 0}
    if not entry.apiKey:
        return {"ok": False, "message": "缺少 API Key", "latencyMs": 0}
    try:
        if kind == "tts":
            audio = await synthesize_speech(entry, text="测试")
            return {"ok": True, "message": f"TTS 可用（{len(audio)} 字节）", "latencyMs": 0}
        await generate_json(entry, system="只回 JSON。", user='返回 {"ok": true}')
        return {"ok": True, "message": "LLM 可用", "latencyMs": 0}
    except ProviderError as e:
        return {"ok": False, "message": str(e), "latencyMs": 0}


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
