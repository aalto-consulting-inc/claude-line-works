# LINE WORKS API 公式リファレンス(PDF 保存版)

developers.worksmobile.com は自動取得(curl 等)だと 403 になるため、
ブラウザで表示したページを PDF 保存したものをここに置いている(取得日: 2026-07-08)。
実装時の一次資料。最新情報は必ずブラウザで原本を確認すること。

| ファイル | 内容 | 原本 URL |
|---|---|---|
| line-works-api-overview.pdf | LINE WORKS API 全体概要 | https://developers.worksmobile.com/jp/docs/api |
| board-api-overview.pdf | Board API 概要(全エンドポイント一覧) | https://developers.worksmobile.com/jp/docs/board |
| board-list.pdf | 掲示板リストの取得 | https://developers.worksmobile.com/jp/docs/board-list |
| board-get.pdf | 掲示板の取得 | https://developers.worksmobile.com/jp/docs/board-get |
| board-post-list.pdf | 投稿リストの取得 | https://developers.worksmobile.com/jp/docs/board-post-list |
| board-post-get.pdf | 投稿の取得 | https://developers.worksmobile.com/jp/docs/board-post-get |

## 実装に効く要点(PDF からの抜粋)

- 読み取り系エンドポイント(すべて `https://www.worksapis.com/v1.0` 配下、Scope: `board` または `board.read`):
  - `GET /boards` — 掲示板リスト
  - `GET /boards/{boardId}` — 掲示板
  - `GET /boards/{boardId}/posts` — 投稿リスト
  - `GET /boards/{boardId}/posts/{postId}` — 投稿(レスポンスの `body` は **HTML**)
  - `GET /boards/{boardId}/posts/{postId}/comments` — コメントリスト(本文フィールドは `content`)
  - `GET /boards/recent/posts` — **全掲示板横断の最新投稿リスト**(/boards/my/posts, /boards/must/posts もある)
- ページネーション: `count`(既定 20、**最大 40**)+ `cursor`
- `boardId` / `postId` は int64 — JSON 数値のまま扱うと JavaScript で精度が落ちる(実装では文字列化)
- 投稿の取得は **HTTP 307**(別インスタンスのリソース)を返すことがあり、Location へ Authorization 付きで再リクエストが必要
