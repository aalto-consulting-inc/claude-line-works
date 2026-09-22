import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { escapeHtml, NeedsAuthorizationError, OAuthManager } from "../src/oauth.js";

let dataDir: string;

const tokenResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function makeManager(fetchFn: typeof fetch, now = () => 1_000_000) {
  return new OAuthManager({
    clientId: "cid",
    clientSecret: "secret",
    callbackPort: 0, // テストではエフェメラルポートは使わず buildAuthorizeUrl 等のみ検証
    dataDir,
    scope: "board.read",
    fetchFn,
    now,
  });
}

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lw-oauth-"));
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

describe("buildAuthorizeUrl", () => {
  it("必要なパラメータをすべて含む", () => {
    const m = makeManager(vi.fn() as unknown as typeof fetch);
    const url = new URL(m.buildAuthorizeUrl("st123"));
    expect(url.origin + url.pathname).toBe(
      "https://auth.worksmobile.com/oauth2/v2.0/authorize"
    );
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("board.read");
    expect(url.searchParams.get("state")).toBe("st123");
    expect(url.searchParams.get("redirect_uri")).toContain("/callback");
  });
});

describe("exchangeCode", () => {
  it("フォームを POST してトークンを保存する", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at1", refresh_token: "rt1", expires_in: 86400 })
    );
    const m = makeManager(fetchFn as unknown as typeof fetch);
    await m.exchangeCode("thecode");

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://auth.worksmobile.com/oauth2/v2.0/token");
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("thecode");

    // 別インスタンスからファイル経由で読める
    const m2 = makeManager(fetchFn as unknown as typeof fetch);
    expect(await m2.getAccessToken()).toBe("at1");
  });

  it("失敗時のエラーメッセージにトークンや code を含めない", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response("bad request with secret stuff", { status: 400 })
    );
    const m = makeManager(fetchFn as unknown as typeof fetch);
    await expect(m.exchangeCode("thecode")).rejects.toThrow(/HTTP 400/);
    await expect(m.exchangeCode("thecode")).rejects.not.toThrow(/thecode/);
  });
});

describe("getAccessToken", () => {
  it("トークンがなければ NeedsAuthorizationError", async () => {
    const m = makeManager(vi.fn() as unknown as typeof fetch);
    await expect(m.getAccessToken()).rejects.toBeInstanceOf(NeedsAuthorizationError);
  });

  it("有効期限内ならリフレッシュせずに返す", async () => {
    const fetchFn = vi.fn();
    const m = makeManager(fetchFn as unknown as typeof fetch, () => 1_000_000);
    await m.saveTokens({ accessToken: "at", refreshToken: "rt", expiresAt: 2_000_000 });
    expect(await m.getAccessToken()).toBe("at");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("期限切れならリフレッシュする", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at2", expires_in: 86400 })
    );
    const m = makeManager(fetchFn as unknown as typeof fetch, () => 1_000_000);
    await m.saveTokens({ accessToken: "old", refreshToken: "rt", expiresAt: 1_000_001 });
    expect(await m.getAccessToken()).toBe("at2");
    const form = new URLSearchParams(fetchFn.mock.calls[0][1].body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rt");
  });

  it("リフレッシュトークンがローテーションされない場合は既存を維持する", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at2", expires_in: 86400 }) // refresh_token なし
    );
    const m = makeManager(fetchFn as unknown as typeof fetch, () => 1_000_000);
    await m.saveTokens({ accessToken: "old", refreshToken: "rt", expiresAt: 0 });
    await m.getAccessToken();
    const saved = JSON.parse(await fs.readFile(path.join(dataDir, "tokens.json"), "utf8"));
    expect(saved.refreshToken).toBe("rt");
  });

  it("リフレッシュ失敗(90日失効など)は再認可を促すエラーになる", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("expired", { status: 400 }));
    const m = makeManager(fetchFn as unknown as typeof fetch, () => 1_000_000);
    await m.saveTokens({ accessToken: "old", refreshToken: "rt", expiresAt: 0 });
    await expect(m.getAccessToken()).rejects.toBeInstanceOf(NeedsAuthorizationError);
  });
});

describe("completeWithPastedInput", () => {
  it("URL 貼り付けから code を取り出して交換する", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 86400 })
    );
    const m = makeManager(fetchFn as unknown as typeof fetch);
    await m.completeWithPastedInput(
      "http://localhost:9876/callback?code=abc123&state=whatever"
    );
    const form = new URLSearchParams(fetchFn.mock.calls[0][1].body);
    expect(form.get("code")).toBe("abc123");
  });

  it("code 単体の貼り付けも受け付ける", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at", expires_in: 86400 })
    );
    const m = makeManager(fetchFn as unknown as typeof fetch);
    await m.completeWithPastedInput("  raw-code-value  ");
    const form = new URLSearchParams(fetchFn.mock.calls[0][1].body);
    expect(form.get("code")).toBe("raw-code-value");
  });
});

describe("startAuthorization + コールバック", () => {
  it("コールバックで code を受けてトークンを保存し、成功ページを返す", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tokenResponse({ access_token: "at", refresh_token: "rt", expires_in: 86400 })
    );
    // 空きポートを確保
    const net = await import("node:net");
    const port = await new Promise<number>((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    const m = new OAuthManager({
      clientId: "cid",
      clientSecret: "secret",
      callbackPort: port,
      dataDir,
      scope: "board.read",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    try {
      const { authorizeUrl } = await m.startAuthorization();
      const state = new URL(authorizeUrl).searchParams.get("state");
      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=cb-code&state=${state}`
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("認可が完了しました");
      expect(await m.getAccessToken()).toBe("at");
    } finally {
      m.stopCallbackServer();
    }
  });

  it("state 不一致はエラーページになりトークンを保存しない", async () => {
    const fetchFn = vi.fn();
    const net = await import("node:net");
    const port = await new Promise<number>((resolve) => {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const p = (s.address() as { port: number }).port;
        s.close(() => resolve(p));
      });
    });
    const m = new OAuthManager({
      clientId: "cid",
      clientSecret: "secret",
      callbackPort: port,
      dataDir,
      scope: "board.read",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    try {
      await m.startAuthorization();
      const res = await fetch(
        `http://127.0.0.1:${port}/callback?code=cb-code&state=WRONG`
      );
      expect(res.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      m.stopCallbackServer();
    }
  });
});

describe("escapeHtml", () => {
  it("HTML の特殊文字をすべてエスケープする", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("& を二重エスケープしない", () => {
    // & を最初に置換しないと "&lt;" が "&amp;lt;" になる
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("認可エラーに混入したスクリプトを無害化する", () => {
    // コールバック URL の error パラメータは呼び出し側が自由に指定できる
    const injected = '認可が拒否されました (<script>alert(1)</script>)';
    expect(escapeHtml(injected)).not.toContain("<script>");
    expect(escapeHtml(injected)).toContain("&lt;script&gt;");
  });

  it("通常の文字列は変更しない", () => {
    expect(escapeHtml("state が一致しません")).toBe("state が一致しません");
  });
});
