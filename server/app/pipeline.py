"""流水线编排 + 进程内任务队列 + 事件流（对齐前端 PipelineJob / PipelineEvent 契约）。

阶段顺序（内部名）：
    research → curriculum → script → scene-spec(visual-director) → voice → timeline → render
每阶段产物用 store.save_artifact 落盘（与 Node 渲染共享同一份 data/）。
任务异步执行；事件按【项目】聚合，既支持轮询（/pipeline-events）也支持 SSE（/events）。
"""
from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass, field
from typing import Any, Optional

from . import store
from .agents.curriculum import run_curriculum
from .agents.research import run_research
from .agents.script import run_script
from .agents.timeline_solver import solve_timeline
from .agents.visual_director import run_visual_director
from .agents.voice import run_voice
from .models import Curriculum, Knowledge, Script, SceneSpec, VoiceTrack
from .render_bridge import render_project

# 内部阶段名（流水线执行顺序）
ALL_STAGES = ["research", "curriculum", "script", "scene-spec", "voice", "timeline", "render"]
STAGE_ARTIFACT = {
    "research": "knowledge", "curriculum": "curriculum", "script": "script",
    "scene-spec": "scene-spec", "voice": "voice-track", "timeline": "timeline",
    "render": "render",
}
# job.kind（前端契约）→ 要跑的内部阶段
JOB_KIND_TO_STAGES = {
    "research": ["research"], "curriculum": ["curriculum"], "script": ["script"],
    "scene-spec": ["scene-spec"], "voice": ["voice"], "timeline": ["timeline"],
    "render": ["render"], "qa": [], "autopilot": list(ALL_STAGES),
}
# 前端 PipelineStage（actions 用）→ job.kind / 内部阶段
ACTION_STAGE_TO_KIND = {
    "knowledge": "research", "curriculum": "curriculum", "script": "script",
    "scenes": "scene-spec", "voice": "voice", "timeline": "timeline",
    "render": "render", "qa": "qa",
}
ACTION_STAGE_TO_INTERNAL = {
    "knowledge": "research", "curriculum": "curriculum", "script": "script",
    "scenes": "scene-spec", "voice": "voice", "timeline": "timeline", "render": "render",
}


def _level_for(type_: str) -> str:
    if "fail" in type_ or "error" in type_:
        return "error"
    if "retry" in type_ or "warn" in type_:
        return "warn"
    return "info"


@dataclass
class Job:
    id: str
    project_id: str
    kind: str
    stages: list[str]
    status: str = "pending"  # pending / running / succeeded / failed / canceled
    created_at: str = ""
    updated_at: str = ""
    options: Optional[dict] = None
    artifact_ref: Optional[dict] = None
    error_message: Optional[str] = None

    def public(self) -> dict:
        out = {
            "id": self.id, "projectId": self.project_id, "kind": self.kind,
            "status": self.status, "createdAt": self.created_at, "updatedAt": self.updated_at,
        }
        if self.options is not None:
            out["options"] = self.options
        if self.artifact_ref is not None:
            out["artifactRef"] = self.artifact_ref
        if self.error_message is not None:
            out["errorMessage"] = self.error_message
        return out


class PipelineManager:
    def __init__(self) -> None:
        self.jobs: dict[str, Job] = {}
        # 事件按项目聚合（前端按项目轮询/订阅）
        self.events_by_project: dict[str, list[dict]] = {}
        self.subscribers: dict[str, set[asyncio.Queue]] = {}

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.jobs.get(job_id)

    def project_events(self, project_id: str) -> list[dict]:
        return self.events_by_project.get(project_id, [])

    def create_job(self, project_id: str, kind: str, stages: list[str],
                   options: dict | None = None) -> Job:
        ts = store.now_iso()
        job = Job(id=f"job_{secrets.token_hex(8)}", project_id=project_id, kind=kind,
                  stages=stages, status="pending", created_at=ts, updated_at=ts, options=options)
        self.jobs[job.id] = job
        return job

    async def emit(self, job: Job, type_: str, message: str, data: dict | None = None,
                   artifact_ref: dict | None = None) -> None:
        event = {
            "id": f"evt_{secrets.token_hex(8)}", "jobId": job.id, "type": type_,
            "level": _level_for(type_), "message": message, "createdAt": store.now_iso(),
        }
        if data:
            event["data"] = data
        if artifact_ref:
            event["artifactRef"] = artifact_ref
        self.events_by_project.setdefault(job.project_id, []).append(event)
        for q in list(self.subscribers.get(job.project_id, set())):
            q.put_nowait(event)

    def subscribe(self, project_id: str) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self.subscribers.setdefault(project_id, set()).add(q)
        return q

    def unsubscribe(self, project_id: str, q: asyncio.Queue) -> None:
        self.subscribers.get(project_id, set()).discard(q)


manager = PipelineManager()


async def _run_job(job: Job) -> None:
    job.status = "running"
    job.updated_at = store.now_iso()
    try:
        cfg = store.load_providers()
        project = store.get_project(job.project_id)

        async def emit(type_: str, message: str, data: dict | None = None,
                       artifact_ref: dict | None = None) -> None:
            await manager.emit(job, type_, message, data, artifact_ref)

        knowledge: Knowledge | None = None
        curriculum: Curriculum | None = None
        script: Script | None = None
        scene_specs: list[SceneSpec] | None = None
        voice_track: VoiceTrack | None = None

        def _load(kind: str, model):
            try:
                raw = store.load_artifact(job.project_id, kind)
            except FileNotFoundError:
                return None
            return [model.model_validate(x) for x in raw] if isinstance(raw, list) \
                else model.model_validate(raw)

        last_ref: dict | None = None
        for stage in job.stages:
            await emit("stage.started", f"开始：{stage}", {"stage": stage})

            if stage == "research":
                knowledge = await run_research(project, project.sources, cfg.llm, emit)
                last_ref = store.save_artifact(job.project_id, "knowledge",
                                               knowledge.model_dump(mode="json", exclude_none=True))
            elif stage == "curriculum":
                knowledge = knowledge or _load("knowledge", Knowledge)
                curriculum = await run_curriculum(project, knowledge, cfg.llm, emit)
                last_ref = store.save_artifact(job.project_id, "curriculum",
                                               curriculum.model_dump(mode="json", exclude_none=True))
            elif stage == "script":
                knowledge = knowledge or _load("knowledge", Knowledge)
                curriculum = curriculum or _load("curriculum", Curriculum)
                script = await run_script(project, knowledge, curriculum, cfg.llm, emit)
                last_ref = store.save_artifact(job.project_id, "script",
                                               script.model_dump(mode="json", exclude_none=True))
            elif stage == "scene-spec":
                knowledge = knowledge or _load("knowledge", Knowledge)
                curriculum = curriculum or _load("curriculum", Curriculum)
                script = script or _load("script", Script)
                scene_specs = await run_visual_director(project, knowledge, curriculum,
                                                        script, cfg.llm, emit)
                last_ref = store.save_artifact(job.project_id, "scene-spec",
                                               [s.model_dump(mode="json", exclude_none=True) for s in scene_specs])
            elif stage == "voice":
                script = script or _load("script", Script)
                voice_track = await run_voice(project, script, cfg.tts, emit)
                last_ref = store.save_artifact(job.project_id, "voice-track",
                                               voice_track.model_dump(mode="json", exclude_none=True))
            elif stage == "timeline":
                curriculum = curriculum or _load("curriculum", Curriculum)
                script = script or _load("script", Script)
                scene_specs = scene_specs or _load("scene-spec", SceneSpec)
                voice_track = voice_track or _load("voice-track", VoiceTrack)
                timeline = solve_timeline(project, curriculum, script, scene_specs, voice_track)
                last_ref = store.save_artifact(job.project_id, "timeline",
                                               timeline.model_dump(mode="json", exclude_none=True))
            elif stage == "render":
                await emit("render.started", "开始渲染（Node/Remotion）")
                artifact = await render_project(job.project_id)
                last_ref = store.save_artifact(job.project_id, "render", artifact)
                await emit("render.completed", "渲染完成", {"artifact": artifact})

            if last_ref:
                await emit("artifact.saved", f"已保存 {last_ref['kind']} v{last_ref['version']}",
                           {"stage": stage}, artifact_ref=last_ref)

            await emit("stage.completed", f"完成：{stage}", {"stage": stage})

        job.artifact_ref = last_ref
        job.status = "succeeded"
        job.updated_at = store.now_iso()
        await emit("job.completed", "任务完成")
    except Exception as e:  # noqa: BLE001
        job.status = "failed"
        job.error_message = str(e) or "未知错误"
        job.updated_at = store.now_iso()
        await manager.emit(job, "job.failed", f"任务失败：{job.error_message}")
    finally:
        for q in list(manager.subscribers.get(job.project_id, set())):
            q.put_nowait({"type": "job.settled", "jobId": job.id, "status": job.status})


def start_job(project_id: str, kind: str, options: dict | None = None,
              stages_override: list[str] | None = None) -> Job:
    stages = stages_override if stages_override is not None else JOB_KIND_TO_STAGES.get(kind, [])
    job = manager.create_job(project_id, kind, stages, options)
    asyncio.create_task(_run_job(job))
    return job
