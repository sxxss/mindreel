import type { RenderCompositionInput } from "@auto/shared";

export const previewInput: RenderCompositionInput = {
  project: {
    id: "preview1",
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
        title: "复杂波形背后藏着秩序",
        subtitle: "把声音拆成一组频率清单",
        accents: [
          { id: "acc001", label: "波形", x: 0.22, y: 0.36 },
          { id: "acc002", label: "频谱", x: 0.76, y: 0.64 },
        ],
      },
      shots: [
        {
          id: "shot001",
          beatRefs: ["beat001"],
          anchorTimeMs: 0,
          durationMs: 4200,
          camera: "focus",
          animationOps: [{ id: "anim001", kind: "enter", targetRef: "title", ease: "linear", durationMs: 800 }],
        },
      ],
    },
  ],
  voiceTrack: {
    cues: [
      {
        beatId: "beat001",
        audioPath: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
        actualDurationMs: 3600,
        provider: "preview",
        voice: "preview",
        mimeType: "audio/wav",
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
            animations: [{ id: "anim001", kind: "enter", targetRef: "title", startMs: 0, endMs: 800 }],
            subtitleCues: [{ beatId: "beat001", text: "复杂波形背后，其实藏着可以拆开的频率秩序。", startMs: 0, endMs: 3600 }],
          },
        ],
      },
    ],
    warnings: [],
  },
};
