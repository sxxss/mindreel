import { describe, expect, test } from "vitest";

import { calculateKnowledgeVideoMetadata } from "../metadata.ts";
import { renderInput } from "./fixtures.ts";

describe("calculateKnowledgeVideoMetadata", () => {
  test("derives duration frames from timeline duration at fixed 1080p settings", () => {
    expect(calculateKnowledgeVideoMetadata(renderInput)).toEqual({
      durationInFrames: 126,
      fps: 30,
      width: 1920,
      height: 1080,
    });
  });
});
