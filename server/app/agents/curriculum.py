"""curriculum agent —— 把 Knowledge 压成可演示的分章大纲。"""
from __future__ import annotations

import json

from ..models import Curriculum, Knowledge, Project, ProviderEntry, normalize_chapter_id
from .prompting import build_system_prompt, with_revision_instructions
from .runner import Emit, run_json_agent

_LONG_FORM_THRESHOLD = 150


def _constraints(target_seconds: int) -> list[str]:
    return [
        "章节叙事必须覆盖 hook/concept/derivation/example/recap 五类章节。",
        ("目标时长达到 150 秒以上时，可扩展到 6-7 章，但仍必须覆盖五类章节。"
         if target_seconds >= _LONG_FORM_THRESHOLD
         else "目标时长低于 150 秒时，默认严格输出 5 章，每类章节恰好承担一个主要教学功能。"),
        f"总时长必须落在 {target_seconds} 秒的 ±10% 内。",
        "hook 必须抛出具体问题或反直觉现象。",
        "concept 必须定义核心概念。",
        "derivation 必须体现可视化推导、演化或拆解过程。",
        "example 必须给出一个具体可演示的例子。",
        "recap 必须用一句话浓缩可带走的结论。",
        "learningGoal 必须以动词开头，且要具体到对象与动作/结果，禁止“了解一下 / 概述一下 / 看看 / 感受一下”。",
        "expectedSeconds 必须服务于可演示内容，不准出现空泛过渡段。",
    ]


def _user(project: Project, knowledge: Knowledge) -> str:
    return "\n\n".join([
        "请输出给场景导演之前使用的教学分章，而不是普通提纲。",
        f"项目：{project.title}",
        f"主题：{project.topic}",
        f"目标受众：{project.audience}",
        f"目标时长：{project.durationTargetSeconds} 秒",
        "请优先围绕 facts、terms、misconceptions 组织章节，不要脱离输入另起炉灶。",
        "knowledge：\n" + json.dumps(knowledge.model_dump(mode="json"), ensure_ascii=False, indent=2),
    ])


async def run_curriculum(project: Project, knowledge: Knowledge, llm: ProviderEntry,
                         emit: Emit | None = None) -> Curriculum:
    system = build_system_prompt(
        role="你是一位中文课程设计师，要把 Knowledge 压成可演示、可拍成动画的视频分章大纲。",
        schema=Curriculum, constraints=_constraints(project.durationTargetSeconds),
    )
    base = _user(project, knowledge)
    curriculum = await run_json_agent(
        llm=llm, model=Curriculum, system=system,
        build_user=lambda notes: with_revision_instructions(base, notes),
        emit=emit, name="curriculum",
    )
    # 章节 id 是贯穿 script / scene-spec 的引用键，必须 nanoid 合规，否则渲染端会拒收。
    for chapter in curriculum.chapters:
        chapter.id = normalize_chapter_id(chapter.id)
    return curriculum
