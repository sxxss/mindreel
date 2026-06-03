// 网页版导出 CLI：把某个项目的 scene-spec / timeline / voice-track 拼成一份自包含的
// 交互 HTML 课件（音频内嵌为 base64），写到 --output。供 Python 后端以子进程方式调用：
//   pnpm -F @auto/render export-web --project=<id> --output=<path>
// 共用 @auto/shared 的主题系统，保证「视频 / 预览 / 网页」三处画面一致。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SceneSpecListSchema,
  TimelineSchema,
  VoiceTrackSchema,
  type Project,
} from "@auto/shared";

import { buildWebDeck } from "../web-deck-exporter.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultDataDir = process.env.AUTO_DATA_DIR ? resolve(process.env.AUTO_DATA_DIR) : join(repoRoot, "data");

const parseArgs = () => {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 1) {
    const cur = process.argv[i]!;
    if (cur.startsWith("--") && cur.includes("=")) {
      const [k, ...v] = cur.split("=");
      args.set(k!, v.join("="));
    } else if (cur.startsWith("--")) {
      args.set(cur, process.argv[i + 1] ?? "");
      i += 1;
    }
  }
  return args;
};

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;

const artifactPath = (dataDir: string, project: Project, kind: "scene-spec" | "voice-track" | "timeline") => {
  const latest = project.latestArtifacts[kind];
  if (latest === undefined) throw new Error(`Project ${project.id} has no latest ${kind} artifact.`);
  return join(dataDir, "projects", project.id, "artifacts", kind, `v${latest.version.toString().padStart(4, "0")}.json`);
};

const resolveMediaPath = (dataDir: string, p: string) => {
  if (p.startsWith("/")) return p;
  if (p.startsWith("data/")) return resolve(repoRoot, p);
  return resolve(dataDir, p);
};

const main = async () => {
  const args = parseArgs();
  const projectId = args.get("--project");
  const outputPath = args.get("--output");
  if (!projectId || !outputPath) {
    throw new Error("Usage: pnpm -F @auto/render export-web --project=<id> --output=<path>");
  }
  const dataDir = defaultDataDir;
  const project = (await readJson(join(dataDir, "projects", projectId, "project.json"))) as Project;
  const sceneSpecs = SceneSpecListSchema.parse(await readJson(artifactPath(dataDir, project, "scene-spec")));
  const timeline = TimelineSchema.parse(await readJson(artifactPath(dataDir, project, "timeline")));
  const voiceTrack = VoiceTrackSchema.parse(await readJson(artifactPath(dataDir, project, "voice-track")));

  // 把每个 beat 的音频读成 base64 内嵌。
  const audioByBeatId = new Map<string, { base64: string; mime: string }>();
  for (const cue of voiceTrack.cues) {
    try {
      const bytes = await readFile(resolveMediaPath(dataDir, cue.audioPath));
      audioByBeatId.set(cue.beatId, { base64: bytes.toString("base64"), mime: cue.mimeType || "audio/mpeg" });
    } catch {
      // 缺音频就跳过（该页用 duration 兜底自动翻页）。
    }
  }

  const html = buildWebDeck({
    projectTitle: project.title,
    projectTopic: project.topic,
    themeId: project.theme,
    sceneSpecs,
    timeline,
    voiceTrack,
    audioByBeatId,
  });

  const out = resolve(repoRoot, outputPath);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");
  console.log(JSON.stringify({ projectId, outputPath: out, slides: voiceTrack.cues.length }));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
