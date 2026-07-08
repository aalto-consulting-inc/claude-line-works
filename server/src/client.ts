export const API_BASE_URL = "https://www.worksapis.com/v1.0";

export class WorksApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "WorksApiError";
  }
}

interface AuthProvider {
  getAccessToken(): Promise<string>;
  forceRefresh(): Promise<string>;
}

export interface ClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  /** テストで待ち時間を消すために注入可能 */
  sleep?: (ms: number) => Promise<void>;
}

export type Query = Record<string, string | number | undefined>;

const MAX_RETRIES = 3;

/**
 * worksapis.com の薄い REST クライアント。
 * エンドポイントパスは Phase 0 の curl 検証 (docs/api-notes.md) に合わせてここだけを直す。
 */
export class WorksApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly auth: AuthProvider,
    options: ClientOptions = {}
  ) {
    this.baseUrl = options.baseUrl ?? API_BASE_URL;
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  listBoards(query: Query = {}): Promise<unknown> {
    return this.get("/boards", query);
  }

  listPosts(boardId: string, query: Query = {}): Promise<unknown> {
    return this.get(`/boards/${encodeURIComponent(boardId)}/posts`, query);
  }

  getPost(boardId: string, postId: string): Promise<unknown> {
    return this.get(
      `/boards/${encodeURIComponent(boardId)}/posts/${encodeURIComponent(postId)}`
    );
  }

  listComments(boardId: string, postId: string, query: Query = {}): Promise<unknown> {
    return this.get(
      `/boards/${encodeURIComponent(boardId)}/posts/${encodeURIComponent(postId)}/comments`,
      query
    );
  }

  async get(pathname: string, query: Query = {}): Promise<unknown> {
    const url = new URL(this.baseUrl + pathname);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }

    let token = await this.auth.getAccessToken();
    let refreshedOnce = false;

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(url.toString(), {
        headers: { authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        return res.json();
      }

      // トークン失効: 一度だけリフレッシュして再試行
      if (res.status === 401 && !refreshedOnce) {
        refreshedOnce = true;
        token = await this.auth.forceRefresh();
        continue;
      }

      // レート制限・サーバーエラー: 指数バックオフで再試行
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * 2 ** attempt;
        await this.sleep(delayMs);
        continue;
      }

      throw new WorksApiError(res.status, await formatError(res));
    }
  }
}

async function formatError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { code?: string; description?: string; message?: string };
    detail = body.description ?? body.message ?? body.code ?? "";
  } catch {
    // JSON でないエラーボディは無視
  }
  const hints: Record<number, string> = {
    401: "認証に失敗しました。authorize でログインし直してください",
    403: "この掲示板へのアクセス権がないか、アプリのスコープ設定が不足しています",
    404: "指定された掲示板または投稿が見つかりません。ID を確認してください",
    429: "アクセスが集中しています。しばらく待ってからもう一度お試しください",
  };
  const hint = hints[res.status] ?? "LINE WORKS API でエラーが発生しました";
  return detail ? `${hint} (HTTP ${res.status}: ${detail})` : `${hint} (HTTP ${res.status})`;
}
