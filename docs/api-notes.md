# LINE WORKS API 検証記録(Phase 0)

このファイルは curl による実 API 検証の**一次記録**です。実装(`server/src/client.ts` ほか)はこのファイルの実レスポンスに合わせます。
検証のたびに「実行結果」欄を実際のレスポンス(トークン等の秘匿情報はマスク)で埋めてください。

- 検証日: (未実施)
- 検証者:
- 使用テナント:

## 前提: Developer Console での準備(人手作業)

1. https://dev.worksmobile.com/ (Developer Console) にテナント管理者でログイン
2. 「アプリの新規追加」でクライアントアプリを作成
   - アプリの種類は **「認証アプリ」** を選ぶ(「プロビジョニングアプリ」は SCIM 連携用で今回は使わない)
3. **OAuth Scopes** に読み取りスコープを追加(今回の設定: `board.read` / `bot.read` / `calendar.read`)
   - [ ] コンソールに表示された正確なスコープ名を記録: `____________`
   - ※ プラグインが実際に使うのは当面 `board.read` のみ。bot / calendar は将来の機能拡張用にアプリへ登録しておく
4. **Redirect URL** に `http://localhost:9876/callback` を登録
   - [ ] localhost の URL が登録できたか: はい / いいえ
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
curl -sS -X POST https://auth.worksmobile.com/oauth2/v2.0/token \
  -d grant_type=authorization_code \
  -d code="$CODE" \
  -d client_id="$CID" \
  -d client_secret="$SECRET" \
  -d redirect_uri="$REDIRECT"
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
curl -sS -X POST https://auth.worksmobile.com/oauth2/v2.0/token \
  -d grant_type=refresh_token \
  -d refresh_token="$RT" \
  -d client_id="$CID" \
  -d client_secret="$SECRET"
```

**実行結果**:

```json
(ここに貼る)
```

- [ ] 新しい access_token が返るか:
- [ ] refresh_token は同じものが使い回しか、新しく発行されるか(ローテーションの有無):

## 4. Board API 検証

事前にテスト用掲示板に、日本語・長文・HTML 装飾(見出し/リスト/リンク/表)・コメント付きの投稿を用意しておく。

### 4.1 掲示板一覧

```sh
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards"
```

**実行結果**:

```json
(ここに貼る)
```

- [ ] エンドポイントパスは正しかったか(違う場合は正しいパス):
- [ ] boardId のフィールド名と型:
- [ ] ページネーション方式(`cursor`? `count`? レスポンスの `responseMetaData.nextCursor`?):

### 4.2 投稿一覧

```sh
export BOARD_ID='(4.1 で得た boardId)'
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards/${BOARD_ID}/posts?count=10"
```

**実行結果**:

```json
(ここに貼る)
```

- [ ] 投稿の ID フィールド名:
- [ ] 一覧に本文は含まれるか(要約のみか):
- [ ] 日時フィールドの形式(ISO8601? タイムゾーン?):

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

- [ ] 本文フィールド名と形式(HTML か? どんなタグが来るか):
- [ ] 添付ファイルはどう表現されるか:

### 4.4 コメント一覧

```sh
curl -sS -H "Authorization: Bearer $AT" \
  "https://www.worksapis.com/v1.0/boards/${BOARD_ID}/posts/${POST_ID}/comments"
```

**実行結果**:

```json
(ここに貼る)
```

- [ ] エンドポイントパスは正しかったか:
- [ ] コメント本文のフィールド名・形式:

## 5. エラー形式の記録

```sh
# 不正トークン → 401 の形式
curl -sS -H "Authorization: Bearer invalid" "https://www.worksapis.com/v1.0/boards"

# 存在しない boardId → 404 の形式
curl -sS -H "Authorization: Bearer $AT" "https://www.worksapis.com/v1.0/boards/999999999/posts"
```

**実行結果**:

```json
(ここに貼る)
```

- [ ] エラー JSON の構造(`code` / `description` などのフィールド名):
- [ ] レート制限(429)のヘッダー(`Retry-After` の有無)— 発生したら記録:

## 6. 完了条件

- [ ] 認可 → トークン → 掲示板一覧 → 投稿本文 → コメント → リフレッシュ が一巡した
- [ ] 上記の実行結果がすべてこのファイルに記録された
- [ ] 実装(client.ts / oauth.ts)との差分を確認し、必要なら docs/plan.md も更新した
