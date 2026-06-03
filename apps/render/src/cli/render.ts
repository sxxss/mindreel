import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import {
  RenderArtifactSchema,
  RenderCompositionInputSchema,
  SceneSpecListSchema,
  TimelineSchema,
  VoiceTrackSchema,
  type Project,
} from "@auto/shared";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const defaultDataDir = process.env.AUTO_DATA_DIR
  ? resolve(process.env.AUTO_DATA_DIR)
  : join(repoRoot, "data");

const parseArgs = () => {
  const args = new Map<string, string>();
  for (let index = 2; index < process.argv.length; index += 1) {
    const current = process.argv[index]!;
    if (current.startsWith("--") && current.includes("=")) {
      const [key, ...valueParts] = current.split("=");
      if (key === undefined) {
        throw new Error(`Invalid argument ${current}`);
      }
      args.set(key, valueParts.join("="));
      continue;
    }
    if (current.startsWith("--")) {
      const value = process.argv[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${current}`);
      }
      args.set(current, value);
      index += 1;
    }
  }
  return args;
};

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8")) as unknown;

const artifactPath = (
  dataDir: string,
  project: Project,
  kind: "scene-spec" | "voice-track" | "timeline",
) => {
  const latest = project.latestArtifacts[kind];
  if (latest === undefined) {
    throw new Error(`Project ${project.id} has no latest ${kind} artifact.`);
  }
  return join(
    dataDir,
    "projects",
    project.id,
    "artifacts",
    kind,
    `v${latest.version.toString().padStart(4, "0")}.json`,
  );
};

const resolveMediaPath = (dataDir: string, path: string) => {
  if (path.startsWith("/")) {
    return path;
  }
  if (path.startsWith("data/")) {
    return resolve(repoRoot, path);
  }
  return resolve(dataDir, path);
};

const toDataUrl = async (dataDir: string, path: string, mimeType: string) => {
  if (path.startsWith("data:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const bytes = await readFile(resolveMediaPath(dataDir, path));
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
};

const loadRenderInput = async (projectId: string, dataDir: string) => {
  const project = RenderCompositionInputSchema.shape.project.parse(
    await readJson(join(dataDir, "projects", projectId, "project.json")),
  );
  const sceneSpecs = SceneSpecListSchema.parse(
    await readJson(artifactPath(dataDir, project, "scene-spec")),
  );
  const voiceTrack = VoiceTrackSchema.parse(
    await readJson(artifactPath(dataDir, project, "voice-track")),
  );
  const timeline = TimelineSchema.parse(await readJson(artifactPath(dataDir, project, "timeline")));
  const voiceTrackWithDataUrls = {
    cues: await Promise.all(
      voiceTrack.cues.map(async (cue) => ({
        ...cue,
        audioPath: await toDataUrl(dataDir, cue.audioPath, cue.mimeType),
      })),
    ),
  };

  return RenderCompositionInputSchema.parse({
    project,
    sceneSpecs,
    voiceTrack: voiceTrackWithDataUrls,
    timeline,
  });
};

export const renderProject = async (args: {
  projectId: string;
  outputPath: string;
  dataDir?: string;
}) => {
  const dataDir = args.dataDir ?? defaultDataDir;
  const input = await loadRenderInput(args.projectId, dataDir);
  await mkdir(dirname(args.outputPath), { recursive: true });
  const entryPoint = join(repoRoot, "apps", "render", "src", "remotion-entry.ts");
  const serveUrl = await bundle({ entryPoint });
  const composition = await selectComposition({
    serveUrl,
    id: "KnowledgeVideo",
    inputProps: input,
  });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: args.outputPath,
    inputProps: input,
    concurrency: 1,
  });

  return RenderArtifactSchema.parse({
    projectId: args.projectId,
    outputPath: args.outputPath,
    relativePath: relative(dataDir, args.outputPath),
    durationMs: input.timeline.durationMs,
    fps: 30,
    width: 1920,
    height: 1080,
    renderedAt: new Date().toISOString(),
  });
};

const main = async () => {
  const args = parseArgs();
  const projectId = args.get("--project");
  const outputPath = args.get("--output");
  if (projectId === undefined || outputPath === undefined) {
    throw new Error("Usage: pnpm -F @auto/render render --project=<id> --output=<path>");
  }
  const artifact = await renderProject({
    projectId,
    outputPath: resolve(repoRoot, outputPath),
  });
  console.log(JSON.stringify(artifact, null, 2));
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
