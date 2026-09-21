import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { missingConfig } from "./config.js";
import { NeedsAuthorizationError, type OAuthManager } from "./oauth.js";
import { WorksApiError, type WorksApiClient } from "./client.js";
import { htmlToMarkdown } from "./html.js";

/** デフォルトブラウザで URL を開く。OS 別に open / start / xdg-open を使い分ける。失敗しても投げない。 */
function openInBrowser(url: string): boolean {
  try {
    let command: string;
    let args: string[];
    if (process.platform === "darwin") {
      command = "open";
      args = [url];
    } else if (process.platform === "win32") {
      command = "cmd";
      args = ["/c", "start", "", url];
    } else {
      command = "xdg-open";
      args = [url];
    }
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
    child.on("error", () => undefined);
    return true;
  } catch {
    return false;
  }
}

export interface ToolDeps {
  config: ServerConfig;
  oauth: OAuthManager;
  client: WorksApiClient;
}

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const text = (s: string): ToolResult => ({ content: [{ type: "text", text: s }] });
const errorText = (s: string): ToolResult => ({
  content: [{ type: "text", text: s }],
  isError: true,
});

const SETUP_GUIDE = (missing: string[]) =>
  `LINE WORKS プラグインの設定が完了していません。未設定: ${missing.join(", ")}\n` +
  `プラグインの設定画面(userConfig)で、管理者から共有された Client ID / Client Secret を入力してください。\n` +
  `詳しい手順: リポジトリの docs/setup-user.md を参照。`;

const AUTHORIZE_GUIDE =
  `まだ LINE WORKS へのログイン認可が済んでいません。` +
  `authorize ツールを実行し、表示される URL をブラウザで開いてログインしてください。`;

async function run(deps: ToolDeps, fn: () => Promise<ToolResult>): Promise<ToolResult> {
  const missing = missingConfig(deps.config);
  if (missing.length > 0) return errorText(SETUP_GUIDE(missing));
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NeedsAuthorizationError) {
      return errorText(`${e.message}。${AUTHORIZE_GUIDE}`);
    }
    if (e instanceof WorksApiError) {
      return errorText(e.message);
    }
    return errorText(
      `予期しないエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2));

const paginationParams = {
  count: z.number().int().min(1).max(40).optional()
    .describe("取得件数 (既定 20、最大 40)"),
  cursor: z.string().optional()
    .describe("前回レスポンスの responseMetaData.nextCursor。続きを取得するときに指定"),
};

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.tool(
    "authorize",
    "LINE WORKS へのログイン認可を行う。引数なしで呼ぶと認可 URL を発行する(利用者がブラウザで開く)。" +
      "ブラウザ認可後に自動で完了しない環境では、リダイレクト先 URL(または code)を code_or_url に貼り付けて再実行する。",
    {
      code_or_url: z.string().optional()
        .describe("手動フォールバック用: 認可後にブラウザのアドレスバーに表示された URL 全体、または code の値"),
    },
    async ({ code_or_url }) =>
      run(deps, async () => {
        if (code_or_url) {
          await deps.oauth.completeWithPastedInput(code_or_url);
          return text("認可が完了しました。list_boards などで掲示板を読み取れます。");
        }
        const { authorizeUrl } = await deps.oauth.startAuthorization();
        const opened = openInBrowser(authorizeUrl);
        return text(
          `【LLM への指示】この応答は Claude Desktop 等の UI で折り畳まれる場合があるため、` +
            `下記の認可 URL を必ずアシスタントの本文にも Markdown リンクとして書き出し、` +
            `利用者がクリックできる状態で提示してください。\n\n` +
            `認可 URL: ${authorizeUrl}\n` +
            `既定ブラウザを自動起動: ${opened ? "成功(利用者のブラウザで認可ページが開いた想定)" : "失敗(利用者にリンクを提示して手動で開いてもらう)"}\n\n` +
            `【利用者向けの案内テンプレート(そのまま出力してよい)】\n` +
            (opened
              ? `LINE WORKS のログイン画面をブラウザで開きました。ログインして「許可」を押してください。もし開かなかった場合は次のリンクからどうぞ:\n` +
                `[LINE WORKS にログインして認可する](${authorizeUrl})\n`
              : `認可が必要です。次のリンクをクリックしてブラウザで LINE WORKS にログインし、「許可」を押してください:\n` +
                `[LINE WORKS にログインして認可する](${authorizeUrl})\n`) +
            `完了すると「認可が完了しました」というページが表示されます。\n` +
            `もしブラウザにエラーページ(接続できません等)が表示された場合は、そのページの URL をアドレスバーからコピーし、` +
            `「この URL で認可を完了して: (貼り付け)」と伝えてください(内部的に authorize ツールの code_or_url に渡されます)。`
        );
      })
  );

  server.tool(
    "list_boards",
    "アクセス可能な LINE WORKS 掲示板の一覧を取得する",
    { ...paginationParams },
    async ({ count, cursor }) =>
      run(deps, async () => json(await deps.client.listBoards({ count, cursor })))
  );

  server.tool(
    "list_recent_posts",
    "利用者が『新規投稿通知 ON』に設定している掲示板からの新着投稿一覧を取得する(LINE WORKS の /boards/recent/posts。通知設定していない場合は空になる)。空だったら list_boards → list_posts で個別に取得すること",
    { ...paginationParams },
    async ({ count, cursor }) =>
      run(deps, async () => json(await deps.client.listRecentPosts({ count, cursor })))
  );

  server.tool(
    "list_posts",
    "指定した掲示板の投稿一覧を取得する",
    {
      boardId: z.string().describe("掲示板 ID (list_boards で取得)"),
      ...paginationParams,
    },
    async ({ boardId, count, cursor }) =>
      run(deps, async () => json(await deps.client.listPosts(boardId, { count, cursor })))
  );

  server.tool(
    "get_post",
    "投稿の本文を取得する。本文は HTML から Markdown に変換して返す",
    {
      boardId: z.string().describe("掲示板 ID"),
      postId: z.string().describe("投稿 ID (list_posts で取得)"),
    },
    async ({ boardId, postId }) =>
      run(deps, async () => {
        const post = (await deps.client.getPost(boardId, postId)) as Record<string, unknown>;
        return text(formatPostMarkdown(post));
      })
  );

}

/** 本文フィールド名は API により揺れる可能性があるため候補から探す (docs/api-notes.md で確定させる) */
const BODY_FIELD_CANDIDATES = ["body", "contents", "content", "bodyText"];

export function formatPostMarkdown(post: Record<string, unknown>): string {
  const title = typeof post.title === "string" ? post.title : "(無題)";
  let bodyMarkdown = "";
  const rest: Record<string, unknown> = { ...post };
  delete rest.title;
  for (const field of BODY_FIELD_CANDIDATES) {
    if (typeof post[field] === "string") {
      bodyMarkdown = htmlToMarkdown(post[field] as string);
      delete rest[field];
      break;
    }
  }
  // 実 API は plainTextBody も返す(改行が失われた本文の重複)。body 不在時のフォールバックにのみ使う
  if (!bodyMarkdown && typeof post.plainTextBody === "string") {
    bodyMarkdown = post.plainTextBody;
  }
  delete rest.plainTextBody;
  const lines = [`# ${title}`, ""];
  if (bodyMarkdown) {
    lines.push(bodyMarkdown, "");
  }
  lines.push("---", "投稿メタデータ:", "```json", JSON.stringify(rest, null, 2), "```");
  return lines.join("\n");
}
