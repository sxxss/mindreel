import {
  RENDER_FPS,
  RENDER_HEIGHT,
  RENDER_WIDTH,
  RenderCompositionInputSchema,
  type RenderCompositionInput,
} from "@auto/shared";

export const msToFrame = (ms: number, fps = RENDER_FPS) => Math.round((ms / 1000) * fps);

export const calculateKnowledgeVideoMetadata = (rawInput: RenderCompositionInput) => {
  const input = RenderCompositionInputSchema.parse(rawInput);

  return {
    durationInFrames: Math.max(1, msToFrame(input.timeline.durationMs, RENDER_FPS)),
    fps: RENDER_FPS,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
  };
};
