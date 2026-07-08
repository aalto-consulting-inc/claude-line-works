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

  it("実際の掲示板投稿の HTML(div/span/br 構成)を読みやすい Markdown にする", () => {
    // 実測 (docs/api-notes.md 4.3) の body の構造を匿名化したもの
    const realWorldBody =
      '<div style="font-family: Meiryo, sans-serif; font-size: 14px;">' +
      "<div>従業員各位</div><div><br></div>" +
      "<div>お疲れ様です。</div>" +
      "サーバーの入れ替えに伴って、下記が変更になります。<div><br></div>" +
      "<div><span>〇ファイルサーバー</span></div>" +
      "<div><span>192.168.0.1→192.168.0.2</span></div>" +
      "<div><span><br></span></div>" +
      "<div>何か分からない事があれば連絡ください。</div><div><br></div></div>";
    const md = htmlToMarkdown(realWorldBody);
    expect(md).toContain("従業員各位");
    expect(md).toContain("〇ファイルサーバー");
    expect(md).toContain("192.168.0.1→192.168.0.2");
    expect(md).not.toContain("<div");
    expect(md).not.toContain("<span");
    // div ごとの行が別の行として残る(plainTextBody のようにスペース結合されない)
    expect(md.split("\n").map((l) => l.trim())).toContain("従業員各位");
    expect(md.split("\n").map((l) => l.trim())).toContain("お疲れ様です。");
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

  it("plainTextBody は本文の重複としてメタデータから除外する", () => {
    const out = formatPostMarkdown({
      title: "t",
      body: "<p>本文です</p>",
      plainTextBody: "本文です",
      postId: 1,
    });
    expect(out).toContain("本文です");
    expect(out).not.toContain("plainTextBody");
  });

  it("body が無ければ plainTextBody をフォールバックに使う", () => {
    const out = formatPostMarkdown({
      title: "t",
      plainTextBody: "プレーンな本文",
      postId: 1,
    });
    expect(out).toContain("プレーンな本文");
    expect(out).not.toContain("plainTextBody");
  });
});
