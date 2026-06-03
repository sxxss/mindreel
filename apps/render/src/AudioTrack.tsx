import { Audio, Sequence } from "remotion";

import type { Timeline, VoiceTrack } from "@auto/shared";

import { msToFrame } from "./metadata.ts";

export type RenderAudioCue = {
  beatId: string;
  src: string;
  from: number;
};

export const buildAudioCues = (
  timeline: Timeline,
  voiceTrack: VoiceTrack,
  fps: number,
): RenderAudioCue[] => {
  const voiceByBeat = new Map(voiceTrack.cues.map((cue) => [cue.beatId, cue]));
  return timeline.scenes.flatMap((scene) =>
    scene.shots.flatMap((shot) =>
      shot.subtitleCues.map((subtitle) => {
        const voiceCue = voiceByBeat.get(subtitle.beatId);
        if (voiceCue === undefined) {
          throw new Error(`Missing voice cue for subtitle beat ${subtitle.beatId}`);
        }
        return {
          beatId: subtitle.beatId,
          src: voiceCue.audioPath,
          from: msToFrame(subtitle.startMs, fps),
        };
      }),
    ),
  );
};

export const AudioTrack = ({
  timeline,
  voiceTrack,
  fps,
}: {
  timeline: Timeline;
  voiceTrack: VoiceTrack;
  fps: number;
}) => (
  <>
    {buildAudioCues(timeline, voiceTrack, fps).map((cue) => (
      <Sequence key={cue.beatId} from={cue.from}>
        <Audio src={cue.src} />
      </Sequence>
    ))}
  </>
);
