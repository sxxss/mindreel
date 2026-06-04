import { z } from "zod";

import { HtmlSlideThemeIdSchema } from "./html-slide-theme.ts";
import { ArtifactRefSchema, PipelineEventSchema } from "./job.ts";
import {
  IsoDateTimeStringSchema,
  JsonObjectSchema,
  JsonValueSchema,
  NanoIdSchema,
  NonEmptyStringSchema,
  PositiveIntSchema,
} from "./primitives.ts";
import { ProjectLatestArtifactsSchema, ProjectStatusSchema } from "./project.ts";
import { SceneTemplateIdSchema } from "./scene.ts";
import { SourceDocumentKindSchema } from "./source.ts";

export const ApiErrorIssueSchema = z
  .object({
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    path: z.array(z.union([z.string(), z.number()])),
  })
  .strict();
export type ApiErrorIssue = z.infer<typeof ApiErrorIssueSchema>;

export const ApiErrorSchema = z
  .object({
    statusCode: z.number().int().min(400).max(599),
    error: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    issues: z.array(ApiErrorIssueSchema).optional(),
  })
  .strict();
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthResponseSchema = z.object({ ok: z.literal(true) }).strict();
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// 系统信息（设置页只读展示）。
const ProviderStatusSchema = z
  .object({
    provider: z.string(),
    configured: z.boolean(),
    baseUrl: z.string(),
    model: z.string(),
    voice: z.string(),
  })
  .strict();

export const SystemInfoSchema = z
  .object({
    version: z.string(),
    providerMode: z.string(),
    dataDir: z.string(),
    projectsDir: z.string(),
    providersPath: z.string(),
    projectCount: z.number().int().nonnegative(),
    storageBytes: z.number().nonnegative(),
    llm: ProviderStatusSchema,
    tts: ProviderStatusSchema,
  })
  .strict();
export type SystemInfo = z.infer<typeof SystemInfoSchema>;

// 全局应用设置（新项目默认值）。
export const AppSettingsSchema = z
  .object({
    newProjectDurationSeconds: z.number().int().min(60).max(240),
    newProjectTheme: HtmlSlideThemeIdSchema,
  })
  .strict();
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const CreateProjectInputSchema = z
  .object({
    title: NonEmptyStringSchema,
    topic: NonEmptyStringSchema,
    audience: NonEmptyStringSchema,
    durationTargetSeconds: z.number().int().min(60).max(240),
    language: z.literal("zh-CN").default("zh-CN"),
    theme: HtmlSlideThemeIdSchema.optional(),
  })
  .strict();
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const UpdateProjectInputSchema = z
  .object({
    title: NonEmptyStringSchema.optional(),
    topic: NonEmptyStringSchema.optional(),
    audience: NonEmptyStringSchema.optional(),
    durationTargetSeconds: z.number().int().min(60).max(240).optional(),
    theme: HtmlSlideThemeIdSchema.optional(),
    status: ProjectStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one editable project field must be provided",
  });
export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

export const ProjectListItemSchema = z
  .object({
    id: NanoIdSchema,
    title: NonEmptyStringSchema,
    topic: NonEmptyStringSchema,
    audience: NonEmptyStringSchema,
    durationTargetSeconds: z.number().int().min(60).max(240),
    language: z.literal("zh-CN"),
    createdAt: IsoDateTimeStringSchema,
    updatedAt: IsoDateTimeStringSchema,
    status: ProjectStatusSchema,
    theme: HtmlSlideThemeIdSchema.default("deep-space"),
    sourceCount: z.number().int().nonnegative(),
    latestArtifacts: ProjectLatestArtifactsSchema,
  })
  .strict();
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

export const AppendSourceInputSchema = z
  .object({
    kind: SourceDocumentKindSchema,
    title: NonEmptyStringSchema,
    body: NonEmptyStringSchema,
    url: z.string().url().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "url" && value.url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "url sources must provide a url",
        path: ["url"],
      });
    }
  });
export type AppendSourceInput = z.infer<typeof AppendSourceInputSchema>;

export const ProjectIdParamsSchema = z.object({ id: NanoIdSchema }).strict();
export type ProjectIdParams = z.infer<typeof ProjectIdParamsSchema>;

export const JobIdParamsSchema = z.object({ jobId: NanoIdSchema }).strict();
export type JobIdParams = z.infer<typeof JobIdParamsSchema>;

export const ArtifactQuerySchema = z.object({ version: PositiveIntSchema }).strict();
export type ArtifactQuery = z.infer<typeof ArtifactQuerySchema>;

export const PipelineStageSchema = z.enum([
  "knowledge",
  "curriculum",
  "script",
  "scenes",
  "voice",
  "timeline",
  "render",
  "qa",
]);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

export const StageApprovalSchema = z
  .object({
    stage: PipelineStageSchema,
    approved: z.boolean(),
  })
  .strict();
export type StageApproval = z.infer<typeof StageApprovalSchema>;

export const PipelineActionInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve-stage"),
      stage: PipelineStageSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("rewrite-beat"),
      stage: z.literal("script"),
      beatId: NanoIdSchema,
      instruction: NonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("change-scene-template"),
      stage: z.literal("scenes"),
      sceneId: NanoIdSchema,
      templateId: SceneTemplateIdSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("resynthesize-voice"),
      stage: z.literal("voice"),
      beatId: NanoIdSchema.optional(),
      voice: NonEmptyStringSchema.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("rerun-stage"),
      stage: PipelineStageSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("continue-downstream"),
      stage: PipelineStageSchema,
    })
    .strict(),
]);
export type PipelineActionInput = z.infer<typeof PipelineActionInputSchema>;

export const CreatePipelineJobInputSchema = z
  .object({
    kind: z.enum([
      "research",
      "curriculum",
      "script",
      "scene-spec",
      "voice",
      "timeline",
      "render",
      "qa",
      "autopilot",
    ]),
    parentArtifactVersion: PositiveIntSchema.optional(),
    options: JsonObjectSchema.optional(),
  })
  .strict();
export type CreatePipelineJobInput = z.infer<typeof CreatePipelineJobInputSchema>;

const ProviderSettingValueSchema = z.union([JsonValueSchema, z.null()]);

export const ProviderEntrySchema = z
  .object({
    provider: NonEmptyStringSchema,
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    voice: z.string().optional(),
    langCode: z.string().optional(),
    lang_code: z.string().optional(),
    piperBin: z.string().optional(),
    piperVoiceModel: z.string().optional(),
    comfyWorkflowPath: z.string().optional(),
    note: z.string().optional(),
  })
  .catchall(ProviderSettingValueSchema);
export type ProviderEntry = z.infer<typeof ProviderEntrySchema>;

export const ProviderConfigSchema = z
  .object({
    llm: ProviderEntrySchema,
    tts: ProviderEntrySchema,
    image: ProviderEntrySchema,
    video: ProviderEntrySchema,
    factCheck: ProviderEntrySchema,
  })
  .strict();
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderTestKindSchema = z.enum(["llm", "tts"]);
export type ProviderTestKind = z.infer<typeof ProviderTestKindSchema>;

export const ProviderTestInputSchema = z.object({ kind: ProviderTestKindSchema }).strict();
export type ProviderTestInput = z.infer<typeof ProviderTestInputSchema>;

export const ProviderTestResultSchema = z
  .object({
    ok: z.boolean(),
    message: NonEmptyStringSchema,
    latencyMs: z.number().int().nonnegative().optional(),
  })
  .strict();
export type ProviderTestResult = z.infer<typeof ProviderTestResultSchema>;

export const ProjectMediaQuerySchema = z
  .object({
    path: NonEmptyStringSchema.refine(
      (value) =>
        !value.startsWith("/") &&
        !value.includes("..") &&
        value.startsWith("projects/"),
      "media path must stay inside data/projects",
    ),
  })
  .strict();
export type ProjectMediaQuery = z.infer<typeof ProjectMediaQuerySchema>;

export const ProjectMediaResponseSchema = z.object({ url: NonEmptyStringSchema }).strict();
export type ProjectMediaResponse = z.infer<typeof ProjectMediaResponseSchema>;

export const PipelineEventEnvelopeSchema = PipelineEventSchema;
export type PipelineEventEnvelope = z.infer<typeof PipelineEventEnvelopeSchema>;

export const LatestArtifactRefSchema = ArtifactRefSchema;
export type LatestArtifactRef = z.infer<typeof LatestArtifactRefSchema>;
