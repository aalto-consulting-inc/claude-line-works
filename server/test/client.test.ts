import { describe, expect, it, vi } from "vitest";
import { WorksApiClient, WorksApiError } from "../src/client.js";

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
