import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Database, FolderOpen, Server, XCircle } from "lucide-react";

import { Button } from "../../components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import { useToast } from "../../components/toast/toast-provider.tsx";
import { apiClient, type AppSettings } from "../../lib/api-client.ts";
import { useAppSettingsQuery, useSystemInfoQuery } from "../projects/queries.ts";

const THEME_OPTIONS: ReadonlyArray<{ value: AppSettings["newProjectTheme"]; label: string }> = [
  { value: "deep-space", label: "深空 Deep Space" },
  { value: "aurora", label: "极光 Aurora" },
  { value: "sunset", label: "暮色 Sunset" },
  { value: "mono", label: "极简 Mono" },
];

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const StatusPill = ({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) =>
  ok ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs text-primary">
      <CheckCircle2 className="size-3.5" /> {okText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
      <XCircle className="size-3.5" /> {badText}
    </span>
  );

const InfoRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
    <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
    <span className={`text-right text-sm ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</span>
  </div>
);

export const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { push } = useToast();
  const systemQuery = useSystemInfoQuery();
  const settingsQuery = useAppSettingsQuery();

  const [draft, setDraft] = useState<AppSettings>({
    newProjectDurationSeconds: 150,
    newProjectTheme: "deep-space",
  });

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: apiClient.saveAppSettings,
    onSuccess: async (saved) => {
      setDraft(saved);
      await queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      push({ title: "设置已保存", tone: "success" });
    },
    onError: (error) =>
      push({
        title: "保存失败",
        description: error instanceof Error ? error.message : "请稍后重试",
        tone: "error",
      }),
  });

  const sys = systemQuery.data;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">设置</CardTitle>
            <CardDescription>本地工作区状态、模型连接，以及新建项目时使用的默认值。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border bg-slate-950/40 px-4 py-4">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <p className="font-medium">工作区与数据目录</p>
              </div>
              {systemQuery.isLoading ? (
                <p className="mt-3 text-sm text-muted-foreground">读取中…</p>
              ) : systemQuery.isError ? (
                <p className="mt-3 text-sm text-amber-300">无法读取系统信息，请确认 API 服务已启动。</p>
              ) : sys ? (
                <div className="mt-2">
                  <InfoRow label="项目数" value={`${sys.projectCount} 个`} />
                  <InfoRow label="磁盘占用" value={formatBytes(sys.storageBytes)} />
                  <InfoRow label="数据目录" value={sys.dataDir} mono />
                  <InfoRow label="项目目录" value={sys.projectsDir} mono />
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-slate-950/40 px-4 py-4">
              <div className="flex items-center gap-2">
                <Server className="size-4 text-primary" />
                <p className="font-medium">API 服务</p>
              </div>
              {sys ? (
                <div className="mt-2">
                  <InfoRow label="后端版本" value={`v${sys.version}`} />
                  <InfoRow label="运行模式" value={sys.providerMode} />
                  <InfoRow label="providers.json" value={sys.providersPath} mono />
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">模型连接</CardTitle>
            <CardDescription>
              连接信息在
              <Link to="/providers" className="mx-1 text-primary underline-offset-4 hover:underline">
                模型提供方
              </Link>
              页面配置，这里只展示当前状态。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sys ? (
              <>
                <div className="rounded-lg border border-border bg-slate-950/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">LLM（文本模型）</p>
                    <StatusPill ok={sys.llm.configured} okText="已连接" badText="未配置" />
                  </div>
                  {sys.llm.configured ? (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {sys.llm.model || "(未指定模型)"} · {sys.llm.baseUrl}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-slate-950/40 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">TTS（语音合成）</p>
                    <StatusPill ok={sys.tts.configured} okText="已连接" badText="未配置" />
                  </div>
                  {sys.tts.configured ? (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {sys.tts.voice || "(默认音色)"} · {sys.tts.baseUrl}
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">读取中…</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-lg">新项目默认值</CardTitle>
          <CardDescription>创建新项目时预填这些值，可在创建页临时改动。</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate(draft);
            }}
          >
            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">
                默认目标时长（秒）：{draft.newProjectDurationSeconds}
              </span>
              <Input
                aria-label="默认目标时长"
                type="number"
                min={60}
                max={240}
                value={draft.newProjectDurationSeconds}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setDraft((d) => ({ ...d, newProjectDurationSeconds: value }));
                }}
              />
              <Input
                aria-label="默认目标时长滑块"
                type="range"
                min={60}
                max={240}
                value={draft.newProjectDurationSeconds}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  setDraft((d) => ({ ...d, newProjectDurationSeconds: value }));
                }}
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">默认主题</span>
              <select
                aria-label="默认主题"
                className="h-10 w-full rounded-md border border-input bg-slate-950/60 px-3 text-sm"
                value={draft.newProjectTheme}
                onChange={(event) => {
                  const value = event.currentTarget.value as AppSettings["newProjectTheme"];
                  setDraft((d) => ({ ...d, newProjectTheme: value }));
                }}
              >
                {THEME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "保存中…" : "保存设置"}
              </Button>
              {sys ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FolderOpen className="size-3.5" /> 写入 {sys.dataDir}/settings/app.json
                </span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
