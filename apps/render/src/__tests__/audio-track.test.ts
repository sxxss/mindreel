import { describe, expect, test } from "vitest";

import { buildAudioCues } from "../AudioTrack.tsx";
import { renderInput } from "./fixtures.ts";

describe("buildAudioCues", () => {
  test("aligns audio by subtitle cue start and never exposes playbackRate", () => {
    const cues = buildAudioCues(renderInput.timeline, renderInput.voiceTrack, 30);

    expect(cues).toEqual([
      {
        beatId: "beat001",
        src: "data/projects/project1/audio/beat001.mp3",
        from: 0,
      },
      {
        beatId: "beat002",
        src: "data/projects/project1/audio/beat002.mp3",
        from: 60,
      },
    ]);
    expect(cues.some((cue) => "playbackRate" in cue)).toBe(false);
  });
});
