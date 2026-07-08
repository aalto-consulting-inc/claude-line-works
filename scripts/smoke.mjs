// dist/server.js を起動し、MCP initialize → tools/list が返るか確認するスモークテスト。
// 使い方: node scripts/smoke.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverPath = path.join(root, "dist", "server.js");

const EXPECTED_TOOLS = ["authorize", "list_boards", "list_posts", "get_post", "list_comments"];

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, LW_CLIENT_ID: "smoke", LW_CLIENT_SECRET: "smoke" },
});

const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

let buffer = "";
const responses = new Map();

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("timeout: MCP サーバーが応答しません")), 15000);
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined) responses.set(msg.id, msg);
      if (responses.has(2)) {
        clearTimeout(timer);
        resolve();
      }
    }
  });
  child.on("error", reject);
  child.on("exit", (code) => {
    if (!responses.has(2)) reject(new Error(`サーバーが終了しました (exit ${code})`));
  });
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  },
});
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

try {
  await done;
  const tools = responses.get(2).result.tools.map((t) => t.name).sort();
  const missing = EXPECTED_TOOLS.filter((t) => !tools.includes(t));
  if (missing.length > 0) {
    throw new Error(`ツールが不足しています: ${missing.join(", ")} (実際: ${tools.join(", ")})`);
  }
  console.log(`OK: ${tools.length} tools — ${tools.join(", ")}`);
} finally {
  child.kill();
}
