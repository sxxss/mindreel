# Mindreel

English · [简体中文](README.md)

Give it a topic, get back a narrated, animated explainer video.

You type a topic (e.g. "two pointers", "TCP handshake", "Fourier transform"); it does the rest — research, outline, script, scene design, voiceover, alignment, and rendering. You get an MP4, plus an interactive web deck you can open and play right in the browser.

## What's different

- **Visuals follow the topic, not a fixed template.** It detects the topic's domain and has the model author each scene's visuals: code and arrays for algorithms, sequence diagrams for networking, formulas and geometry for math.
- **Narration and visuals are aligned sentence by sentence.** The picture stops on the step the narration is talking about — audio and video don't drift apart.
- **One run, two outputs.** An MP4, and an interactive web deck you can click through, page, and share offline.
- **Switchable themes.** A few built-in visual themes; already-generated projects can be re-skinned without regenerating.

> Early stage (v0.x): the full pipeline works end to end, but output quality varies with the model you use. See "Known limitations" below.

## Demo

A few auto-generated frames for the topic "two sum (two pointers)". Code, the array, the pointers, and live computation move together on one screen, and the picture follows the narration.

| Setup | Walkthrough (code + pointers + live compute) | Complexity comparison |
|---|---|---|
| ![](examples/screenshots/two-pointer-1-init.png) | ![](examples/screenshots/two-pointer-2-run.png) | ![](examples/screenshots/two-pointer-3-compare.png) |

Prefer to look before installing anything: download [`examples/two-pointer-deck.html`](examples/two-pointer-deck.html) and open it in a browser to play it sentence by sentence — that's the "web deck" output.

> The algorithm and networking domains are the most tested. Math, physics, biology, history, economics, etc. have built-in visual guidance but are not individually verified yet — feedback welcome.

## Run

### With Docker (only Docker required locally)

```bash
git clone https://github.com/sxxss/mindreel.git
cd mindreel
docker compose up -d
```

The image already includes Node, Chromium (for rendering), ffmpeg, and CJK fonts, so you don't install those yourself. Open http://localhost:5173 .

### Local development

Requires Node 22+ and pnpm 11+.

```bash
pnpm install
pnpm dev          # starts API (4123) and Web (5173)
```

## Configure models

Mindreel doesn't bundle any LLM or TTS — you point it at your own services on the `/providers` page. There are one-click presets that fill in the Base URL and model; you just add your API key.

**LLM** (pick one):

- DeepSeek: cheap, decent quality, recommended.
- Qwen / OpenAI / any OpenAI-compatible endpoint.
- Ollama: run an open model locally, free.

**TTS** (pick one):

- OpenAI TTS: official, stable.
- Self-hosted: any service compatible with `/v1/audio/speech`.

> With Docker: `localhost` inside a container refers to the container itself. To reach a service on the host (e.g. a local Ollama), use `http://host.docker.internal:<port>`.

## How it works

![Architecture](docs/images/architecture.png)

The web app calls the Python (FastAPI) backend; the backend runs the generation pipeline asynchronously and streams progress back over SSE. Each stage calls your configured LLM or TTS, and artifacts are saved to local files by version. Rendering is handled by Node/Remotion, which the backend invokes as a subprocess — both sides share the same `data/`.

The pipeline has these stages; every stage's output is persisted, so changing one stage only requires re-running the stages after it:

![Pipeline](docs/images/pipeline.png)

Scene design is the distinctive step: instead of a fixed template, the model writes a self-contained HTML animation for each scene based on the topic's domain. The timeline step uses the real duration of the voiceover to align picture changes to the narration, sentence by sentence.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for more.

## Layout

```
server/         Python backend (FastAPI)
  app/agents/   Per-stage agents (research/curriculum/script/visual-director/voice) + timeline solver
  app/          Pipeline orchestration, jobs/events, providers, storage, render bridge, API
apps/
  web/          Studio frontend (React + Vite + Tailwind)
  render/       Video rendering + web-deck export (Remotion / Node, called by the backend)
packages/
  shared/       Shared types and validation (Zod, used by the frontend too)
  scenes/       Scene templates (Remotion components)
```

## Common commands

```bash
pnpm dev          # API + Web
pnpm test         # tests
pnpm typecheck    # type check
pnpm build        # build
```

## Known limitations

- Output quality varies with the model. The same topic won't produce identical results twice, and occasionally a scene's layout isn't ideal. There's retry and fallback so a single bad scene won't fail the whole video, but not every frame is guaranteed perfect.
- Generation is slow and cloud models are billed per use — a full video makes several model calls. Ollama is free but slower.
- Stronger models give better narration and visuals.

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Dependencies and license

This project's code is [MIT](LICENSE) licensed (© 2026 baba). One dependency's license is worth noting:

- **Rendering uses [Remotion](https://www.remotion.dev/)**, which has its own license — free for individuals and small teams, but companies above a certain size need a paid Remotion license for commercial use. **Check Remotion's license before commercial use.** This is independent of this project's MIT license.

Other dependencies use common permissive licenses (MIT / Apache). You bring your own LLM and TTS; the generated content depends on your topic and chosen model, so verify its compliance yourself.
