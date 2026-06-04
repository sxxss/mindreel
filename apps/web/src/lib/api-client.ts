import {
  ApiErrorSchema,
  AppendSourceInputSchema,
  CreateProjectInputSchema,
  UpdateProjectInputSchema,
  type UpdateProjectInput,
  CreatePipelineJobInputSchema,
  JsonValueSchema,
  HealthResponseSchema,
  PipelineActionInputSchema,
  PipelineEventEnvelopeSchema,
  PipelineJobSchema,
  type CreateProjectInput,
  type AppendSourceInput,
  type ArtifactKind,
  type CreatePipelineJobInput,
  type JsonValue,
  type PipelineActionInput,
  type PipelineEvent,
  type PipelineJob,
  type Project,
  type ProjectListItem,
  type ProviderTestInput,
  type ProviderTestResult,
  ProjectListItemSchema,
  ProjectSchema,
  type ProviderConfig,
  ProviderConfigSchema,
  ProviderTestInputSchema,
  ProviderTestResultSchema,
  SourceDocumentSchema,
  type SourceDocument,
  SystemInfoSchema,
  type SystemInfo,
  AppSettingsSchema,
  type AppSettings,
} from "@auto/shared";

type Parser<T> = {
  parse: (input: unknown) => T;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const createApiUrl = (path: string) => `${apiBaseUrl}${path}`;

const parseJson = async <T>(response: Response, schema: Parser<T>) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("响应不是 JSON。请确认 API 服务已启动。");
  }
  const payload = await response.json();
  return schema.parse(payload);
};

export const fetchJson = async <T>(path: string, schema: Parser<T>, init?: RequestInit) => {
  let response: Response;
  try {
    response = await fetch(createApiUrl(path), init);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `无法连接 API：${error.message}`
        : "无法连接 API。请确认后端服务正在运行。",
    );
  }

  if (!response.ok) {
    const payload = await parseJson(response, ApiErrorSchema).catch(() => ({
      message: response.statusText || `HTTP ${response.status}`,
    }));
    throw new Error(payload.message);
  }

  return parseJson(response, schema);
};

const sendJson = async <TRequest, TResponse>(
  path: string,
  body: TRequest,
  responseSchema: Parser<TResponse>,
  init?: RequestInit,
) =>
  fetchJson(path, responseSchema, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });

export const apiClient = {
  health: () => fetchJson("/api/health", HealthResponseSchema),
  projects: () => fetchJson("/api/projects", ProjectListItemSchema.array()),
  project: (projectId: string) => fetchJson(`/api/projects/${projectId}`, ProjectSchema),
  createProject: (input: CreateProjectInput) =>
    sendJson(
      "/api/projects",
      CreateProjectInputSchema.parse(input),
      ProjectSchema,
      { method: "POST" },
    ),
  updateProject: (projectId: string, input: UpdateProjectInput) =>
    sendJson(
      `/api/projects/${projectId}`,
      UpdateProjectInputSchema.parse(input),
      ProjectSchema,
      { method: "PATCH" },
    ),
  appendSource: (projectId: string, input: AppendSourceInput) =>
    sendJson(
      `/api/projects/${projectId}/sources`,
      AppendSourceInputSchema.parse(input),
      SourceDocumentSchema,
      { method: "POST" },
    ),
  createJob: (projectId: string, input: CreatePipelineJobInput) =>
    sendJson(
      `/api/projects/${projectId}/jobs`,
      CreatePipelineJobInputSchema.parse(input),
      PipelineJobSchema,
      { method: "POST" },
    ),
  artifact: (projectId: string, kind: ArtifactKind, version?: number) => {
    const suffix = version === undefined ? "" : `/versions/${version}`;
    return fetchJson(`/api/projects/${projectId}/artifacts/${kind}${suffix}`, JsonValueSchema);
  },
  events: (projectId: string) =>
    fetchJson(`/api/projects/${projectId}/pipeline-events`, PipelineEventEnvelopeSchema.array()),
  stageAction: (projectId: string, input: PipelineActionInput) =>
    sendJson(
      `/api/projects/${projectId}/actions`,
      PipelineActionInputSchema.parse(input),
      PipelineJobSchema,
      { method: "POST" },
    ),
  providers: () => fetchJson("/api/providers", ProviderConfigSchema),
  saveProviders: (input: ProviderConfig) =>
    sendJson("/api/providers", ProviderConfigSchema.parse(input), ProviderConfigSchema, {
      method: "PUT",
    }),
  testProvider: (input: ProviderTestInput) =>
    sendJson(
      "/api/providers/test",
      ProviderTestInputSchema.parse(input),
      ProviderTestResultSchema,
      { method: "POST" },
    ),
  system: () => fetchJson("/api/system", SystemInfoSchema),
  appSettings: () => fetchJson("/api/settings", AppSettingsSchema),
  saveAppSettings: (input: AppSettings) =>
    sendJson("/api/settings", AppSettingsSchema.parse(input), AppSettingsSchema, {
      method: "PUT",
    }),
  projectMediaUrl: (projectId: string, path: string) =>
    createApiUrl(`/api/projects/${projectId}/media?path=${encodeURIComponent(path)}`),
  projectWebDeckUrl: (projectId: string) =>
    createApiUrl(`/api/projects/${projectId}/export/web`),
};

export type { SystemInfo, AppSettings };
export type ProjectSummary = ProjectListItem;
export type ProjectDetail = Project;
export type ProviderSummary = ProviderConfig;
export type ArtifactValue = JsonValue;
export type PipelineJobSummary = PipelineJob;
export type PipelineEventSummary = PipelineEvent;
export type SourceSummary = SourceDocument;
export type ProviderTestSummary = ProviderTestResult;
