import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { missingConfig } from "./config.js";
import { NeedsAuthorizationError, type OAuthManager } from "./oauth.js";
import { WorksApiError, type WorksApiClient } from "./client.js";
import { htmlToMarkdown } from "./html.js";

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
        return text(
          `次の URL をブラウザで開き、LINE WORKS にログインして認可してください:\n\n${authorizeUrl}\n\n` +
            `認可が完了すると「認可が完了しました」というページが表示されます。その後、掲示板の読み取りができます。\n` +
            `もしブラウザにエラーページ(接続できません等)が表示された場合は、そのページの URL をアドレスバーからコピーし、` +
            `authorize ツールの code_or_url に貼り付けて再実行してください。`
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
    "全掲示板を横断して最新の投稿一覧を取得する。掲示板を特定せず「最近のお知らせ」「今週の投稿」をまとめたいときに最初に使う",
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
