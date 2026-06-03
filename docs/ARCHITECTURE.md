# 架构说明

这份文档讲清 Mindreel 是怎么把一个主题变成视频的，以及代码是怎么分层的。

## 系统结构

![系统架构](images/architecture.png)

几个要点：

- 本地优先。生成任务在后端进程内异步执行、用本地文件存产物，不需要 Postgres、Redis 或对象存储。
- 不绑定模型。LLM 和 TTS 都由用户在 `/providers` 自行配置，走 OpenAI 兼容接口。
- 后端是 Python（FastAPI）；渲染交给 Node/Remotion，由后端以子进程方式调用，所以运行环境需要 Chromium。

前端发请求给后端，后端异步跑流水线、用 SSE 把进度推回前端。执行过程中调用外部的 LLM / TTS，产物落到 `data/projects/<id>` 下。

## 生成流水线

![生成流水线](images/pipeline.png)

每个阶段做的事：

| 阶段 | 产物 | 说明 |
|---|---|---|
| research | knowledge | 从主题和资料里提炼事实、术语、常见误区 |
| curriculum | curriculum | 切分成钩子 / 概念 / 推导 / 例子 / 小结几类章节 |
| script | script | 逐章写口播，每句是一个 beat（4–6 秒）|
| scene-spec | scene-spec | 按主题领域，让模型为每个场景现写一段 HTML 动画 |
| voice | voice-track | 每个 beat 调 TTS 合成音频，并记录真实时长 |
| timeline | timeline | 用音频真实时长，把画面步骤和旁白逐句对齐 |
| render | render | 渲染成 MP4 |

每个阶段的产物都带版本号存盘。改了某一步，只需要重跑它下游的阶段，不必从头再来。

部分阶段带校验/重试：Agent 产出结果后先按 schema 与约束校验，不达标就带着意见再生成一轮，通过后才落盘。

## 两种产物

`scene-spec`、`timeline`、`voice-track` 这三样齐了之后，可以产出两种东西：

- MP4 视频：用 Remotion 渲染，用于发布。
- 网页课件：`GET /api/projects/:id/export/web`，把画面和音频打包进一个 HTML 文件，音频以 base64 内嵌。这个文件单独拿出来用浏览器打开就能逐句播放、键盘翻页，适合分享或嵌进文档。

两者画面同源，所以表现一致。

## 仓库结构

```
server/         Python 后端（FastAPI）
  app/agents/   各阶段 Agent（research/curriculum/script/visual-director/voice）+ 时间线求解
  app/          流水线编排、任务与事件流、provider、存储、渲染桥接、API 入口
apps/
  web/          前端工作台（React + Vite + Tailwind）
  render/       渲染工程 + 网页版导出（Remotion / Node，由后端子进程调用）
packages/
  shared/       跨端的类型与校验（Zod），也放视觉主题定义
  scenes/       可组合的场景模板（Remotion 组件）
docs/
  ARCHITECTURE.md   本文件
examples/
  网页课件样例和截图
```

## 数据布局

```
data/projects/<projectId>/
  project.json                  项目信息
  sources/<sourceId>.json       输入资料
  artifacts/<kind>/vNNNN.json   各阶段产物（带版本）
  audio/<beatId>.mp3            逐句配音
  renders/<timestamp>.mp4       渲染成片
data/providers.json             模型配置（不进仓库）
```

## 几个设计取舍

- 分镜不用固定模板，而是让模型为每个场景现写 HTML。这样不同主题能有不同的画面形式，代价是输出可能不合规，所以加了重试和兜底。
- 画面切换跟着配音的真实时长走，而不是平均分配时间，这样旁白讲到哪、画面就停在哪。
- 视觉主题用 CSS 变量定义。换主题等于换一组变量值，连已经生成的旧项目也能直接换配色，不必重新生成。

想动手改的话，入口见 [CONTRIBUTING.md](../CONTRIBUTING.md)。
