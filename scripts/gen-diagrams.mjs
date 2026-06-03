// 生成文档用的架构图 SVG（再用 macOS qlmanage 转 PNG）。
// 设计成方形画布，避免 qlmanage 方形缩略图留白。
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = new URL("../docs/images/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = {
  bg: "#0e1430",
  panel: "#172a55",
  panel2: "#13234a",
  stroke: "#34d8ef",
  ink: "#eaf2ff",
  muted: "#9fb0c9",
  orange: "#ffb24d",
  green: "#3ddc97",
  pink: "#f472d0",
  line: "#5b6f96",
};

const FONT = "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function box(x, y, w, h, title, sub, opts = {}) {
  const stroke = opts.stroke ?? C.stroke;
  const fill = opts.fill ?? C.panel;
  const dash = opts.dash ? `stroke-dasharray="7 6"` : "";
  const titleColor = opts.titleColor ?? C.ink;
  let t = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${fill}" stroke="${stroke}" stroke-width="2.5" ${dash}/>`;
  const cx = x + w / 2;
  if (sub) {
    t += `<text x="${cx}" y="${y + h / 2 - 6}" fill="${titleColor}" font-size="30" font-weight="700" font-family="${FONT}" text-anchor="middle">${esc(title)}</text>`;
    t += `<text x="${cx}" y="${y + h / 2 + 30}" fill="${C.muted}" font-size="21" font-family="${FONT}" text-anchor="middle">${esc(sub)}</text>`;
  } else {
    t += `<text x="${cx}" y="${y + h / 2 + 10}" fill="${titleColor}" font-size="30" font-weight="700" font-family="${FONT}" text-anchor="middle">${esc(title)}</text>`;
  }
  return t;
}

function arrow(x1, y1, x2, y2, label, opts = {}) {
  const color = opts.color ?? C.line;
  let t = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" marker-end="url(#arrow)"/>`;
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    t += `<rect x="${mx - label.length * 7 - 8}" y="${my - 16}" width="${label.length * 14 + 16}" height="26" rx="6" fill="${C.bg}"/>`;
    t += `<text x="${mx}" y="${my + 3}" fill="${C.muted}" font-size="18" font-family="${FONT}" text-anchor="middle">${esc(label)}</text>`;
  }
  return t;
}

function svgWrap(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/>
  </marker>
</defs>
<rect width="${w}" height="${h}" fill="${C.bg}"/>
${inner}
</svg>`;
}

// ── 图 1：系统架构（方形 1280×1280）──────────────────────────────────────────
function architecture() {
  const W = 1280;
  let s = "";
  s += `<text x="${W / 2}" y="96" fill="${C.ink}" font-size="42" font-weight="800" font-family="${FONT}" text-anchor="middle">Mindreel · 系统架构</text>`;

  // 前端
  s += box(390, 170, 500, 100, "前端工作台", "apps/web · React + Vite", { fill: C.panel2 });
  s += arrow(640, 270, 640, 366, "HTTP / 事件流");

  // API 中枢
  s += box(340, 372, 600, 104, "API 服务 + 流水线", "server · Python / FastAPI", {});

  // 三个核心
  s += arrow(470, 476, 300, 612);
  s += arrow(640, 476, 640, 612);
  s += arrow(810, 476, 980, 612);
  s += box(110, 618, 380, 104, "各阶段 Agent", "server/app/agents", {});
  s += box(520, 618, 240, 104, "视频渲染", "apps/render · Remotion", {});
  s += box(790, 618, 380, 104, "本地存储", "data/projects/<id>", { stroke: C.muted, fill: C.panel2 });
  s += `<text x="980" y="760" fill="${C.muted}" font-size="20" font-family="${FONT}" text-anchor="middle">各阶段产物按版本落盘</text>`;

  // 外部 provider（从后端下来）
  s += arrow(220, 722, 220, 866);
  s += arrow(380, 722, 380, 866);
  s += box(110, 872, 170, 100, "LLM", "DeepSeek / Qwen", { stroke: C.green, dash: true, fill: C.panel2 });
  s += box(300, 872, 190, 100, "TTS", "OpenAI / 自建", { stroke: C.green, dash: true, fill: C.panel2 });
  s += `<text x="300" y="1018" fill="${C.muted}" font-size="21" font-family="${FONT}" text-anchor="middle">外部接口 · 由用户自行配置（OpenAI 兼容）</text>`;

  // 渲染产物（从 render 下来）
  s += arrow(640, 722, 640, 866);
  s += box(520, 872, 240, 100, "MP4 / 网页课件", "两种产物", { stroke: C.orange, fill: C.panel2 });
  s += `<text x="640" y="1018" fill="${C.muted}" font-size="21" font-family="${FONT}" text-anchor="middle">一次生成，两种产物</text>`;

  // 底部说明
  s += `<text x="${W / 2}" y="1170" fill="${C.muted}" font-size="23" font-family="${FONT}" text-anchor="middle">本地优先：进程内任务 + 文件存储，不依赖 Postgres / Redis</text>`;

  writeFileSync(new URL("architecture.svg", OUT), svgWrap(W, 1280, s));
  console.log("architecture.svg");
}

// ── 图 2：生成流水线（方形 1280×1280，竖向）─────────────────────────────────
function pipeline() {
  const W = 1280;
  const stages = [
    ["研究", "research · 提炼事实/术语/误区", C.stroke],
    ["课程大纲", "curriculum · 切分章节", C.stroke],
    ["旁白脚本", "script · 逐句 beat", C.stroke],
    ["分镜", "scene-spec · 按主题域写动画", C.orange],
    ["配音", "voice · TTS 逐句合成", C.pink],
    ["时间线", "timeline · 音画帧级对齐", C.stroke],
    ["渲染", "render · Remotion → MP4", C.green],
  ];
  let s = "";
  s += `<text x="${W / 2}" y="68" fill="${C.ink}" font-size="40" font-weight="800" font-family="${FONT}" text-anchor="middle">Mindreel · 生成流水线</text>`;

  const bw = 620;
  const bh = 92;
  const x = (W - bw) / 2;
  let y = 120;
  const gap = 64;
  stages.forEach((st, i) => {
    s += box(x, y, bw, bh, st[0], st[1], { stroke: st[2] });
    if (i < stages.length - 1) s += arrow(W / 2, y + bh, W / 2, y + bh + gap - 4);
    y += bh + gap;
  });

  // 旁注：分镜与配音并行
  s += `<text x="${x - 30}" y="${120 + 3 * (bh + gap) + 56}" fill="${C.muted}" font-size="19" font-family="${FONT}" text-anchor="end">分镜与</text>`;
  s += `<text x="${x + bw + 30}" y="${120 + 3 * (bh + gap) + 56}" fill="${C.muted}" font-size="19" font-family="${FONT}" text-anchor="start">配音并行</text>`;

  // 审校循环说明
  s += `<text x="${W / 2}" y="${y + 10}" fill="${C.muted}" font-size="22" font-family="${FONT}" text-anchor="middle">每个阶段：Agent 产出 → 审校（Critic）→ 不达标自动修订 → 落盘</text>`;

  writeFileSync(new URL("pipeline.svg", OUT), svgWrap(W, 1280, s));
  console.log("pipeline.svg");
}

architecture();
pipeline();
