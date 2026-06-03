# Mindreel

[English](README.en.md) · 简体中文

给一个主题，自动做出一段带配音和动画的中文知识讲解视频。

你只需要输入主题，剩下的查资料、列大纲、写旁白、画分镜、配音、对齐、渲染都由它完成。最后得到一个 MP4，以及一份能在浏览器里直接点开播放的网页课件。

## 有什么不一样

- **画面跟着主题走，不是套模板。** 系统会判断主题属于哪个领域，让模型为每个场景现写画面：算法配代码和数组、网络配时序图、数学配公式和几何图。
- **旁白和画面逐句对齐。** 讲到第几句，画面就停在第几步，不是音画各走各的。
- **一次生成，两种产物。** 既有 MP4，也有一份可点击、可翻页、可离线分享的网页课件。
- **配色可换。** 内置几套视觉主题，已生成的项目也能直接换肤。


## 效果

下面是以「两数之和（双指针）」为主题自动生成的几帧画面。代码、数组、指针和实时计算在同一屏里推进，旁白讲到哪一步，画面就停在哪一步。系统会按主题领域选表现方式：算法用代码和数组，网络协议用时序图，数学用公式和几何图，而不是套同一个模板。

| 初始化 | 运行演示（代码 + 指针 + 实时计算）| 复杂度对比 |
|---|---|---|
| ![](examples/screenshots/two-pointer-1-init.png) | ![](examples/screenshots/two-pointer-2-run.png) | ![](examples/screenshots/two-pointer-3-compare.png) |

不想装环境也可以先看效果：下载 [`examples/two-pointer-deck.html`](examples/two-pointer-deck.html)，浏览器打开即可逐句播放——这就是上面说的「网页课件」。

> 目前算法、网络两类主题实测较充分；数学、物理、生物、历史、经济等领域已内置对应的画面引导，但效果取决于所用模型、尚未逐一验证，欢迎试用反馈。

## 运行

### 用 Docker（本机只需装 Docker）

```bash
git clone https://github.com/sxxss/mindreel.git
cd mindreel
docker compose up -d
```

镜像里已经包含 Node、Chromium（渲染用）、ffmpeg 和中文字体，本机不必另外安装。启动后打开 http://localhost:5173 。

### 本地开发

后端是 Python（FastAPI），视频渲染仍由 Node/Remotion 负责，前端是 React。
需要 Python 3.11+、Node 22+、pnpm 11+、ffmpeg。

```bash
pnpm install                       # 前端 / 渲染依赖
python -m venv server/.venv && source server/.venv/bin/activate
pip install -r server/requirements.txt

pnpm dev:api      # 起 Python API(4123)
pnpm dev:web      # 起 Web(5173)
```

## 配置模型

项目本身不绑定任何 LLM 或 TTS，需要你在 `/providers` 页面填上自己的服务。页面提供了一键预设，点一下会自动填好 Base URL 和模型名，再补上 API Key 即可。

**LLM**（任选其一）：

- DeepSeek：便宜，质量不错，推荐。
- 通义千问 / OpenAI / 其它任何 OpenAI 兼容接口。
- Ollama：本机跑开源模型，免费。

**TTS**（任选其一）：

- OpenAI TTS：官方接口，稳定。
- 自建 TTS：任何兼容 `/v1/audio/speech` 的服务都行。

> 用 Docker 时注意：容器里的 `localhost` 指容器自己。要访问宿主机上的服务（比如本机的 Ollama），地址用 `http://host.docker.internal:<端口>`。

## 工作原理

![系统架构](docs/images/architecture.png)

前端把请求发给 Python（FastAPI）后端，后端异步跑生成流水线、用 SSE 把进度推回前端。每个阶段调用 LLM 或 TTS（你配置的外部服务），产物按版本号存在本地文件里。视频渲染交给 Node/Remotion（后端以子进程方式调用，两边共享同一份 `data/`）。

生成流程分为这几步，每一步的产物都会落盘，改动其中一步只需重跑它之后的阶段：

![生成流水线](docs/images/pipeline.png)

分镜这一步比较特别：不是套固定模板，而是让模型根据主题领域，直接为每个场景写一段自包含的 HTML 动画。时间线这一步会用配音的真实时长，把画面切换和旁白逐句对齐。

更详细的设计说明见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 项目结构

```
server/         Python 后端（FastAPI）
  app/agents/   各阶段 Agent（research/curriculum/script/visual-director/voice）+ 时间线求解
  app/          流水线编排、任务/事件、provider、存储、渲染桥接、API 入口
apps/
  web/          前端工作台（React + Vite + Tailwind）
  render/       视频渲染 + 网页版导出（Remotion / Node，由后端子进程调用）
packages/
  shared/       跨端的类型与校验（Zod，前端共用）
  scenes/       场景模板（Remotion 组件）
```

## 开发常用命令

```bash
pnpm dev:api      # 起 Python API（需先装好 server 依赖）
pnpm dev:web      # 起 Web
pnpm typecheck    # 前端 / 渲染 / 共享包类型检查
pnpm build        # 构建前端
```

## 已知限制

- 生成质量随模型波动。同一主题每次结果不完全一样，偶尔某个场景排版不理想。已经做了失败重试和兜底，不会让整片失败，但不保证每一帧都完美。
- 生成较慢，且云端模型按量计费。完整一条视频要调用多次模型。用 Ollama 可以零成本，但更慢。
- 模型越强，旁白和画面的质量越好。

欢迎一起改进，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 依赖与许可

本项目代码以 [MIT](LICENSE) 开源（© 2026 baba）。但有一个依赖的授权需要留意：

- **视频渲染基于 [Remotion](https://www.remotion.dev/)**，它有自己的许可条款——个人和小团队免费，达到一定规模的公司商用需要购买 Remotion 许可。**商用前请先阅读 Remotion 的 License。** 这与本项目的 MIT 许可相互独立。

其余依赖均为常见的 MIT / Apache 等宽松许可。LLM 与 TTS 由你自行接入；生成的视频内容由你输入的主题与所用模型决定，请自行确认其合规性。
