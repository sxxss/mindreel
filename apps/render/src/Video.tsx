import type { ReactNode } from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";

import { RenderCompositionInputSchema, type RenderCompositionInput } from "@auto/shared";

import { AudioTrack } from "./AudioTrack.tsx";
import { Chrome } from "./Chrome.tsx";
import { SceneRouter } from "./SceneRouter.tsx";
import { indexSceneSpecsById } from "./scene-specs.ts";
import { msToFrame } from "./metadata.ts";
import { SubtitleTrack } from "./SubtitleTrack.tsx";

// 每个场景开头做一个短淡入，减少生硬切换。
const SceneFadeIn = ({ children }: { children: ReactNode }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const KnowledgeVideo = (rawProps: RenderCompositionInput) => {
  const input = RenderCompositionInputSchema.parse(rawProps);
  const sceneSpecsById = indexSceneSpecsById(input.sceneSpecs);
  const themeId = input.project.theme;

  return (
    <AbsoluteFill style={{ background: "#05070d" }}>
      {input.timeline.scenes.map((scene) => {
        const spec = sceneSpecsById.get(scene.sceneId);
        if (spec === undefined) {
          throw new Error(`Missing scene spec for timeline scene ${scene.sceneId}`);
        }
        const sceneDurationInFrames = Math.max(1, msToFrame(scene.endMs - scene.startMs));
        // 每个 beat 的音频起始时间（相对场景起点），用于让分步动画对齐旁白。
        const stepStartsMs = scene.shots
          .flatMap((shot) => shot.subtitleCues)
          .map((cue) => Math.max(0, cue.startMs - scene.startMs));
        return (
          <Sequence
            key={scene.sceneId}
            from={msToFrame(scene.startMs)}
            durationInFrames={sceneDurationInFrames}
          >
            <SceneFadeIn>
              <SceneRouter
                spec={spec}
                durationInFrames={sceneDurationInFrames}
                stepStartsMs={stepStartsMs}
                themeId={themeId}
              />
            </SceneFadeIn>
          </Sequence>
        );
      })}
      <AudioTrack timeline={input.timeline} voiceTrack={input.voiceTrack} fps={30} />
      <SubtitleTrack timeline={input.timeline} fps={30} />
      <Chrome project={input.project} timeline={input.timeline} />
    </AbsoluteFill>
  );
};
