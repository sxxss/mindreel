"""Pydantic 数据模型与校验。

部分字段名使用连字符（如 scene-spec），
这样写出的 artifact JSON 能被 Node 渲染工程直接读取。
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# ── 通用 ──────────────────────────────────────────────────────────────────────
ChapterKind = Literal["hook", "concept", "derivation", "example", "recap"]
ProjectStatus = Literal["draft", "active", "archived"]
ThemeId = Literal["deep-space", "aurora", "sunset", "mono"]
DEFAULT_THEME: ThemeId = "deep-space"

SceneTemplateId = Literal[
    "TitleHook", "NumberLine", "CartesianPlane", "GraphNetwork", "FormulaWalk",
    "ProcessSteps", "CompareTwoCol", "CodeFocus", "PointerArray", "HtmlSlide",
    "Recap", "Outro",
]
AnimationOpKind = Literal["enter", "exit", "move", "morph", "highlight", "trace", "annotate"]
CameraMode = Literal["focus", "zoom", "pan"]


# ── knowledge ─────────────────────────────────────────────────────────────────
class KnowledgeFact(BaseModel):
    id: str
    claim: str = Field(max_length=50)
    evidence: str
    sourceIds: list[str] = []


class KnowledgeTerm(BaseModel):
    id: str
    term: str
    definition: str


class Knowledge(BaseModel):
    facts: list[KnowledgeFact]
    terms: list[KnowledgeTerm]
    misconceptions: list[str]


# ── curriculum ────────────────────────────────────────────────────────────────
class Chapter(BaseModel):
    id: str
    title: str
    learningGoal: str
    expectedSeconds: int
    kind: ChapterKind


class Curriculum(BaseModel):
    title: str
    objective: str
    prerequisites: list[str] = []
    chapters: list[Chapter]


# ── script ────────────────────────────────────────────────────────────────────
class ScriptBeat(BaseModel):
    id: str
    text: str
    notes: str = ""
    pauseAfterMs: int = 0
    emphasisTerms: list[str] = []


class ScriptSegment(BaseModel):
    chapterId: str
    beats: list[ScriptBeat]


class Script(BaseModel):
    segments: list[ScriptSegment]


# ── scene-spec ────────────────────────────────────────────────────────────────
class AnimationOp(BaseModel):
    id: str
    kind: AnimationOpKind
    targetRef: str
    fromState: Optional[dict[str, Any]] = None
    toState: Optional[dict[str, Any]] = None
    ease: str = "easeInOut"
    durationMs: int = 600


class Shot(BaseModel):
    id: str
    beatRefs: list[str]
    anchorTimeMs: int = 0
    durationMs: int
    camera: CameraMode = "focus"
    animationOps: list[AnimationOp]


class SceneSpec(BaseModel):
    chapterId: str
    sceneId: str
    templateId: SceneTemplateId
    props: dict[str, Any]
    shots: list[Shot]


# ── voice-track ───────────────────────────────────────────────────────────────
class VoiceCue(BaseModel):
    beatId: str
    audioPath: str
    actualDurationMs: int
    provider: str
    voice: str
    mimeType: str


class VoiceTrack(BaseModel):
    cues: list[VoiceCue]


# ── timeline ──────────────────────────────────────────────────────────────────
class SubtitleCue(BaseModel):
    beatId: str
    text: str
    startMs: int
    endMs: int


class TimelineAnimation(BaseModel):
    id: str
    kind: AnimationOpKind
    targetRef: str
    startMs: int
    endMs: int
    squeezeFactor: Optional[float] = None


class TimelineShot(BaseModel):
    shotId: str
    startMs: int
    endMs: int
    animations: list[TimelineAnimation]
    subtitleCues: list[SubtitleCue]


class TimelineScene(BaseModel):
    sceneId: str
    startMs: int
    endMs: int
    shots: list[TimelineShot]


class TimelineWarning(BaseModel):
    code: Literal["scene-duration-drift", "animation-overflow", "project-duration-drift"]
    message: str
    sceneId: Optional[str] = None
    shotId: Optional[str] = None


class Timeline(BaseModel):
    durationMs: int
    scenes: list[TimelineScene]
    warnings: list[TimelineWarning] = []


# ── source / project ──────────────────────────────────────────────────────────
class SourceDocument(BaseModel):
    id: str
    kind: Literal["text", "markdown", "url"]
    title: str
    body: str
    digest: str
    createdAt: str
    url: Optional[str] = None


class ArtifactRef(BaseModel):
    kind: str
    version: int
    createdAt: str
    createdBy: Optional[str] = None


class Project(BaseModel):
    id: str
    title: str
    topic: str
    audience: str
    durationTargetSeconds: int = Field(ge=60, le=240)
    language: Literal["zh-CN"] = "zh-CN"
    theme: ThemeId = DEFAULT_THEME
    sources: list[SourceDocument] = []
    createdAt: str
    updatedAt: str
    status: ProjectStatus = "draft"
    latestArtifacts: dict[str, ArtifactRef] = {}


class CreateProjectInput(BaseModel):
    title: str
    topic: str
    audience: str
    durationTargetSeconds: int = Field(ge=60, le=240)
    language: Literal["zh-CN"] = "zh-CN"
    theme: Optional[ThemeId] = None


class UpdateProjectInput(BaseModel):
    title: Optional[str] = None
    topic: Optional[str] = None
    audience: Optional[str] = None
    durationTargetSeconds: Optional[int] = Field(default=None, ge=60, le=240)
    theme: Optional[ThemeId] = None
    status: Optional[ProjectStatus] = None


class AppendSourceInput(BaseModel):
    kind: Literal["text", "markdown", "url"]
    title: str
    body: str
    url: Optional[str] = None


# ── provider 配置 ─────────────────────────────────────────────────────────────
class ProviderEntry(BaseModel):
    provider: str = "openai-compatible"
    baseUrl: Optional[str] = None
    apiKey: Optional[str] = None
    model: Optional[str] = None
    voice: Optional[str] = None
    note: Optional[str] = None

    model_config = {"extra": "allow"}


class ProviderConfig(BaseModel):
    llm: ProviderEntry = ProviderEntry()
    tts: ProviderEntry = ProviderEntry()
    image: ProviderEntry = ProviderEntry(provider="disabled")
    video: ProviderEntry = ProviderEntry(provider="disabled")
    factCheck: ProviderEntry = ProviderEntry(provider="disabled")
