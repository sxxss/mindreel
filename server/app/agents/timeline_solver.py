"""timeline-solver —— 纯确定性：把 scene-spec + 真实语音时长拼成最终时间线。

关键：每个 shot 的时长 = 其覆盖 beat 的【真实语音时长】之和（+ beat 间停顿），
这保证了音画同步——画面切换严格踩在旁白节奏上，而不是估算值。
"""
from __future__ import annotations

from ..models import (
    Curriculum,
    Project,
    SceneSpec,
    Script,
    ScriptBeat,
    Timeline,
    VoiceCue,
    VoiceTrack,
    normalize_chapter_id,
)

DEFAULT_PAD_BETWEEN_MS = 200
DEFAULT_SCENE_GAP_MS = 600


def _index_by(values, label, key):
    out: dict = {}
    for v in values:
        k = key(v)
        if k in out:
            raise ValueError(f"重复的 {label} {k}")
        out[k] = v
    return out


def _is_outside_tolerance(actual: int, target: int, tol: float) -> bool:
    return actual < target * (1 - tol) or actual > target * (1 + tol)


def solve_timeline(
    project: Project,
    curriculum: Curriculum,
    script: Script,
    scene_specs: list[SceneSpec],
    voice_track: VoiceTrack,
) -> Timeline:
    # 跨产物对齐 chapterId：curriculum / script / scene-spec 可能由不同版本生成，
    # 章节 id 不一致（如旧 curriculum 存的是 c1、新 scene-spec 已规整成 chapter_c1）。
    # 用同一个纯函数把三方统一规整，确保按 chapterId 的匹配不会错位。
    for chapter in curriculum.chapters:
        chapter.id = normalize_chapter_id(chapter.id)
    for segment in script.segments:
        segment.chapterId = normalize_chapter_id(segment.chapterId)
    for scene in scene_specs:
        scene.chapterId = normalize_chapter_id(scene.chapterId)

    # 一个 chapter 可有多个 scene（按输入顺序保留）
    scenes_by_chapter: dict[str, list[SceneSpec]] = {}
    for scene in scene_specs:
        scenes_by_chapter.setdefault(scene.chapterId, []).append(scene)

    segments_by_chapter = _index_by(script.segments, "script segment", lambda s: s.chapterId)
    cues_by_beat: dict[str, VoiceCue] = _index_by(voice_track.cues, "voice cue", lambda c: c.beatId)

    # 每个 beat 必须有语音
    for seg in script.segments:
        for beat in seg.beats:
            if beat.id not in cues_by_beat:
                raise ValueError(f"beat {beat.id} 缺少语音 cue")

    warnings: list[dict] = []
    out_scenes: list[dict] = []
    next_scene_start = 0

    for chapter in curriculum.chapters:
        chapter_scenes = scenes_by_chapter.get(chapter.id)
        if not chapter_scenes:
            raise ValueError(f"章节 {chapter.id} 缺少 scene spec")
        segment = segments_by_chapter.get(chapter.id)
        if segment is None:
            raise ValueError(f"章节 {chapter.id} 缺少 script segment")
        beats_by_id: dict[str, ScriptBeat] = _index_by(segment.beats, "script beat", lambda b: b.id)

        chapter_seen: set[str] = set()
        chapter_start = next_scene_start
        built: list[dict] = []

        for spec in chapter_scenes:
            for shot in spec.shots:
                for beat_id in shot.beatRefs:
                    if beat_id in chapter_seen:
                        raise ValueError(f"章节 {chapter.id} 内 beatRef {beat_id} 重复")
                    chapter_seen.add(beat_id)

            scene_start = next_scene_start
            next_shot_start = scene_start
            shots_out: list[dict] = []

            for shot in spec.shots:
                contexts = []
                for beat_id in shot.beatRefs:
                    beat = beats_by_id.get(beat_id)
                    if beat is None:
                        raise ValueError(
                            f"scene {spec.sceneId} 的 shot {shot.id} 引用了章外 beat {beat_id}"
                        )
                    contexts.append((beat, cues_by_beat[beat_id]))

                duration = sum(c.actualDurationMs + b.pauseAfterMs for b, c in contexts)
                shot_start = next_shot_start
                shot_end = shot_start + duration

                next_sub_start = shot_start
                subtitle_cues = []
                for beat, cue in contexts:
                    start = next_sub_start
                    end = start + cue.actualDurationMs
                    next_sub_start = end + beat.pauseAfterMs
                    subtitle_cues.append({
                        "beatId": beat.id, "text": beat.text, "startMs": start, "endMs": end,
                    })

                animations = []
                for op in shot.animationOps:
                    if op.durationMs <= duration:
                        animations.append({
                            "id": op.id, "kind": op.kind, "targetRef": op.targetRef,
                            "startMs": shot_start, "endMs": shot_start + op.durationMs,
                        })
                    else:
                        warnings.append({
                            "code": "animation-overflow",
                            "message": f"shot {shot.id} 的动画 {op.id} 超出实际语音时长，已按比例压缩。",
                            "sceneId": spec.sceneId, "shotId": shot.id,
                        })
                        animations.append({
                            "id": op.id, "kind": op.kind, "targetRef": op.targetRef,
                            "startMs": shot_start, "endMs": shot_end,
                            "squeezeFactor": duration / op.durationMs if op.durationMs else None,
                        })

                next_shot_start = shot_end + DEFAULT_PAD_BETWEEN_MS
                shots_out.append({
                    "shotId": shot.id, "startMs": shot_start, "endMs": shot_end,
                    "animations": animations, "subtitleCues": subtitle_cues,
                })

            scene_end = shots_out[-1]["endMs"] if shots_out else scene_start
            next_scene_start = scene_end + DEFAULT_SCENE_GAP_MS
            built.append({
                "sceneId": spec.sceneId, "startMs": scene_start, "endMs": scene_end,
                "shots": shots_out,
            })

        # 时长漂移按整章评估，挂在该章第一个 scene 上
        chapter_end = built[-1]["endMs"] if built else chapter_start
        chapter_duration = chapter_end - chapter_start
        expected_chapter = chapter.expectedSeconds * 1000
        if _is_outside_tolerance(chapter_duration, expected_chapter, 0.3):
            warnings.append({
                "code": "scene-duration-drift",
                "message": f"章节 {chapter.id} 实际时长 {chapter_duration}ms 偏离章节目标 "
                           f"{expected_chapter}ms 超过 30%。",
                "sceneId": built[0]["sceneId"],
            })
        out_scenes.extend(built)

    duration_ms = out_scenes[-1]["endMs"] if out_scenes else 0
    expected_project = project.durationTargetSeconds * 1000
    if _is_outside_tolerance(duration_ms, expected_project, 0.2):
        warnings.append({
            "code": "project-duration-drift",
            "message": f"timeline 实际时长 {duration_ms}ms 偏离项目目标 {expected_project}ms 超过 20%。",
        })

    return Timeline.model_validate({
        "durationMs": duration_ms, "scenes": out_scenes, "warnings": warnings,
    })
