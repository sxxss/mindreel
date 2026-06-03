# 贡献指南

这是个早期阶段的项目，欢迎 PR 和 Issue。

## 开发环境

后端是 Python（FastAPI），渲染仍由 Node/Remotion 负责，前端是 React。
需要 Python 3.11+、Node 22+、pnpm 11+、ffmpeg。

```bash
pnpm install                       # 装前端 / 渲染依赖
python -m venv server/.venv && source server/.venv/bin/activate
pip install -r server/requirements.txt

pnpm dev:api                       # 起 Python API(4123)
pnpm dev:web                       # 起 Web(5173)
```

配置模型见 [README](README.md) 的「配置模型」：在 `/providers` 填入你自己的 LLM 与 TTS（任何 OpenAI 兼容接口）。

## 提交前

```bash
# 后端（Python）
cd server && pip install -r requirements-dev.txt
ruff check app tests && pytest

# 前端 / 渲染 / 共享包（TS）
pnpm typecheck
```

CI 会自动跑这两套检查（见 `.github/workflows/ci.yml`）。

几点约定：

- TypeScript 严格模式，别引入类型错误。
- 前端单个 `.tsx` 文件控制在 250 行以内（有测试会检查），太大就拆组件。
- 别提交密钥，`providers.json` 和 `.env` 已经在 `.gitignore` 里。
- 提交信息说清做了什么、为什么。

## 适合上手的地方

- 给某个主题领域加更合适的画面形式：`server/app/agents/visual_director.py`。
- 加或改视觉主题配色：`packages/shared/src/html-slide-theme.ts`。
- 接入新的 LLM / TTS：都是 OpenAI 兼容接口，多数情况改配置就行。
- 修生成视频时遇到的画面、排版问题——这类最实用。

## 提 Issue

附上主题、用的 LLM / TTS、复现步骤。画面问题贴张截图最有帮助。
