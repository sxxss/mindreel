#!/bin/sh
# Docker 首启时，若没有 providers.json 就写一份「待配置」骨架（不绑定任何服务、不使用占位）。
#  - LLM：给一个本机 Ollama 默认（零成本），想用云端在 /providers 改即可。
#  - TTS：留空待配置，请到 /providers 用「一键预设」选 OpenAI TTS 或填你自己的兼容服务。
# 已存在则不动用户的配置。
set -e

DATA_DIR="${AUTO_DATA_DIR:-/app/data}"
PROVIDERS="$DATA_DIR/providers.json"
mkdir -p "$DATA_DIR/projects"

if [ ! -f "$PROVIDERS" ]; then
  echo "[entrypoint] 首次启动：写入待配置 providers.json（请到 /providers 配置 LLM 与 TTS）"
  cat > "$PROVIDERS" <<'JSON'
{
  "llm": {
    "provider": "openai-compatible",
    "baseUrl": "http://host.docker.internal:11434/v1",
    "apiKey": "ollama",
    "model": "qwen2.5",
    "note": "默认指向本机 Ollama（零成本）。用 DeepSeek/通义/OpenAI 请在 /providers 改 baseUrl/apiKey/model。"
  },
  "tts": {
    "provider": "openai-compatible",
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "note": "TTS 待配置：到 /providers 选 OpenAI TTS（填 baseUrl=https://api.openai.com/v1 + API Key），或填你自己的兼容服务。"
  },
  "image": { "provider": "disabled" },
  "video": { "provider": "disabled" },
  "factCheck": { "provider": "disabled" }
}
JSON
fi

exec "$@"
