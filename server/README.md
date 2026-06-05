# MindReel 服务端（Python / FastAPI）

`server/` 是 MindReel 的后端：负责 API、各阶段 Agent、流水线编排，把每阶段产物写成
`data/` 下的 JSON。视频渲染由 Node 的 Remotion 工程负责（`apps/render`），后端通过子进程
调用它（两边以 `data/projects/<id>/artifacts/*` 的 JSON 为契约）。

## 运行

```bash
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 4123
```

打开 http://127.0.0.1:4123/docs 看自动生成的 API 文档。

## 结构

- `app/config.py` / `app/store.py` / `app/providers.py` / `app/models.py` — 配置、文件存储、
  OpenAI 兼容的 LLM/TTS 客户端、Pydantic 数据模型
- `app/agents/` — 各阶段 Agent（research / curriculum / script / visual-director / voice）+ 时间线求解
- `app/pipeline.py` — 流水线编排、任务与事件流
- `app/render_bridge.py` — 调 Node 渲染 / 网页版导出
- `app/main.py` — FastAPI 入口（项目、生成任务、事件 SSE、媒体、provider 配置）
