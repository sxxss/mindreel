import type React from "react";
import { z } from "zod";
import { interpolate } from "remotion";
import { HTML_SLIDE_BASE_CSS, htmlSlideStageBackground, stripNarrationFromHtml } from "@auto/shared";

import type { SceneTemplateDefinition, SceneTemplateRenderContext } from "../types.ts";
import { NonEmptyTextSchema } from "./schemas.ts";

const HtmlStepSchema = z
  .object({
    // 本步骤的自包含 HTML（只用内联样式或下面注入的主题 CSS 变量/工具类）。
    html: NonEmptyTextSchema,
    caption: NonEmptyTextSchema.optional(),
  })
  .strict();

export const HtmlSlidePropsSchema = z
  .object({
    title: NonEmptyTextSchema.optional(),
    steps: z.array(HtmlStepSchema).min(1).max(12),
  })
  .strict();

type HtmlSlideProps = z.infer<typeof HtmlSlidePropsSchema>;

// 注入给 LLM 写的 HTML 使用的主题变量 + 一小套工具类（统一质感、降低 AI 味）。
const themeVars = (ctx: SceneTemplateRenderContext): Record<string, string> => ({
  "--ink": ctx.theme.ink,
  "--muted": ctx.theme.muted,
  "--bg": ctx.theme.background,
  "--cyan": ctx.theme.accentCyan,
  "--orange": ctx.theme.accentOrange,
  "--pink": ctx.theme.accentPink,
  "--green": ctx.theme.accentGreen,
  "--grid": ctx.theme.grid,
  "--shadow": ctx.theme.shadow,
  "--font-sans": ctx.theme.fontSans,
  "--font-mono": ctx.theme.fontMono,
});

// baseCss 已抽到 @auto/shared（视频/预览/导出网页共用同一份），这里直接引用。
const baseCss = HTML_SLIDE_BASE_CSS;

export const HtmlSlide: SceneTemplateDefinition<HtmlSlideProps> = {
  id: "HtmlSlide",
  propsSchema: HtmlSlidePropsSchema,
  durationHintsMs: { min: 5000, ideal: 10000, max: 18000 },
  render: (props, ctx) => {
    const count = props.steps.length;
    const fps = ctx.fps || 30;
    const sceneDurMs = (ctx.durationInFrames / fps) * 1000;
    const tMs = (ctx.currentFrame / fps) * 1000;

    // 关键：把每一步对齐到旁白音频的 beat 时间（讲到第几句、就停在第几步），
    // 而不是按场景时长均分——这样画面和讲解严格同步。无 stepStartsMs 时回退均分。
    const beatStarts = ctx.stepStartsMs;
    const stepStartMsOf = (s: number): number => {
      if (beatStarts && beatStarts.length > 0) {
        const beatIdx = Math.min(beatStarts.length - 1, Math.floor((s * beatStarts.length) / count));
        return beatStarts[beatIdx]!;
      }
      return (s * sceneDurMs) / count;
    };
    let stepIndex = 0;
    while (stepIndex + 1 < count && stepStartMsOf(stepIndex + 1) <= tMs) {
      stepIndex += 1;
    }
    const stepStartMs = stepStartMsOf(stepIndex);
    const stepEndMs = stepIndex + 1 < count ? stepStartMsOf(stepIndex + 1) : sceneDurMs;
    const localT = Math.min(1, Math.max(0, (tMs - stepStartMs) / Math.max(1, stepEndMs - stepStartMs)));
    const TRANSITION = 0.16; // 进入新步的前 16% 做交叉淡入淡出
    const enterT = localT < TRANSITION ? localT / TRANSITION : 1;
    const step = props.steps[stepIndex]!;
    const prev = stepIndex > 0 ? props.steps[stepIndex - 1] : undefined;

    // 每步的局部入场进度：从 step 开始 0→1，在 localT=0.4 时达到 1。
    // 注入为 CSS 变量 --hs-t，供 .hs-enter/.hs-pop/.hs-slide-left/.hs-glow 类使用。
    // 值故意不与 TRANSITION 耦合：过渡做整步淡入，--hs-t 做各元素错位入场。
    const hsT = interpolate(localT, [0, 0.4], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    // 注入 HTML 一律按 1920×1080 画布设计。关键：用「固定舞台 + 等比缩放」呈现，
    // 而不是塞进一个被裁小的盒子——否则 1080 高的画布会被压扁，按 bottom: 定位的元素
    // 会撞到按 top: 定位的元素，整屏重叠。等比缩放则让绝对定位 1:1 保真。
    const STAGE_W = 1920;
    const STAGE_H = 1080;
    const RESERVE_BOTTOM = 170; // 底部留给 SubtitleTrack 字幕条，内容不进这条带
    const fitScale = (STAGE_H - RESERVE_BOTTOM) / STAGE_H; // 等比缩放系数（受高度约束）
    const stageLeft = (STAGE_W - STAGE_W * fitScale) / 2; // 缩放后水平居中的左边距

    const stepLayer = (html: string, opacity: number, translateY: number, scale: number, ht?: number) => (
      <div
        style={{
          position: "absolute",
          left: stageLeft,
          top: 0,
          width: STAGE_W,
          height: STAGE_H,
          transformOrigin: "top left",
          transform: `scale(${fitScale})`,
          opacity,
        }}
      >
        {/* 固定 1920×1080 舞台 + 居中：兼容两种 LLM 写法——
            ① 满屏舞台式（root 自带 width:1920;height:1080 + position:absolute 子元素）：
               作为 flex 子项正好铺满，绝对定位 1:1 保真；
            ② 居中面板式（如 <div class="hs-panel" style="max-width:1500px">，无定位）：
               由 flex 在舞台内水平垂直居中显示，而不是堆到左上角被裁。 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateY(${translateY}px) scale(${scale})`,
            ...(ht !== undefined ? ({ "--hs-t": String(ht) } as React.CSSProperties) : {}),
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    );

    return (
      <div
        className="hs-root"
        style={{
          ...themeVars(ctx),
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          background: htmlSlideStageBackground(ctx.theme),
          overflow: "hidden",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: baseCss }} />
        {/* 每屏 HTML 自带标题；这里不再叠加场景标题，避免与缩放留白边重叠/被裁。 */}
        {prev !== undefined && enterT < 1
          ? stepLayer(stripNarrationFromHtml(prev.html, prev.caption), 1 - enterT, 0, 1, 1)
          : null}
        {stepLayer(
          stripNarrationFromHtml(step.html, step.caption),
          enterT,
          (1 - enterT) * 18,
          0.985 + enterT * 0.015,
          hsT,
        )}
      </div>
    );
  },
};
