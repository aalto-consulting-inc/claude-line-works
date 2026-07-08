import { describe, expect, it, vi } from "vitest";
import { WorksApiClient, WorksApiError, parseJsonSafe } from "../src/client.js";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function makeClient(fetchFn: ReturnType<typeof vi.fn>, auth?: Partial<Auth>) {
  const fullAuth = {
    getAccessToken: vi.fn().mockResolvedValue("token1"),
    forceRefresh: vi.fn().mockResolvedValue("token2"),
    ...auth,
  };
  const client = new WorksApiClient(fullAuth, {
    fetchFn: fetchFn as unknown as typeof fetch,
    sleep: () => Promise.resolve(),
  });
  return { client, auth: fullAuth };
}
type Auth = { getAccessToken(): Promise<string>; forceRefresh(): Promise<string> };

describe("parseJsonSafe", () => {
  // 実測 (docs/api-notes.md 4.1) の縮約版: boardId は 19 桁の数値で返る
  const realWorldFixture =
    '{"boards":[' +
    '{"boardId":4020000001470191001,"boardName":"お知らせ","description":null,' +
    '"tenantBoard":false,"createdTime":"2021-04-07T12:17:59+09:00","displayOrder":20000},' +
    '{"boardId":4090000000118263086,"boardName":"総務関連","description":null,"displayOrder":110000}' +
    '],"responseMetaData":{"nextCursor":null}}';

  it("19 桁の boardId を精度を失わず文字列として取り出せる", () => {
    const parsed = parseJsonSafe(realWorldFixture) as {
      boards: { boardId: string; displayOrder: number }[];
      responseMetaData: { nextCursor: null };
    };
    expect(parsed.boards[0].boardId).toBe("4020000001470191001");
    expect(parsed.boards[1].boardId).toBe("4090000000118263086");
    // JSON.parse 直だと丸められることの確認(このバグを防いでいる)
    expect(String(JSON.parse(realWorldFixture).boards[0].boardId)).not.toBe(
      "4020000001470191001"
    );
  });

  it("小さい整数・小数・指数は数値のまま", () => {
    const parsed = parseJsonSafe(
      '{"a":20000,"b":1.5,"c":1e20,"d":-42,"e":0.000001}'
    ) as Record<string, number>;
    expect(parsed.a).toBe(20000);
    expect(parsed.b).toBe(1.5);
    expect(parsed.c).toBe(1e20);
    expect(parsed.d).toBe(-42);
    expect(parsed.e).toBe(0.000001);
  });

  it("負の 16 桁以上の整数も文字列化する", () => {
    const parsed = parseJsonSafe('{"a":-4020000001470191001}') as { a: string };
    expect(parsed.a).toBe("-4020000001470191001");
  });

  it("文字列リテラル内の数字列やエスケープは変更しない", () => {
    const parsed = parseJsonSafe(
      '{"note":"a, 1234567890123456789, b","quote":"say \\"1234567890123456789\\""}'
    ) as { note: string; quote: string };
    expect(parsed.note).toBe("a, 1234567890123456789, b");
    expect(parsed.quote).toBe('say "1234567890123456789"');
  });

  it("配列の中の大きな整数も文字列化する", () => {
    const parsed = parseJsonSafe("[4020000001470191001, 5]") as [string, number];
    expect(parsed[0]).toBe("4020000001470191001");
    expect(parsed[1]).toBe(5);
  });
});

describe("WorksApiClient", () => {
  it("Bearer トークン付きで GET し JSON を返す", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ boards: [] }));
    const { client } = makeClient(fetchFn);
    const result = await client.listBoards({ count: 10 });
    expect(result).toEqual({ boards: [] });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://www.worksapis.com/v1.0/boards?count=10");
    expect(init.headers.authorization).toBe("Bearer token1");
  });

  it("undefined のクエリパラメータは送らない", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({}));
    const { client } = makeClient(fetchFn);
    await client.listPosts("b1", { count: undefined, cursor: undefined });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://www.worksapis.com/v1.0/boards/b1/posts"
    );
  });

  it("boardId / postId を URL エンコードする", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({}));
    const { client } = makeClient(fetchFn);
    await client.getPost("b/1", "p 2");
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://www.worksapis.com/v1.0/boards/b%2F1/posts/p%202"
    );
  });

  it("401 のとき一度だけリフレッシュして再試行する", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(okJson({ ok: true }));
    const { client, auth } = makeClient(fetchFn);
    const result = await client.listBoards();
    expect(result).toEqual({ ok: true });
    expect(auth.forceRefresh).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[1][1].headers.authorization).toBe("Bearer token2");
  });

  it("リフレッシュ後も 401 ならエラーにする(無限ループしない)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    const { client, auth } = makeClient(fetchFn);
    await expect(client.listBoards()).rejects.toBeInstanceOf(WorksApiError);
    expect(auth.forceRefresh).toHaveBeenCalledTimes(1);
  });

  it("429 はバックオフ付きで再試行する", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(new Response("{}", { status: 429 }))
      .mockResolvedValueOnce(okJson({ ok: true }));
    const { client } = makeClient(fetchFn);
    expect(await client.listBoards()).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("429 が続いたら分かりやすいエラーを投げる", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 429 }));
    const { client } = makeClient(fetchFn);
    await expect(client.listBoards()).rejects.toThrow(/しばらく待って/);
  });

  it("307 リダイレクトに Authorization 付きで追随する", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "https://jp1.worksapis.com/v1.0/boards/b1/posts/p1" },
        })
      )
      .mockResolvedValueOnce(okJson({ postId: 1 }));
    const { client } = makeClient(fetchFn);
    expect(await client.getPost("b1", "p1")).toEqual({ postId: 1 });
    const [redirectUrl, init] = fetchFn.mock.calls[1];
    expect(redirectUrl).toBe("https://jp1.worksapis.com/v1.0/boards/b1/posts/p1");
    expect(init.headers.authorization).toBe("Bearer token1");
  });

  it("recent posts のエンドポイントを叩く", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ posts: [] }));
    const { client } = makeClient(fetchFn);
    await client.listRecentPosts({ count: 40 });
    expect(fetchFn.mock.calls[0][0]).toBe(
      "https://www.worksapis.com/v1.0/boards/recent/posts?count=40"
    );
  });

  it("404 は掲示板/投稿が見つからない旨のメッセージ", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "NOT_FOUND", description: "board not found" }), {
        status: 404,
      })
    );
    const { client } = makeClient(fetchFn);
    await expect(client.getPost("b1", "p1")).rejects.toThrow(/見つかりません/);
  });
});
