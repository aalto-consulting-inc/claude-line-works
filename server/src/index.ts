#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { OAuthManager } from "./oauth.js";
import { WorksApiClient } from "./client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const oauth = new OAuthManager(config);
  const client = new WorksApiClient(oauth);

  const server = new McpServer({ name: "line-works", version: "0.1.0" });
  registerTools(server, { config, oauth, client });

  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  // stdout は MCP プロトコル専用のため、ログは stderr へ
  console.error(e);
  process.exit(1);
});
