"""基于本地文件的存储。

目录布局保证 Node 渲染工程能读同一份 data/：
  data/projects/<id>/project.json
  data/projects/<id>/artifacts/<kind>/vNNNN.json
  data/projects/<id>/audio/<beatId>.mp3
  data/providers.json
"""
from __future__ import annotations

import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import settings
from .models import AppSettings, ArtifactRef, Project, ProviderConfig

ARTIFACT_KINDS = [
    "knowledge", "curriculum", "script", "scene-spec",
    "voice-track", "timeline", "render", "qa-report",
]
_LATEST_KEY = {"qa-report": "qaReport"}  # latestArtifacts 里的 key 映射


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def new_id(prefix: str = "project") -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _project_dir(pid: str) -> Path:
    return settings.projects_dir / pid


def _artifact_dir(pid: str, kind: str) -> Path:
    return _project_dir(pid) / "artifacts" / kind


def _write_json_atomic(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ── projects ──────────────────────────────────────────────────────────────────
def list_projects() -> list[Project]:
    base = settings.projects_dir
    if not base.exists():
        return []
    out: list[Project] = []
    for d in base.iterdir():
        pj = d / "project.json"
        if not pj.is_file():
            continue
        try:
            out.append(Project.model_validate_json(pj.read_text(encoding="utf-8")))
        except Exception:  # noqa: BLE001 - 跳过损坏/旧 schema 的 project.json，不让列表整体崩
            continue
    out.sort(key=lambda p: p.updatedAt, reverse=True)
    return out


def get_project(pid: str) -> Project:
    pj = _project_dir(pid) / "project.json"
    if not pj.is_file():
        raise FileNotFoundError(f"project {pid} not found")
    return Project.model_validate_json(pj.read_text(encoding="utf-8"))


def save_project(project: Project) -> Project:
    _write_json_atomic(_project_dir(project.id) / "project.json",
                        project.model_dump(mode="json"))
    return project


# ── artifacts（带版本号）──────────────────────────────────────────────────────
def _next_version(pid: str, kind: str) -> int:
    d = _artifact_dir(pid, kind)
    if not d.exists():
        return 1
    versions = [int(m.group(1)) for f in d.glob("v*.json")
                if (m := re.match(r"v0*(\d+)\.json$", f.name))]
    return (max(versions) + 1) if versions else 1


def save_artifact(pid: str, kind: str, value: Any, created_by: str = "agent") -> dict:
    version = _next_version(pid, kind)
    path = _artifact_dir(pid, kind) / f"v{version:04d}.json"
    # artifact 文件直接存 value（render CLI 读的就是裸 value）
    _write_json_atomic(path, value)
    ref = {"kind": kind, "version": version, "createdAt": now_iso(), "createdBy": created_by}
    project = get_project(pid)
    project.latestArtifacts[_LATEST_KEY.get(kind, kind)] = ArtifactRef(**ref)
    project.updatedAt = now_iso()
    save_project(project)
    return ref


def load_artifact(pid: str, kind: str, version: int | None = None) -> Any:
    d = _artifact_dir(pid, kind)
    if version is None:
        version = _next_version(pid, kind) - 1
    path = d / f"v{version:04d}.json"
    if not path.is_file():
        raise FileNotFoundError(f"artifact {kind} v{version} not found for {pid}")
    return json.loads(path.read_text(encoding="utf-8"))


# ── providers ─────────────────────────────────────────────────────────────────
def load_providers() -> ProviderConfig:
    p = settings.providers_file
    if not p.is_file():
        return ProviderConfig()
    return ProviderConfig.model_validate_json(p.read_text(encoding="utf-8"))


def save_providers(cfg: ProviderConfig) -> ProviderConfig:
    _write_json_atomic(settings.providers_file, cfg.model_dump(mode="json"))
    return cfg


# ── 全局应用设置 ───────────────────────────────────────────────────────────────
def load_app_settings() -> AppSettings:
    p = settings.app_settings_file
    if not p.is_file():
        return AppSettings()
    try:
        return AppSettings.model_validate_json(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 - 配置损坏时回退默认，不让接口整体崩
        return AppSettings()


def save_app_settings(s: AppSettings) -> AppSettings:
    _write_json_atomic(settings.app_settings_file, s.model_dump(mode="json"))
    return s


# ── 工作区统计 ─────────────────────────────────────────────────────────────────
def project_count() -> int:
    base = settings.projects_dir
    if not base.exists():
        return 0
    return sum(1 for d in base.iterdir() if (d / "project.json").is_file())


def storage_bytes() -> int:
    """data/projects 下所有文件占用的字节数（用于设置页展示磁盘占用）。"""
    base = settings.projects_dir
    if not base.exists():
        return 0
    total = 0
    for f in base.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
            except OSError:
                continue
    return total
