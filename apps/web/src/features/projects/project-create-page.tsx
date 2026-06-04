import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import type { CreateProjectInput } from "@auto/shared";

import {
  useAppendSourceMutation,
  useAppSettingsQuery,
  useCreateJobMutation,
  useCreateProjectMutation,
} from "./queries.ts";
import { ProjectCreateAside } from "./ProjectCreateAside.tsx";
import { ProjectCreateForm } from "./ProjectCreateForm.tsx";

const defaultForm: CreateProjectInput = {
  title: "",
  topic: "",
  audience: "",
  durationTargetSeconds: 90,
  language: "zh-CN",
  theme: "deep-space",
};

export const ProjectCreatePage = () => {
  const navigate = useNavigate();
  const createProjectMutation = useCreateProjectMutation();
  const appendSourceMutation = useAppendSourceMutation();
  const createJobMutation = useCreateJobMutation();
  const [form, setForm] = useState<CreateProjectInput>(defaultForm);
  const appSettingsQuery = useAppSettingsQuery();
  const defaultsApplied = useRef(false);

  // 用全局「新项目默认值」预填一次（仅在用户尚未改动表单时）。
  useEffect(() => {
    if (defaultsApplied.current || !appSettingsQuery.data) return;
    defaultsApplied.current = true;
    setForm((current) => ({
      ...current,
      durationTargetSeconds: appSettingsQuery.data.newProjectDurationSeconds,
      theme: appSettingsQuery.data.newProjectTheme,
    }));
  }, [appSettingsQuery.data]);

  const [textSource, setTextSource] = useState("");
  const [markdownSource, setMarkdownSource] = useState<{ title: string; body: string }>();
  const [urlSource, setUrlSource] = useState("");
  const [submitError, setSubmitError] = useState<{ title: string; message: string }>();

  const updateField = <TKey extends keyof CreateProjectInput>(
    key: TKey,
    value: CreateProjectInput[TKey],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(undefined);

    try {
      const project = await createProjectMutation.mutateAsync(form);
      const sourceJobs = [];
      if (textSource.trim() !== "") {
        sourceJobs.push(
          appendSourceMutation.mutateAsync({
            projectId: project.id,
            input: { kind: "text", title: "粘贴资料", body: textSource.trim() },
          }),
        );
      }
      if (markdownSource?.body.trim()) {
        sourceJobs.push(
          appendSourceMutation.mutateAsync({
            projectId: project.id,
            input: {
              kind: "markdown",
              title: markdownSource.title,
              body: markdownSource.body.trim(),
            },
          }),
        );
      }
      if (urlSource.trim() !== "") {
        sourceJobs.push(
          appendSourceMutation.mutateAsync({
            projectId: project.id,
            input: {
              kind: "url",
              title: urlSource.trim(),
              body: urlSource.trim(),
              url: urlSource.trim(),
            },
          }),
        );
      }
      await Promise.all(sourceJobs);

      try {
        await createJobMutation.mutateAsync({ projectId: project.id, input: { kind: "autopilot" } });
      } catch (error) {
        setSubmitError({
          title: "自动生成任务提交失败",
          message: error instanceof Error ? error.message : "请稍后在项目页重新提交自动生成任务。",
        });
        return;
      }

      navigate(`/projects/${project.id}`);
    } catch (error) {
      setSubmitError({
        title: "项目创建失败",
        message: error instanceof Error ? error.message : "请检查输入后重试。",
      });
    }
  };

  const isPending =
    createProjectMutation.isPending ||
    appendSourceMutation.isPending ||
    createJobMutation.isPending;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <ProjectCreateForm
        form={form}
        textSource={textSource}
        urlSource={urlSource}
        submitError={submitError}
        isPending={isPending}
        onSubmit={handleSubmit}
        onBack={() => navigate("/projects")}
        onFieldChange={updateField}
        onTextSourceChange={setTextSource}
        onUrlSourceChange={setUrlSource}
        onMarkdownSourceChange={setMarkdownSource}
        onPresetSelect={(preset) => {
          updateField("title", preset.title);
          updateField("topic", preset.topic);
          updateField("audience", preset.audience);
        }}
      />

      <ProjectCreateAside />
    </div>
  );
};
