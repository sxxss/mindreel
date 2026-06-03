import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { getHtmlSlideTheme, type Project, type Timeline } from "@auto/shared";

export const Chrome = ({ project, timeline }: { project: Project; timeline: Timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentMs = Math.round((frame / fps) * 1000);
  const total = Math.max(1, timeline.durationMs);
  const progress = Math.min(1, Math.max(0, currentMs / total));

  // 跟随项目主题取色，外框/进度条与画面同色系。
  const t = getHtmlSlideTheme(project.theme);

  // 当前所在场景（用于显示章节序号）。
  const scenes = timeline.scenes;
  const activeIndex = Math.max(
    0,
    scenes.findIndex((s) => currentMs >= s.startMs && currentMs < s.endMs),
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* 外框 */}
      <div
        style={{
          position: "absolute",
          inset: 34,
          borderRadius: 18,
          border: `1px solid ${t.grid}`,
          boxShadow: "inset 0 0 0 1px rgba(5, 9, 26, 0.6)",
        }}
      />
      {/* 章节序号徽标（标题交给每页幻灯片自己画，外框这里不再重复画，避免左上角重叠）*/}
      {scenes.length > 0 ? (
        <div
          style={{
            position: "absolute",
            right: 58,
            top: 48,
            color: t.muted,
            fontFamily: t.fontMono,
            fontSize: 20,
            letterSpacing: 1,
          }}
        >
          {String(activeIndex + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}
        </div>
      ) : null}

      {/* 进度条（全宽，带章节分段刻度）*/}
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 48,
          height: 5,
          borderRadius: 999,
          background: "rgba(148, 163, 184, 0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            borderRadius: 999,
            background: `linear-gradient(90deg, ${t.accentCyan}, ${t.accentPink})`,
          }}
        />
        {/* 章节分隔刻度 */}
        {scenes.slice(1).map((s) => (
          <div
            key={s.sceneId}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(s.startMs / total) * 100}%`,
              width: 2,
              background: "rgba(5, 9, 26, 0.55)",
            }}
          />
        ))}
      </div>
      {/* 计时 */}
      <div
        style={{
          position: "absolute",
          right: 58,
          bottom: 30,
          color: t.muted,
          fontFamily: t.fontMono,
          fontSize: 20,
        }}
      >
        {Math.floor(currentMs / 1000)
          .toString()
          .padStart(2, "0")}
        s
      </div>
    </AbsoluteFill>
  );
};
