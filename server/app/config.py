"""应用配置。环境变量前缀 AUTO_。"""
from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

# monorepo 根（server/ 的上一级）。数据目录默认锚定到这里，
# 这样无论从哪个工作目录启动 uvicorn 都能找到同一份 data/。
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AUTO_", env_file=".env", extra="ignore")

    api_port: int = 4123
    api_host: str = "127.0.0.1"
    # 默认指向 monorepo 根的 data/；可用 AUTO_DATA_DIR 覆盖（Docker 里会设）。
    data_dir: Path = REPO_ROOT / "data"
    # 可用 AUTO_PROVIDERS_PATH 覆盖；不设则取 data_dir/providers.json
    providers_path: Optional[Path] = None
    # mock：占位/离线；configured：用 /providers 配置的真实模型
    provider_mode: Literal["mock", "configured"] = "configured"
    worker_enabled: bool = True
    # Node/Remotion 渲染服务：仍由 Node 子进程负责（见 render_bridge.py）。
    repo_root: Path = REPO_ROOT

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def providers_file(self) -> Path:
        return self.providers_path or (self.data_dir / "providers.json")


settings = Settings()
