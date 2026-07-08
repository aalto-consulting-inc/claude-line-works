import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../src/html.js";
import { formatPostMarkdown } from "../src/tools.js";

describe("htmlToMarkdown", () => {
  it("見出しとリストを変換する", () => {
    const md = htmlToMarkdown(
      "<h2>お知らせ</h2><ul><li>項目1</li><li>項目2</li></ul>"
    );
    expect(md).toContain("## お知らせ");
    expect(md).toContain("- 項目1");
    expect(md).toContain("- 項目2");
  });

  it("リンクを変換する", () => {
    const md = htmlToMarkdown('<p><a href="https://example.com">社内規程</a></p>');
    expect(md).toBe("[社内規程](https://example.com)");
  });

  it("表を GFM テーブルに変換する", () => {
    const md = htmlToMarkdown(
      "<table><thead><tr><th>日付</th><th>担当</th></tr></thead>" +
        "<tbody><tr><td>7/10</td><td>佐藤</td></tr></tbody></table>"
    );
    expect(md).toContain("| 日付 | 担当 |");
    expect(md).toContain("| 7/10 | 佐藤 |");
  });

  it("日本語の段落を保持する", () => {
    const md = htmlToMarkdown("<p>第一段落です。</p><p>第二段落です。</p>");
    expect(md).toBe("第一段落です。\n\n第二段落です。");
  });

  it("HTML でないプレーンテキストはそのまま返す", () => {
    expect(htmlToMarkdown("ただのテキスト 1 < 2")).toBe("ただのテキスト 1 < 2");
  });

  it("空文字は空文字のまま", () => {
    expect(htmlToMarkdown("")).toBe("");
  });
});

describe("formatPostMarkdown", () => {
  it("title と HTML body を Markdown にまとめる", () => {
    const out = formatPostMarkdown({
      title: "全社会議のお知らせ",
      body: "<p>7月15日に開催します。</p>",
      postId: 123,
    });
    expect(out).toContain("# 全社会議のお知らせ");
    expect(out).toContain("7月15日に開催します。");
    expect(out).toContain('"postId": 123');
    expect(out).not.toContain("<p>");
  });

  it("本文フィールドが無い場合もメタデータを返す", () => {
    const out = formatPostMarkdown({ title: "t", postId: 1 });
    expect(out).toContain("# t");
    expect(out).toContain('"postId": 1');
  });
});
