// MCPB(Claude Desktop 用の単一ファイル拡張)をビルドする。
// 1. dist/server.js を staging/server/index.js にコピー
// 2. mcpb/manifest.json を staging/ にコピー
// 3. npx @anthropic-ai/mcpb pack で .mcpb を生成
// 使い方: node scripts/build-mcpb.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import * as path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const staging = path.join(root, "build", "mcpb-staging");
const manifest = path.join(root, "mcpb", "manifest.json");
const serverJs = path.join(root, "dist", "server.js");
const outDir = path.join(root, "build");

if (!existsSync(serverJs)) {
  console.error(`dist/server.js が見つかりません。先に \`npm run build\` を実行してください`);
  process.exit(1);
}
if (!existsSync(manifest)) {
  console.error(`mcpb/manifest.json が見つかりません`);
  process.exit(1);
}

// staging を作り直す
rmSync(staging, { recursive: true, force: true });
mkdirSync(path.join(staging, "server"), { recursive: true });

// server/index.js を配置
cpSync(serverJs, path.join(staging, "server", "index.js"));
// manifest.json を配置
cpSync(manifest, path.join(staging, "manifest.json"));

console.log(`staging directory: ${staging}`);

// mcpb pack を実行
const result = spawnSync("npx", ["-y", "@anthropic-ai/mcpb", "pack", staging, path.join(outDir, "line-works-board.mcpb")], {
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error(`mcpb pack に失敗しました (exit ${result.status})`);
  process.exit(result.status ?? 1);
}

console.log(`\nMCPB を作成しました: ${path.join(outDir, "line-works-board.mcpb")}`);
