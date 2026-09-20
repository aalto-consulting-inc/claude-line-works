import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";

export const AUTH_BASE_URL = "https://auth.worksmobile.com/oauth2/v2.0";

/** トークンがなく、ブラウザでの認可が必要なときに投げる。ツール層で案内文に変換する。 */
export class NeedsAuthorizationError extends Error {
  constructor(message = "LINE WORKS の認可が必要です") {
    super(message);
    this.name = "NeedsAuthorizationError";
  }
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** epoch ミリ秒 */
  expiresAt: number;
}

export interface OAuthOptions {
  clientId: string;
  clientSecret: string;
  callbackPort: number;
  dataDir: string;
  scope: string;
  authBaseUrl?: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}

/** アクセストークン失効の何ミリ秒前から「期限切れ」とみなすか。 */
const EXPIRY_MARGIN_MS = 60_000;
/** コールバック待ち受けサーバーの自動終了までの時間。 */
const CALLBACK_TIMEOUT_MS = 10 * 60_000;

const CALLBACK_SUCCESS_HTML = `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>認可完了</title>
<body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">
<h1>認可が完了しました</h1>
<p>このタブを閉じて、Claude に戻ってください。</p>
</body></html>`;

const callbackErrorHtml = (message: string) => `<!doctype html><html lang="ja"><meta charset="utf-8">
<title>認可エラー</title>
<body style="font-family: sans-serif; text-align: center; padding-top: 4rem;">
<h1>認可に失敗しました</h1>
<p>${message}</p>
<p>Claude に戻って、もう一度お試しください。</p>
</body></html>`;

export class OAuthManager {
  private readonly opts: Required<Pick<OAuthOptions, "authBaseUrl">> & OAuthOptions;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private tokens: TokenSet | null = null;
  private pendingState: string | null = null;
  private callbackServer: Server | null = null;
  private callbackTimer: NodeJS.Timeout | null = null;

  constructor(options: OAuthOptions) {
    this.opts = { authBaseUrl: AUTH_BASE_URL, ...options };
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get redirectUri(): string {
    return `http://localhost:${this.opts.callbackPort}/callback`;
  }

  private get tokenFile(): string {
    return path.join(this.opts.dataDir, "tokens.json");
  }

  buildAuthorizeUrl(state: string): string {
    const url = new URL(`${this.opts.authBaseUrl}/authorize`);
    url.searchParams.set("client_id", this.opts.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.opts.scope);
    url.searchParams.set("state", state);
    return url.toString();
  }

  /**
   * 認可フローを開始する。127.0.0.1 でコールバック受け口を立て、
   * 利用者がブラウザで開くべき認可 URL を返す。
   * code はバックグラウンドで受領・交換・保存される。
   */
  async startAuthorization(): Promise<{ authorizeUrl: string; redirectUri: string }> {
    this.stopCallbackServer();
    const state = randomBytes(16).toString("hex");
    this.pendingState = state;

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${this.opts.callbackPort}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const gotState = url.searchParams.get("state");
      const oauthError = url.searchParams.get("error");
      try {
        if (oauthError) throw new Error(`認可が拒否されました (${oauthError})`);
        if (!code) throw new Error("code がありません");
        if (gotState !== this.pendingState) throw new Error("state が一致しません");
        await this.exchangeCode(code);
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(CALLBACK_SUCCESS_HTML);
        this.stopCallbackServer();
      } catch (e) {
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        res.end(callbackErrorHtml(e instanceof Error ? e.message : String(e)));
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // Windows ファイアウォールのプロンプトを避けるためループバック限定でバインドする
      server.listen(this.opts.callbackPort, "127.0.0.1", () => resolve());
    });
    this.callbackServer = server;
    this.callbackTimer = setTimeout(() => this.stopCallbackServer(), CALLBACK_TIMEOUT_MS);
    this.callbackTimer.unref?.();

    return { authorizeUrl: this.buildAuthorizeUrl(state), redirectUri: this.redirectUri };
  }

  stopCallbackServer(): void {
    if (this.callbackTimer) {
      clearTimeout(this.callbackTimer);
      this.callbackTimer = null;
    }
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  /**
   * 手動貼り付けフォールバック: リダイレクト先 URL 全体、または code 単体を受け取る。
   * URL で渡された場合は state も検証する。
   */
  async completeWithPastedInput(input: string): Promise<void> {
    let code = input.trim();
    if (/^https?:\/\//i.test(code)) {
      const url = new URL(code);
      const pastedCode = url.searchParams.get("code");
      const pastedState = url.searchParams.get("state");
      if (!pastedCode) throw new Error("貼り付けられた URL に code が含まれていません");
      if (this.pendingState && pastedState !== this.pendingState) {
        throw new Error("state が一致しません。authorize をやり直してください");
      }
      code = pastedCode;
    }
    await this.exchangeCode(code);
    this.stopCallbackServer();
  }

  async exchangeCode(code: string): Promise<TokenSet> {
    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      redirect_uri: this.redirectUri,
    });
    this.pendingState = null;
    await this.saveTokens(tokens);
    return tokens;
  }

  /** 有効なアクセストークンを返す。必要ならリフレッシュ。なければ NeedsAuthorizationError。 */
  async getAccessToken(): Promise<string> {
    const tokens = await this.loadTokens();
    if (!tokens) throw new NeedsAuthorizationError();
    if (tokens.expiresAt - EXPIRY_MARGIN_MS > this.now()) {
      return tokens.accessToken;
    }
    return this.forceRefresh();
  }

  /** アクセストークンを強制的にリフレッシュする(401 を受けた場合など)。 */
  async forceRefresh(): Promise<string> {
    const tokens = await this.loadTokens();
    if (!tokens?.refreshToken) throw new NeedsAuthorizationError();
    let refreshed: TokenSet;
    try {
      refreshed = await this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
      });
    } catch {
      // リフレッシュトークン失効(発行から90日)など。再認可してもらう。
      throw new NeedsAuthorizationError(
        "アクセス権の有効期限が切れました。authorize でもう一度ログインしてください"
      );
    }
    // LINE WORKS がローテーションしない場合は既存の refresh_token を維持する
    if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken;
    await this.saveTokens(refreshed);
    return refreshed.accessToken;
  }

  private async tokenRequest(form: Record<string, string>): Promise<TokenSet> {
    const res = await this.fetchFn(`${this.opts.authBaseUrl}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      // トークンや code はログに出さない
      throw new Error(`トークン取得に失敗しました (HTTP ${res.status})`);
    }
    const body = JSON.parse(text) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number | string;
    };
    if (!body.access_token) {
      throw new Error("トークンレスポンスに access_token がありません");
    }
    const expiresIn = Number(body.expires_in ?? 3600);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: this.now() + expiresIn * 1000,
    };
  }

  async loadTokens(): Promise<TokenSet | null> {
    if (this.tokens) return this.tokens;
    try {
      const raw = await fs.readFile(this.tokenFile, "utf8");
      this.tokens = JSON.parse(raw) as TokenSet;
      return this.tokens;
    } catch {
      return null;
    }
  }

  async saveTokens(tokens: TokenSet): Promise<void> {
    this.tokens = tokens;
    await fs.mkdir(this.opts.dataDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.tokenFile, JSON.stringify(tokens), { encoding: "utf8", mode: 0o600 });
    await fs.chmod(this.tokenFile, 0o600).catch(() => undefined);
  }

  async hasTokens(): Promise<boolean> {
    return (await this.loadTokens()) !== null;
  }
}
