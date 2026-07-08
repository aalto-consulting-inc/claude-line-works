import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});
turndown.use(gfm);

/**
 * 掲示板投稿の HTML 本文を Markdown に変換する。
 * 見出し・リスト・リンク・表(GFM)を保持する。HTML でないプレーンテキストはそのまま返す。
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  if (!/<[a-z][\s\S]*>/i.test(html)) return html.trim();
  const markdown = turndown.turndown(html);
  return markdown
    // turndown は "-   項目" のようにマーカー後を4桁に揃えるため 1 スペースに正規化
    .replace(/^(\s*)-\s+/gm, "$1- ")
    // 3行以上の連続空行を1行に詰める
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
