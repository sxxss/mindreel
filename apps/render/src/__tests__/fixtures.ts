import type { RenderCompositionInput } from "@auto/shared";

export const renderInput: RenderCompositionInput = {
  project: {
    id: "project1",
    title: "傅里叶级数为什么能拆波",
    topic: "傅里叶级数",
    audience: "高中生",
    durationTargetSeconds: 60,
    language: "zh-CN",
    theme: "deep-space",
    sources: [],
    createdAt: "2026-05-18T10:00:00.000Z",
    updatedAt: "2026-05-18T10:00:00.000Z",
    status: "active",
    latestArtifacts: {},
  },
  sceneSpecs: [
    {
      chapterId: "chap001",
      sceneId: "scene001",
      templateId: "TitleHook",
      props: {
        title: "为什么要拆波",
        subtitle: "从复杂波形看见频率秩序",
        accents: [
          { id: "acc001", label: "频率", x: 0.3, y: 0.4 },
          { id: "acc002", label: "秩序", x: 0.7, y: 0.65 },
        ],
      },
      shots: [
        {
          id: "shot001",
          beatRefs: ["beat001", "beat002"],
          anchorTimeMs: 0,
          durationMs: 4200,
          camera: "focus",
          animationOps: [
            { id: "anim001", kind: "enter", targetRef: "title", ease: "linear", durationMs: 800 },
          ],
        },
      ],
    },
  ],
  voiceTrack: {
    cues: [
      {
        beatId: "beat001",
        audioPath: "data/projects/project1/audio/beat001.mp3",
        actualDurationMs: 1800,
        provider: "mock",
        voice: "mock-voice",
        mimeType: "audio/mpeg",
      },
      {
        beatId: "beat002",
        audioPath: "data/projects/project1/audio/beat002.mp3",
        actualDurationMs: 1900,
        provider: "mock",
        voice: "mock-voice",
        mimeType: "audio/mpeg",
      },
    ],
  },
  timeline: {
    durationMs: 4200,
    scenes: [
      {
        sceneId: "scene001",
        startMs: 0,
        endMs: 4200,
        shots: [
          {
            shotId: "shot001",
            startMs: 0,
            endMs: 4200,
            animations: [
              { id: "anim001", kind: "enter", targetRef: "title", startMs: 0, endMs: 800 },
            ],
            subtitleCues: [
              { beatId: "beat001", text: "先看一条方波。", startMs: 0, endMs: 1800 },
              { beatId: "beat002", text: "它可以拆成一组频率。", startMs: 2000, endMs: 3900 },
            ],
          },
        ],
      },
    ],
    warnings: [],
  },
};
