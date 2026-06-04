import { useEffect } from "react";

import {
  PipelineEventEnvelopeSchema,
  type AppendSourceInput,
  type ArtifactKind,
  type CreatePipelineJobInput,
  type CreateProjectInput,
  type PipelineActionInput,
  type UpdateProjectInput,
} from "@auto/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "../../components/toast/toast-provider.tsx";
import { apiClient, createApiUrl } from "../../lib/api-client.ts";
import { useAppStore } from "../../store/app-store.ts";

export const useHealthQuery = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: apiClient.health,
  });

export const useProjectsQuery = () =>
  useQuery({
    queryKey: ["projects"],
    queryFn: apiClient.projects,
  });

export const useProjectDetailQuery = (projectId: string) =>
  useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => apiClient.project(projectId),
    enabled: projectId !== "",
  });

export const useProvidersQuery = () =>
  useQuery({
    queryKey: ["providers"],
    queryFn: apiClient.providers,
  });

export const useSystemInfoQuery = () =>
  useQuery({
    queryKey: ["system"],
    queryFn: apiClient.system,
  });

export const useAppSettingsQuery = () =>
  useQuery({
    queryKey: ["app-settings"],
    queryFn: apiClient.appSettings,
  });

export const useArtifactQuery = (projectId: string, kind?: ArtifactKind, version?: number) =>
  useQuery({
    queryKey: ["projects", projectId, "artifacts", kind, version ?? "latest"],
    queryFn: () => apiClient.artifact(projectId, kind!, version),
    enabled: projectId !== "" && kind !== undefined,
    retry: false,
  });

export const usePipelineEventsQuery = (projectId: string) =>
  useQuery({
    queryKey: ["projects", projectId, "events"],
    queryFn: () => apiClient.events(projectId),
    enabled: projectId !== "",
  });

export const useCreateProjectMutation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (input: CreateProjectInput) => apiClient.createProject(input),
    onSuccess: async (project) => {
      queryClient.setQueryData(["projects", project.id], project);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.push({
        title: "项目已创建",
        description: `已进入《${project.title}》的工作区。`,
        tone: "success",
      });
    },
    onError: (error) => {
      toast.push({
        title: "创建项目失败",
        description: error instanceof Error ? error.message : "请稍后重试。",
        tone: "error",
      });
    },
  });
};

export const useAppendSourceMutation = () =>
  useMutation({
    mutationFn: (args: { projectId: string; input: AppendSourceInput }) =>
      apiClient.appendSource(args.projectId, args.input),
  });

export const useUpdateProjectMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { projectId: string; input: UpdateProjectInput }) =>
      apiClient.updateProject(args.projectId, args.input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", project.id] });
    },
  });
};

export const useCreateJobMutation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (args: { projectId: string; input: CreatePipelineJobInput }) =>
      apiClient.createJob(args.projectId, args.input),
    onSuccess: async (job) => {
      await queryClient.invalidateQueries({ queryKey: ["projects", job.projectId] });
      toast.push({
        title: "任务已入队",
        description: `${job.kind} 阶段已进入后台队列。`,
        tone: "success",
      });
    },
  });
};

export const useStageActionMutation = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (args: { projectId: string; input: PipelineActionInput }) =>
      apiClient.stageAction(args.projectId, args.input),
    onSuccess: async (job) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects", job.projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects", job.projectId, "events"] }),
      ]);
      toast.push({
        title: "动作已提交",
        description: `${job.kind} 阶段会继续处理下游产物。`,
        tone: "success",
      });
    },
  });
};

export const useProjectEventStream = (projectId: string) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const appendActivityEvent = useAppStore((state) => state.appendActivityEvent);

  useEffect(() => {
    if (projectId === "") {
      return undefined;
    }

    const eventSource = new EventSource(createApiUrl(`/api/projects/${projectId}/events`));

    eventSource.onmessage = async (event) => {
      const parsed = PipelineEventEnvelopeSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) {
        return;
      }

      appendActivityEvent(projectId, parsed.data);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects", projectId, "events"] }),
      ]);

      toast.push({
        title: "项目状态已刷新",
        description: parsed.data.message,
      });
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [appendActivityEvent, projectId, queryClient, toast]);
};
