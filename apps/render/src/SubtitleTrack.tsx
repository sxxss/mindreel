import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";

import type { Timeline } from "@auto/shared";

import { msToFrame } from "./metadata.ts";

const SubtitleCue = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 9999, 10007], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 78,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1320,
          padding: "16px 28px",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: 8,
          background: "rgba(8, 12, 18, 0.72)",
          color: "#f8fafc",
          fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: 34,
          lineHeight: 1.42,
          opacity,
          textAlign: "center",
          boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const SubtitleTrack = ({ timeline, fps }: { timeline: Timeline; fps: number }) => (
  <>
    {timeline.scenes.flatMap((scene) =>
      scene.shots.flatMap((shot) =>
        shot.subtitleCues.map((cue) => {
          const from = msToFrame(cue.startMs, fps);
          const durationInFrames = Math.max(1, msToFrame(cue.endMs - cue.startMs, fps));
          return (
            <Sequence key={`${scene.sceneId}:${cue.beatId}`} from={from} durationInFrames={durationInFrames}>
              <SubtitleCue text={cue.text} />
            </Sequence>
          );
        }),
      ),
    )}
  </>
);
