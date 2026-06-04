#!/usr/bin/env node
// 一处改版本，全仓库同步。
// 用法: node scripts/bump-version.mjs <X.Y.Z>
//   会写入：根 package.json、各 workspace 包的 package.json、server/app/main.py 的 FastAPI version。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("用法: node scripts/bump-version.mjs <X.Y.Z>（语义化版本，如 0.2.0）");
  process.exit(1);
}

const pkgFiles = [
  "package.json",
  "apps/web/package.json",
  "apps/render/package.json",
  "packages/scenes/package.json",
  "packages/shared/package.json",
];

for (const rel of pkgFiles) {
  const p = join(root, rel);
  const json = JSON.parse(readFileSync(p, "utf8"));
  json.version = version;
  writeFileSync(p, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`✓ ${rel} -> ${version}`);
}

// 后端 FastAPI 版本号
const mainPy = join(root, "server/app/main.py");
const py = readFileSync(mainPy, "utf8");
const versionRe = /(FastAPI\(title="[^"]*",\s*version=")[^"]*(")/;
if (!versionRe.test(py)) {
  console.warn("⚠ server/app/main.py 未找到 FastAPI(version=...)，请手动确认");
} else {
  writeFileSync(mainPy, py.replace(versionRe, `$1${version}$2`));
  console.log(`✓ server/app/main.py -> ${version}`);
}

console.log(`\n完成。接着可执行：\n  git commit -am "chore: 发布 v${version}"\n  git tag -a v${version} -m "v${version}"\n  git push origin main --tags`);
