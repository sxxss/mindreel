# Mindreel API（Python / FastAPI）+ Node/Remotion 渲染。
#
# 这是混合架构：Python 跑 API/agents/编排，视频渲染仍交给 Node + Remotion
# （render_bridge 以子进程方式调用 `pnpm -F @auto/render render`）。
# 因此镜像里同时需要：Python、Node + pnpm、Remotion 的无头 Chrome 运行库 + 中文字体 + ffmpeg。
# 必须用 Debian 基础镜像：Remotion 的无头 Chrome 在 Alpine(musl) 上跑不起来。
FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate
WORKDIR /app

# Remotion 无头 Chrome 在 Linux 上需要的系统库 + 中文/emoji 字体 + Python + ffmpeg。
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libgbm1 libasound2 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libxkbcommon0 libpango-1.0-0 libcairo2 \
    fonts-noto-cjk fonts-noto-color-emoji \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── 依赖层（利用缓存：先只拷 manifest）─────────────────────────────────────────
FROM base AS deps
# 渲染 workspace 需要的 Node 依赖（--frozen-lockfile 需校验全部成员的 manifest）。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/render/package.json apps/render/
COPY packages/scenes/package.json packages/scenes/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# Python 依赖装进独立 venv。
COPY server/requirements.txt server/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r server/requirements.txt

# 预拉 Remotion 的无头 Chrome（放在依赖层：只依赖 node_modules 里的 remotion，
# 不依赖应用源码，这样改业务代码时这一步还能命中缓存，重建快很多）。
RUN pnpm --filter @auto/render exec remotion browser ensure || true

# ── 运行层 ─────────────────────────────────────────────────────────────────────
FROM deps AS runner
COPY . .

ENV PATH="/opt/venv/bin:$PATH"
ENV AUTO_API_HOST=0.0.0.0
ENV AUTO_API_PORT=4123
ENV AUTO_DATA_DIR=/app/data
EXPOSE 4123

RUN chmod +x server/docker-entrypoint.sh
ENTRYPOINT ["server/docker-entrypoint.sh"]
# --app-dir server 让 uvicorn 找到 server/app/main.py；repo 根仍是 /app（渲染子进程的 cwd）。
CMD ["uvicorn", "app.main:app", "--app-dir", "server", "--host", "0.0.0.0", "--port", "4123"]
