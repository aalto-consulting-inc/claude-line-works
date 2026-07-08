import * as os from "node:os";
import * as path from "node:path";

export interface ServerConfig {
  clientId: string;
  clientSecret: string;
  callbackPort: number;
  dataDir: string;
  scope: string;
}

/** 環境変数(.mcp.json の env 経由で userConfig が入る)から設定を読む。 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const clientId = (env.LW_CLIENT_ID ?? "").trim();
  const clientSecret = (env.LW_CLIENT_SECRET ?? "").trim();
  const portRaw = (env.LW_CALLBACK_PORT ?? "").trim();
  const port = Number.parseInt(portRaw, 10);
  const dataDir =
    (env.LW_DATA_DIR ?? "").trim() ||
    path.join(os.homedir(), ".line-works-mcp");
  return {
    clientId,
    clientSecret,
    callbackPort: Number.isFinite(port) && port > 0 ? port : 9876,
    dataDir,
    scope: (env.LW_SCOPE ?? "").trim() || "board.read",
  };
}

/** 未設定項目の一覧。空なら設定完了。 */
export function missingConfig(config: ServerConfig): string[] {
  const missing: string[] = [];
  if (!config.clientId) missing.push("client_id (Client ID)");
  if (!config.clientSecret) missing.push("client_secret (Client Secret)");
  return missing;
}
