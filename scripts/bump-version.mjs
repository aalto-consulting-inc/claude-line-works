#!/usr/bin/env node
// version を書いている箇所をまとめて更新する。
//
// 使い方:
//   node scripts/bump-version.mjs 0.3.2           書き換える
//   node scripts/bump-version.mjs 0.3.2 --check   一致しているかだけ確認する(書き換えない)
//
// version は 5 ファイルに散っており、1 つでも古いまま公開すると配布物が名乗る
// バージョンとタグがずれる。書き換えと確認を同じ定義から行うため、
// release.yml のバージョン整合チェックはこのスクリプトの --check を使う。
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const targets = [
  { file: ".claude-plugin/plugin.json", count: 1 },
  { file: "mcpb/manifest.json", count: 1 },
  { file: "server/package.json", count: 1 },
  // ルートと packages[""] の 2 箇所。依存パッケージの version を巻き込まないよう、
  // 最初の "node_modules/..." エントリより前だけを書き換え対象にする
  {
    file: "server/package-lock.json",
    count: 2,
    scopeEnd: (text) => {
      const i = text.indexOf('"node_modules/');
      return i === -1 ? text.length : i;
    },
  },
  // MCP の initialize でクライアントに名乗るバージョン
  { file: "server/src/index.ts", count: 1, source: true },
];

const [version, ...flags] = process.argv.slice(2);
const check = flags.includes("--check");

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("使い方: node scripts/bump-version.mjs <x.y.z> [--check]");
  process.exit(1);
}

// index.ts は JSON ではないので、MCP サーバの生成箇所から直接読む
const sourcePattern = /new McpServer\(\{[^}]*version:\s*"([^"]+)"/;

function currentVersion(target, text) {
  if (target.source) {
    const m = text.match(sourcePattern);
    if (!m) throw new Error("version の記述を見つけられません");
    return m[1];
  }
  const v = JSON.parse(text).version;
  if (typeof v !== "string") throw new Error("version フィールドがありません");
  return v;
}

let failed = false;

for (const target of targets) {
  const file = path.join(root, target.file);
  let text;
  let current;
  try {
    text = readFileSync(file, "utf8");
    current = currentVersion(target, text);
  } catch (e) {
    console.error(`NG  ${target.file}: ${e.message}`);
    failed = true;
    continue;
  }

  if (current === version) {
    console.log(`OK  ${target.file}: ${version}`);
    continue;
  }
  if (check) {
    console.error(`NG  ${target.file}: ${current} (期待値 ${version})`);
    failed = true;
    continue;
  }

  const needle = target.source ? `version: "${current}"` : `"version": "${current}"`;
  const replacement = target.source ? `version: "${version}"` : `"version": "${version}"`;
  const end = target.scopeEnd ? target.scopeEnd(text) : text.length;
  const head = text.slice(0, end);

  const found = head.split(needle).length - 1;
  if (found !== target.count) {
    console.error(`NG  ${target.file}: \`${needle}\` が ${found} 箇所(期待 ${target.count} 箇所)。手で確認が必要`);
    failed = true;
    continue;
  }

  writeFileSync(file, head.split(needle).join(replacement) + text.slice(end));
  console.log(`UP  ${target.file}: ${current} -> ${version}`);
}

if (failed) {
  console.error(
    check
      ? "\nバージョンが揃っていない。`node scripts/bump-version.mjs <x.y.z>` で更新する"
      : "\n更新できなかったファイルがある",
  );
  process.exit(1);
}

if (!check) {
  console.log("\ndist/server.js の再ビルドが必要: cd server && npm run build");
}
