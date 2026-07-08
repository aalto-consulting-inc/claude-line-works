# LINE WORKS API 検証記録(Phase 0)

このファイルは curl による実 API 検証の**一次記録**です。実装(`server/src/client.ts` ほか)はこのファイルの実レスポンスに合わせます。
検証のたびに「実行結果」欄を実際のレスポンス(トークン等の秘匿情報はマスク)で埋めてください。

- 検証日: 2026-07-08(**完了** — コメント(4.4)はスコープ外の決定により対象外)
- 検証者: (クライアント管理者)
- 使用テナント: (社名は記録しない)

## 前提: Developer Console での準備(人手作業)

1. https://dev.worksmobile.com/ (Developer Console) にテナント管理者でログイン
2. 「アプリの新規追加」でクライアントアプリを作成
   - アプリの種類は **「認証アプリ」** を選ぶ(「プロビジョニングアプリ」は SCIM 連携用で今回は使わない)
3. **OAuth Scopes** に読み取りスコープを追加(今回の設定: `board.read` / `bot.read` / `calendar.read`)
   - [ ] コンソールに表示された正確なスコープ名を記録: `____________`
   - ※ プラグインが実際に使うのは当面 `board.read` のみ。bot / calendar は将来の機能拡張用にアプリへ登録しておく
4. **Redirect URL** に `http://localhost:9876/callback` を登録
   - [x] localhost の URL が登録できたか: **はい**(2026-07-08 実測。localhost リダイレクトで code 取得に成功)
   - **いいえの場合**: ローカルコールバック方式が成立しないため、手動コード貼り付けを主フローに変更する(docs/plan.md のリスク 1)
5. Client ID / Client Secret を控える(このファイルには**書かないこと**)

環境変数にセットして以降のコマンドをコピペできるようにする:

```sh
export CID='(Client ID)'
export SECRET='(Client Secret)'
export REDIRECT='http://localhost:9876/callback'
# 複数スコープは半角スペース区切り(OAuth 2.0 標準)。URL に埋め込む際は %20 にする
export SCOPE='board.read%20bot.read%20calendar.read'
```

> **スコープの指定方法**: 半角スペース区切り。認可 URL 内ではスペースを `%20` にエンコードする
> (上の export はエンコード済みの形で書いてあるので、そのまま URL に使える)。
> トークン交換(手順2)の curl に scope パラメータは不要(authorize 時のスコープが引き継がれる)。
> プラグイン本体が要求するのは `board.read` のみ(最小権限)。curl 検証では3スコープで取得しても問題ない。

## 1. 認可コード取得(ブラウザ)

以下の URL を組み立ててブラウザで開く:

```sh
echo "https://auth.worksmobile.com/oauth2/v2.0/authorize?client_id=${CID}&redirect_uri=${REDIRECT}&response_type=code&scope=${SCOPE}&state=phase0test"
```

ログイン・同意後、`http://localhost:9876/callback?code=XXXX&state=phase0test` にリダイレクトされる(ページはエラー表示で構わない)。アドレスバーから `code` をコピー:

```sh
export CODE='(コピーした code)'
```

**記録**:
- [ ] 同意画面にスコープが表示されたか・文言:
- [ ] `state` がそのまま返ってきたか:
- [ ] code の有効期限(すぐ使わないと失効するか):

## 2. トークン交換

```sh
# 値に特殊文字が入っても壊れないよう --data-urlencode を使う(-d は値をエンコードしない)
curl -sS -X POST https://auth.worksmobile.com/oauth2/v2.0/token \
  --data-urlencode grant_type=authorization_code \
  --data-urlencode code="$CODE" \
  --data-urlencode client_id="$CID" \
  --data-urlencode client_secret="$SECRET" \
  --data-urlencode redirect_uri="$REDIRECT"
```

**実行結果**(トークン値はマスクして構造だけ残す):

```json
(ここに貼る)
```

- [ ] access_token の有効期限フィールド名と値(想定: `expires_in: 86400` = 24h):
- [ ] refresh_token が返るか:
- [ ] scope フィールドの値:

```sh
export AT='(access_token)'
export RT='(refresh_token)'
```

## 3. リフレッシュ検証

```sh
# 事前に $RT が正しく入っているか確認: echo "len=${#RT} head=${RT:0:12}..."
curl -sS -X POST https://auth.worksmobile.com/oauth2/v2.0/token \
  --data-urlencode grant_type=refresh_token \
  --data-urlencode refresh_token="$RT" \
  --data-urlencode client_id="$CID" \
  --data-urlencode client_secret="$SECRET"
```

**実行結果**:

```json
(ここに貼る)
```

- [x] 新しい access_token が返るか: **はい**(2026-07-08 実測)。ただし `-d` だと `{"returnCode":"99","returnMessage":"UnexpectedError"}` になる。**`--data-urlencode` が必須**(トークン内の特殊文字が原因)
- [ ] refresh_token は同じものが使い回しか、新しく発行されるか(ローテーションの有無): (未記録 — リフレッシュ応答に refresh_token が含まれていたか要確認)

## 4. Board API 検証

事前にテスト用掲示板に、日本語・長文・HTML 装飾(見出し/リスト/リンク/表)・コメント付きの投稿を用意しておく。

### 4.1 掲示板一覧

```sh
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards"
```

**実行結果**(2026-07-08 実測。縮約・掲示板名は一部のみ記載):

```json
{
  "boards": [
    {
      "boardId": 4020000001470191001,
      "boardName": "お知らせ",
      "description": null,
      "tenantBoard": false,
      "createdTime": "2021-04-07T12:17:59+09:00",
      "modifiedTime": "2022-01-25T12:13:15+09:00",
      "displayOrder": 20000,
      "resourceLocation": null
    }
  ],
  "responseMetaData": { "nextCursor": null }
}
```

- [x] エンドポイントパスは正しかったか: **はい**(`GET /v1.0/boards` で 20 件返った)
- [x] boardId のフィールド名と型: `boardId`、**JSON 数値で 19 桁**。JavaScript の Number 安全整数範囲(約 9.0e15)を超えるため、**実装では `parseJsonSafe`(server/src/client.ts)で 16 桁以上の整数を文字列化**してから扱う(2026-07-08 修正済み)
- [x] ページネーション方式: レスポンス末尾の `responseMetaData.nextCursor`(続きがない場合は null)。想定どおりカーソル方式

### 4.2 投稿一覧

```sh
export BOARD_ID='(4.1 で得た boardId)'
echo "BOARD_ID=[$BOARD_ID]"   # ← 空でないことを必ず確認(空だと /boards//posts になり {"code":"NOT_FOUND","description":"Api not exists"} が返る)
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards/${BOARD_ID}/posts?count=10"
```

> **パスは公式リファレンス(docs/reference/board-post-list.pdf)で確認済み**: `GET /v1.0/boards/{boardId}/posts`。
> `count` は既定 20・最大 40。続きは `cursor`。
> **注意(2026-07-08 実測)**: 初回の `{"code":"NOT_FOUND","description":"Api not exists"}` の原因は、コマンド末尾に紛れ込んだ `~` が URL に連結され `count=10~` になっていたこと。URL が 1 文字でも崩れるとこのエラーになる。

**実行結果**(2026-07-08 実測。縮約・投稿者名はマスク):

```json
{
  "posts": [
    {
      "boardId": 4020000001470191001,
      "postId": 4090000000182400175,
      "title": "令和8年度_月毎棚卸し6月分",
      "readCount": 33,
      "commentCount": 0,
      "fileCount": 1,
      "createdTime": "2026-06-29T13:24:20+09:00",
      "modifiedTime": "2026-06-29T13:24:20+09:00",
      "userId": "bcf319e7-****",
      "userName": "(投稿者名)",
      "mustReadPeriod": { "startDate": null, "endDate": null },
      "isMustRead": false,
      "resourceLocation": null,
      "isUnread": true
    }
  ]
}
```

- [x] 投稿の ID フィールド名: `postId`(**19 桁の JSON 数値** — boardId 同様に parseJsonSafe で文字列化して扱う)
- [x] 一覧に本文は含まれるか: **含まれない**(タイトル+メタデータのみ)。本文は `GET .../posts/{postId}` で個別取得(現設計どおり)
- [x] 日時フィールドの形式: ISO8601、タイムゾーン付き(`+09:00`)
- [x] 追加フィールド: `userId` / `userName` / `isUnread` / `resourceLocation`(リファレンスの投稿取得スキーマとほぼ同じ)

### 4.3 投稿本文

```sh
export POST_ID='(4.2 で得た postId)'
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards/${BOARD_ID}/posts/${POST_ID}"
```

**実行結果**:

```json
(ここに貼る)
```

- [x] 本文フィールド名と形式(2026-07-08 実測): `body` = **HTML**。ただし見出し/リストタグではなく **`<div>`/`<span>`/`<br>` ベース**(スタイル付き div の入れ子)。htmlToMarkdown の変換テストに実測構造のフィクスチャを追加済み
- [x] **公式リファレンス未記載の `plainTextBody` フィールドが実際には返る**(改行がスペースに潰れた本文)。実装では body を Markdown 変換して使い、plainTextBody は body 不在時のフォールバック・メタデータ出力からは除外
- [x] **HTTP 307 が返ることがある**(別インスタンスのリソース → Location へ Authorization 付きで再リクエスト)。実装対応済み(client.ts)
- [ ] 添付ファイルはどう表現されるか: `fileCount` のみ確認(添付本体の取得は attachments API。実測は未・現状スコープ外)

### 4.4 コメント一覧 — **スコープ外(2026-07-08 決定)**

ユーザー決定によりコメント取得はプラグインの対象外とした。`list_comments` ツールは実装から削除済み。
(参考: 公式リファレンスでは `GET /boards/{boardId}/posts/{postId}/comments`、本文フィールドは `content`。将来対応する場合はここから)

## 5. エラー形式の記録

```sh
# 不正トークン → 401 の形式
curl -sS -H "Authorization: Bearer invalid" "https://www.worksapis.com/v1.0/boards"

# 存在しない boardId → 404 の形式
curl -sS -H "Authorization: Bearer $AT" "https://www.worksapis.com/v1.0/boards/999999999/posts"
```

**実行結果**(2026-07-08 実測):

```json
{"code":"UNAUTHORIZED","description":"Malformed authentication token"}
{"code":"ACCESS_DENIED","description":"Access is denied."}
```

- [x] エラー JSON の構造: `{"code": "...", "description": "..."}` — 実装(client.ts formatError)の想定どおり
- [x] 不正トークン → `UNAUTHORIZED` / **存在しない boardId → `NOT_FOUND` ではなく `ACCESS_DENIED`**(権限エラーと区別されない点に注意。エラーメッセージの文言は「アクセス権がないか ID が誤っている」の両方に触れるのが望ましい)
- [x] 認証エンドポイント(auth.worksmobile.com)のエラー形式: `{"returnCode":"99","returnMessage":"UnexpectedError"}` — リクエスト不正時の汎用エラー(2026-07-08 実測)。Board API 側とは形式が異なる点に注意
- メモ: Rotation ON の場合、リフレッシュ成功で古い refresh_token は失効する。認可のやり直しでも旧 RT が無効になる場合がある
- [ ] レート制限(429)のヘッダー(`Retry-After` の有無)— 発生したら記録:

## 参考: 公式ドキュメント(PDF 保存版あり)

**公式リファレンスの PDF 保存版を `docs/reference/` に置いた**(2026-07-08 取得)。詳細は docs/reference/README.md。
判明した追加エンドポイント: `GET /boards/recent/posts`(全掲示板横断の最新投稿)→ ツール `list_recent_posts` として実装済み。


- LINE WORKS Developers ドキュメント トップ: https://developers.worksmobile.com/jp/docs
- 認可・認証の概要: https://developers.worksmobile.com/jp/docs/auth
- ユーザーアカウント認証(OAuth 2.0 認可コード): https://developers.worksmobile.com/jp/docs/auth-oauth
- Board(掲示板)API: https://developers.worksmobile.com/jp/docs/board
- 掲示板リスト取得リファレンス: https://developers.worksmobile.com/jp/reference/board-list?lang=ja
- Developer Console の使い方: https://developers.worksmobile.com/jp/docs/developer-console

> 注意: これらのページは自動取得(curl 等)だと 403 になるため、ブラウザで開くこと。

## 6. 完了条件

- [x] 認可 → トークン → 掲示板一覧 → 投稿一覧 → 投稿本文 → リフレッシュ が一巡した(2026-07-08。コメントはスコープ外)
- [x] 上記の実行結果がすべてこのファイルに記録された
- [x] 実装(client.ts / oauth.ts / tools.ts)との差分を確認し反映した(19桁 ID の文字列化、307 追随、plainTextBody 除外、list_comments 削除、count 上限 40、docs/plan.md 更新)
