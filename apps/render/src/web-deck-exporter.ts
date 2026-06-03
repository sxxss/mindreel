import {
  getHtmlSlideTheme,
  HTML_SLIDE_BASE_CSS,
  htmlSlideStageBackground,
  htmlSlideThemeVars,
  stripNarrationFromHtml,
  type SceneSpecList,
  type Timeline,
  type VoiceTrack,
} from "@auto/shared";

// ── 一张「交互网页」幻灯片：一句旁白(beat) = 一帧，与视频里的分步严格一致 ──────
type DeckSlide = {
  sceneTitle: string;
  chapterId: string;
  html: string;
  caption: string | undefined;
  subtitle: string;
  beatId: string;
  durationMs: number;
  audioDataUri: string | undefined;
};

export type WebDeckInput = {
  projectTitle: string;
  projectTopic: string;
  themeId?: string;
  sceneSpecs: SceneSpecList;
  timeline: Timeline;
  voiceTrack: VoiceTrack;
  // beatId → { base64, mime }
  audioByBeatId: Map<string, { base64: string; mime: string }>;
};

// 与 HtmlSlide.tsx 的 stepStartMsOf 完全一致的反向映射：
// HtmlSlide 中 step s 的起始 beat = floor(s * B / S)。
// 给定 beat 索引 b，返回此刻应显示的 step 索引（最大的 s 使其起始 beat ≤ b）。
function stepForBeat(beatIndex: number, beatCount: number, stepCount: number): number {
  if (stepCount <= 1 || beatCount <= 0) return 0;
  let s = 0;
  while (s + 1 < stepCount && Math.floor(((s + 1) * beatCount) / stepCount) <= beatIndex) {
    s += 1;
  }
  return s;
}

function buildSlides(input: WebDeckInput): DeckSlide[] {
  const specById = new Map(input.sceneSpecs.map((s) => [s.sceneId, s]));
  const durationByBeat = new Map(input.voiceTrack.cues.map((c) => [c.beatId, c.actualDurationMs]));
  const slides: DeckSlide[] = [];

  for (const scene of input.timeline.scenes) {
    const spec = specById.get(scene.sceneId);
    if (spec === undefined || spec.templateId !== "HtmlSlide") continue;

    const props = (spec.props ?? {}) as { title?: string; steps?: Array<{ html?: string; caption?: string }> };
    const steps = Array.isArray(props.steps) ? props.steps : [];
    if (steps.length === 0) continue;

    // 本场景按时间排序的 beat（字幕 cue）
    const cues = scene.shots
      .flatMap((shot) => shot.subtitleCues)
      .slice()
      .sort((a, b) => a.startMs - b.startMs);
    const beatCount = cues.length;

    cues.forEach((cue, beatIndex) => {
      const stepIdx = Math.min(steps.length - 1, stepForBeat(beatIndex, beatCount, steps.length));
      const step = steps[stepIdx];
      const rawHtml = step?.html;
      if (!rawHtml) return;
      // 剔除画面里逐字重复的旁白（避免与底部字幕条重复显示）。
      const html = stripNarrationFromHtml(rawHtml, step?.caption, cue.text);
      const audio = input.audioByBeatId.get(cue.beatId);
      slides.push({
        sceneTitle: props.title ?? scene.sceneId,
        chapterId: spec.chapterId,
        html,
        caption: step?.caption,
        subtitle: cue.text,
        beatId: cue.beatId,
        durationMs: durationByBeat.get(cue.beatId) ?? Math.max(1000, cue.endMs - cue.startMs),
        audioDataUri: audio ? `data:${audio.mime};base64,${audio.base64}` : undefined,
      });
    });
  }

  return slides;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildWebDeck(input: WebDeckInput): string {
  const slides = buildSlides(input);
  const themeTokens = getHtmlSlideTheme(input.themeId);
  const themeVars = htmlSlideThemeVars(themeTokens);
  const rootVars = Object.entries(themeVars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");

  // slides 注入为 JSON（html 是可信的 LLM 产物，与视频同源）
  const slidesJson = JSON.stringify(
    slides.map((s) => ({
      title: s.sceneTitle,
      chapter: s.chapterId,
      html: s.html,
      caption: s.caption ?? "",
      subtitle: s.subtitle,
      duration: s.durationMs,
      audio: s.audioDataUri ?? "",
    })),
  );

  const title = escapeHtml(input.projectTitle || input.projectTopic || "Mindreel Deck");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · 交互课件</title>
<style>
:root{${rootVars}}
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:100%;height:100%;background:#05070d;color:var(--ink);font-family:var(--font-sans);overflow:hidden;}
#app{position:fixed;inset:0;display:flex;flex-direction:column;}
#stage-wrap{position:relative;flex:1;overflow:hidden;}
#stage{position:absolute;top:0;left:0;width:1920px;height:1080px;transform-origin:top left;overflow:hidden;background:${htmlSlideStageBackground(themeTokens)};}
#scene-title{position:absolute;left:80px;top:48px;font-size:40px;font-weight:700;color:var(--ink);opacity:.92;z-index:2;}
#slide{position:absolute;left:64px;right:64px;top:130px;bottom:150px;display:flex;align-items:center;justify-content:center;}
#slide-inner{width:100%;}
#subtitle{position:absolute;left:50%;transform:translateX(-50%);bottom:48px;max-width:1500px;padding:16px 30px;border-radius:14px;background:rgba(5,7,13,.82);border:1px solid var(--grid);color:var(--ink);font-size:26px;text-align:center;z-index:2;}
${HTML_SLIDE_BASE_CSS}
/* 控制条 */
#bar{display:flex;align-items:center;gap:14px;padding:12px 20px;background:#0a0e1c;border-top:1px solid rgba(159,176,201,.18);}
#bar button{cursor:pointer;border:1px solid var(--grid);background:rgba(52,216,239,.08);color:var(--ink);border-radius:10px;height:40px;min-width:44px;padding:0 14px;font-size:16px;transition:.15s;}
#bar button:hover{background:rgba(52,216,239,.2);border-color:var(--cyan);}
#bar button:disabled{opacity:.35;cursor:default;}
#play{background:var(--cyan);color:#05070d;font-weight:700;border-color:var(--cyan);}
#progress{flex:1;height:6px;border-radius:999px;background:rgba(159,176,201,.18);overflow:hidden;cursor:pointer;}
#progress-fill{height:100%;width:0;background:linear-gradient(90deg,var(--cyan),var(--pink));transition:width .2s;}
#counter{font-size:14px;color:var(--muted);min-width:74px;text-align:right;font-variant-numeric:tabular-nums;}
#autoplay-label{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);user-select:none;cursor:pointer;}
#brand{position:fixed;right:16px;top:12px;font-size:12px;color:rgba(159,176,201,.5);z-index:5;letter-spacing:.04em;}
#hint{position:fixed;left:50%;top:14px;transform:translateX(-50%);font-size:12px;color:rgba(159,176,201,.5);z-index:5;}
</style>
</head>
<body>
<div id="brand">由 Mindreel 生成</div>
<div id="hint">← → 翻页 · 空格 播放/暂停</div>
<div id="app">
  <div id="stage-wrap">
    <div id="stage">
      <div id="scene-title"></div>
      <div id="slide"><div id="slide-inner" class="hs-root"></div></div>
      <div id="subtitle"></div>
    </div>
  </div>
  <div id="bar">
    <button id="prev" title="上一步 (←)">←</button>
    <button id="play" title="播放/暂停 (空格)">▶ 播放</button>
    <button id="next" title="下一步 (→)">→</button>
    <div id="progress"><div id="progress-fill"></div></div>
    <span id="counter">0 / 0</span>
    <label id="autoplay-label"><input type="checkbox" id="autoplay" checked> 自动播放</label>
  </div>
</div>
<audio id="audio"></audio>
<script>
const SLIDES = ${slidesJson};
const stage = document.getElementById('stage');
const stageWrap = document.getElementById('stage-wrap');
const slideInner = document.getElementById('slide-inner');
const sceneTitle = document.getElementById('scene-title');
const subtitle = document.getElementById('subtitle');
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const progressFill = document.getElementById('progress-fill');
const progress = document.getElementById('progress');
const counter = document.getElementById('counter');
const autoplayBox = document.getElementById('autoplay');

let idx = 0;
let playing = false;
let enterRaf = 0;

function fitStage(){
  const s = Math.min(stageWrap.clientWidth/1920, stageWrap.clientHeight/1080);
  stage.style.transform = 'scale('+s+')';
  stage.style.left = ((stageWrap.clientWidth - 1920*s)/2) + 'px';
  stage.style.top = ((stageWrap.clientHeight - 1080*s)/2) + 'px';
}
window.addEventListener('resize', fitStage);

// 入场动画：--hs-t 从 0→1（复用视频里的 .hs-enter/.hs-pop 等类）
function animateEnter(){
  cancelAnimationFrame(enterRaf);
  const start = performance.now();
  const dur = 520;
  function tick(now){
    const t = Math.min(1, (now - start) / dur);
    slideInner.style.setProperty('--hs-t', String(t));
    if (t < 1) enterRaf = requestAnimationFrame(tick);
  }
  slideInner.style.setProperty('--hs-t', '0');
  enterRaf = requestAnimationFrame(tick);
}

// 若某页内容比可视区高/宽，整体缩小到刚好放下，避免被裁切。
function fitSlide(){
  slideInner.style.transform = '';
  slideInner.style.transformOrigin = 'center center';
  const area = document.getElementById('slide');
  if (!area) return;
  const availH = area.clientHeight, availW = area.clientWidth;
  const ch = slideInner.scrollHeight, cw = slideInner.scrollWidth;
  let s = 1;
  if (ch > availH) s = Math.min(s, availH / ch);
  if (cw > availW) s = Math.min(s, availW / cw);
  if (s < 0.999) slideInner.style.transform = 'scale(' + s + ')';
}

function render(){
  const sl = SLIDES[idx];
  if (!sl) return;
  sceneTitle.textContent = sl.title || '';
  slideInner.innerHTML = sl.html || '';
  subtitle.textContent = sl.subtitle || sl.caption || '';
  counter.textContent = (idx+1) + ' / ' + SLIDES.length;
  progressFill.style.width = ((idx+1)/SLIDES.length*100) + '%';
  prevBtn.disabled = idx === 0;
  nextBtn.disabled = idx === SLIDES.length - 1;
  fitSlide();
  animateEnter();
  // 音频
  if (sl.audio){ audio.src = sl.audio; } else { audio.removeAttribute('src'); }
  if (playing){
    if (sl.audio){ audio.currentTime = 0; audio.play().catch(()=>{}); }
    else { scheduleFallbackAdvance(); }
  }
}

function go(n){
  const next = Math.max(0, Math.min(SLIDES.length-1, n));
  if (next === idx && next !== 0) { /* same */ }
  idx = next;
  render();
}

function setPlaying(p){
  playing = p;
  playBtn.textContent = p ? '⏸ 暂停' : '▶ 播放';
  if (p){
    if (SLIDES[idx] && SLIDES[idx].audio){ audio.play().catch(()=>{}); }
    else { scheduleFallbackAdvance(); }
  } else {
    audio.pause();
    clearTimeout(fallbackTimer);
  }
}

let fallbackTimer = 0;
function scheduleFallbackAdvance(){
  clearTimeout(fallbackTimer);
  const sl = SLIDES[idx];
  const ms = (sl && sl.duration) ? sl.duration : 3500;
  fallbackTimer = setTimeout(()=>{ if(playing) advanceOrStop(); }, ms);
}

function advanceOrStop(){
  if (!autoplayBox.checked){ setPlaying(false); return; }
  if (idx < SLIDES.length - 1){ go(idx+1); }
  else { setPlaying(false); }
}

audio.addEventListener('ended', ()=>{ if(playing) advanceOrStop(); });
audio.addEventListener('play', ()=>{ clearTimeout(fallbackTimer); });

playBtn.addEventListener('click', ()=> setPlaying(!playing));
prevBtn.addEventListener('click', ()=>{ go(idx-1); });
nextBtn.addEventListener('click', ()=>{ go(idx+1); });
progress.addEventListener('click', (e)=>{
  const rect = progress.getBoundingClientRect();
  const ratio = (e.clientX - rect.left)/rect.width;
  go(Math.floor(ratio*SLIDES.length));
});
document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowRight'){ e.preventDefault(); go(idx+1); }
  else if (e.key === 'ArrowLeft'){ e.preventDefault(); go(idx-1); }
  else if (e.key === ' '){ e.preventDefault(); setPlaying(!playing); }
});

fitStage();
render();
</script>
</body>
</html>`;
}
