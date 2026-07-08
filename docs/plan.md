# LINE WORKS 掲示板連携 Claude プラグイン — 開発・検証・公開計画

## Context

- **目的**: LINE WORKS を利用中のクライアント企業(利用者は非エンジニア)が、Claude Cowork から掲示板(Board)の情報を取得・活用して業務を効率化できる Claude プラグインを作る。
- **リポジトリ**: `aalto-consulting-inc/claude-line-works`(現在は空)。このリポジトリ自体を公開プラグインマーケットプレイスにする。
- **決定事項**(ユーザー確認済み):
  - 機能範囲は**読み取り専用**(掲示板一覧・投稿一覧・投稿本文の取得)。**コメント取得はスコープ外**(2026-07-08 決定)
  - 認証は**ユーザー OAuth(認可コードフロー)のみ**。Service Account は対応しない。本人の閲覧権限どおりに掲示板が見える
  - OAuth の実現方式は**ローカルコールバック**(MCP サーバーが一時的に localhost で code を受け取る)。Cowork で不成立の場合は手動コード貼り付けにフォールバック
  - **開発の最初のステップは curl による API 動作検証**(コードを書く前に OAuth フローと Board API を確定させる)
  - 配布は**このリポジトリの公開マーケットプレイス化**
- **設計上の制約**:
  - Cowork では hooks・サブエージェントが動作しないため、**MCP サーバー + スキルのみ**で構成する
  - 非エンジニアが使うため、セットアップは「マーケットプレイス追加 → インストール → Client ID/Secret 入力 → ブラウザでログイン認可」で完結させる(利用者にビルド作業を要求しない)
  - **利用者環境は macOS / Windows の両対応**。OS 依存の実装(シェルスクリプト、パス区切り、ブラウザ起動コマンド)を避け、Node 標準 API のみで完結させる

## Phase 0: curl による API 動作検証(最初のステップ・コードを書く前)

LINE WORKS の公式ドキュメント(developers.worksmobile.com)は機械アクセスが 403 のため、実 API への curl 疎通で仕様を確定させる。結果はすべて `docs/api-notes.md` に記録し、以降の実装の一次情報とする。

1. **[人手作業]** LINE WORKS Developer Console でクライアントアプリを登録:
   - OAuth スコープ: `board.read`(正確なスコープ名はコンソールの選択肢で確認)
   - Redirect URL: `http://localhost:9876/callback`(**localhost が登録可能かをここで確認** — 不可なら手動貼り付け方式へ設計変更)
   - Client ID / Client Secret を控える
2. **認可コード取得**: ブラウザで以下を開き、ログイン・同意後のリダイレクト URL から `code` をコピー
   ```
   https://auth.worksmobile.com/oauth2/v2.0/authorize?client_id={CID}&redirect_uri=http://localhost:9876/callback&response_type=code&scope=board.read&state=x
   ```
3. **トークン交換**(curl):
   ```
   curl -X POST https://auth.worksmobile.com/oauth2/v2.0/token \
     -d grant_type=authorization_code -d code={CODE} \
     -d client_id={CID} -d client_secret={SECRET} \
     -d redirect_uri=http://localhost:9876/callback
   ```
   → access_token(有効 24h)/ refresh_token(有効 90 日)の形式・有効期限フィールドを記録
4. **リフレッシュ検証**(curl): `grant_type=refresh_token` で新トークンが取れることを確認
5. **Board API 検証**(curl, `Authorization: Bearer`):
   - 掲示板一覧: `GET https://www.worksapis.com/v1.0/boards`
   - 投稿一覧: `GET https://www.worksapis.com/v1.0/boards/{boardId}/posts`
   - 投稿本文: `GET .../posts/{postId}`
   - コメント: `GET .../posts/{postId}/comments`
   - ※ パスが違えば実レスポンスのエラーと開発者ドキュメント(ブラウザ確認)で正しいパスを特定
   - 各レスポンスの JSON 構造・ページネーション方式(cursor/offset)・日本語/HTML 本文の形・エラー形式(401/403/404/429)を記録
6. テスト用掲示板に投稿(日本語・長文・HTML 装飾・コメント付き)を人手で用意しておく

**このフェーズの完了条件**: curl だけで「認可 → トークン → 掲示板一覧 → 投稿本文 → コメント → リフレッシュ」が一巡し、`docs/api-notes.md` に全レスポンス例が残っていること。

## アーキテクチャ

### リポジトリ構成

```
claude-line-works/
├── .claude-plugin/
│   ├── plugin.json          # name: line-works, userConfig: client_id / client_secret(sensitive)
│   └── marketplace.json     # このリポジトリ自体をマーケットプレイスにする
├── .mcp.json                # stdio: node ${CLAUDE_PLUGIN_ROOT}/dist/server.js
├── server/                  # TypeScript 製 MCP サーバー
│   ├── src/
│   │   ├── index.ts         # MCP サーバーエントリ(@modelcontextprotocol/sdk, stdio)
│   │   ├── oauth.ts         # 認可 URL 生成、localhost コールバック受け口、トークン交換・保存・自動リフレッシュ
│   │   ├── client.ts        # worksapis.com API クライアント(fetch、ページネーション、429 リトライ、エラー整形)
│   │   ├── html.ts          # 投稿本文の HTML → Markdown 変換(turndown 使用。見出し・リスト・リンク・表を保持)
│   │   └── tools.ts         # MCP ツール定義
│   ├── test/                # vitest ユニットテスト
│   ├── package.json
│   └── tsconfig.json
├── dist/server.js           # esbuild 単一バンドルをコミット(利用者ビルド不要、Node 18+ のみ前提)
├── skills/
│   └── board-digest/SKILL.md  # 掲示板の要約・情報探索の使い方を教えるスキル
├── docs/
│   ├── api-notes.md         # Phase 0 の curl 検証記録(実装の一次情報)
│   ├── setup-admin.md       # 管理者向け: Developer Console 設定手順(日本語)
│   ├── setup-user.md        # 非エンジニア向け: インストール〜ブラウザ認可の手順(日本語)
│   └── verification.md      # 手動 E2E 検証チェックリスト
├── .github/workflows/ci.yml # ユニットテスト + 型チェック + plugin validate + dist 鮮度チェック
└── README.md
```

### OAuth フロー(server/src/oauth.ts)— このプラグインの核心

1. ツール呼び出し時に有効なトークンがなければ、エラーではなく「認可が必要」レスポンスを返し、`authorize` ツールを案内
2. `authorize` ツール: localhost の固定ポート(userConfig で変更可、既定 9876)で一時 HTTP サーバーを起動し、認可 URL を返す → **Claude が利用者に URL を提示し、利用者がクリック**(サンドボックスからのブラウザ自動起動に依存しない設計)
3. 利用者がブラウザでログイン・同意 → localhost コールバックで code 受領 → トークン交換 → 一時サーバー停止
4. トークンは `${CLAUDE_PLUGIN_DATA}` 配下に保存(access 24h / refresh 90 日)。失効前に自動リフレッシュ。リフレッシュ失効(90 日)時は再認可を案内
5. **フォールバック**: `authorize` ツールに `code` 引数を持たせ、コールバックが成立しない環境(Cowork サンドボックス等)ではリダイレクト先 URL から code を手動コピーして Claude に貼り付ければ同じ処理が走る。state/PKCE 検証を実装
6. CSRF 対策として state、可能なら PKCE(LINE WORKS が対応するか Phase 0 で確認)

### MCP ツール(読み取り専用)

| ツール | 内容 |
|---|---|
| `authorize` | 認可 URL の発行/code の受領(上記フロー) |
| `list_boards` | アクセス可能な掲示板の一覧 |
| `list_recent_posts` | 全掲示板を横断した最新投稿一覧(GET /boards/recent/posts) |
| `list_posts` | 指定掲示板の投稿一覧(cursor ページネーション、count 最大 40) |
| `get_post` | 投稿本文の取得(**HTML → Markdown 変換して出力**) |

※ コメント取得はスコープ外(2026-07-08 決定)。

### 配布(.claude-plugin/marketplace.json)

- リポジトリ直下をマーケットプレイス化: plugins に `{"name": "line-works", "source": "./"}`
- 導入手順: `/plugin marketplace add aalto-consulting-inc/claude-line-works` → `/plugin install line-works@...`(Cowork は UI から同等操作)
- リポジトリは public 化が必要。認証情報・トークンは一切コミットしない
- `plugin.json` の `version` をセマンティックバージョン運用(バンプ時のみ利用者に更新配布)

## 開発フェーズ(Phase 0 の後)

### Phase 1: MCP サーバー実装
- TypeScript + `@modelcontextprotocol/sdk` で oauth / client / tools を実装(api-notes.md の実レスポンスに合わせる)
- esbuild で `dist/server.js` に単一バンドル
- ユニットテスト(vitest): 認可 URL 生成と state 検証、トークン保存・期限判定・リフレッシュ(fetch モック)、API クライアントのページネーションと 429 リトライ、HTML→Markdown 変換(見出し・リスト・リンク・表・日本語)
- **クロスプラットフォーム方針(macOS / Windows 両対応)**:
  - MCP サーバー起動は `.mcp.json` の `node dist/server.js` のみ(シェルスクリプト・bash ラッパーを使わない)
  - パスは `path.join` と `${CLAUDE_PLUGIN_DATA}` 経由のみ。ホームディレクトリ直書きやパーミッション chmod 依存をしない(Windows では chmod が効かないため、トークンはユーザープロファイル配下の CLAUDE_PLUGIN_DATA 保存で足りると割り切る)
  - ブラウザ自動起動はしない(`open` / `start` の OS 分岐を避け、URL 提示 → 利用者クリックに統一 — OAuth フロー設計と整合)
  - localhost コールバックは `127.0.0.1` バインド(Windows ファイアウォールのプロンプト回避のためループバック限定)
  - npm scripts は cross-platform(rimraf 等、`rm -rf` 直書き禁止)

### Phase 2: プラグイン化
- `plugin.json`(userConfig: client_id, client_secret[sensitive], callback_port)、`.mcp.json`、`skills/board-digest/SKILL.md`、`marketplace.json`
- `claude plugin validate . --strict` をローカルと CI で実行

### Phase 3: 検証(実 API E2E)
- CI をマトリクス化(ubuntu / macos / windows-latest)してユニットテストとバンドル起動確認(`node dist/server.js` がツール一覧を返すスモーク)を全 OS で実行
- `claude --plugin-dir .` でローカル起動し手動 E2E(**macOS と Windows の実機それぞれで実施**):
  - 正常系: インストール → userConfig 入力 → `authorize`(ブラウザ認可)→ 掲示板一覧 → 投稿 → 本文 → コメント
  - 認証系: トークン失効後の自動リフレッシュ、リフレッシュ失効時の再認可案内、不正な code、state 不一致
  - フォールバック系: コールバック不成立を想定した code 手動貼り付け
  - コンテンツ系: 日本語・長文・HTML 本文(get_post の Markdown 出力が崩れないこと)・投稿多数のページネーション
- **Cowork 実機検証**: マーケットプレイス追加 → インストール → ローカルコールバックが成立するか確認(不成立なら手動貼り付けフローで一巡)→ 非エンジニア想定シナリオ(「総務の掲示板の今週の投稿を要約して」等)
- 結果を `docs/verification.md` に記録

### Phase 4: ドキュメント整備 + 公開
- `docs/setup-admin.md` / `docs/setup-user.md`(スクリーンショット前提の日本語手順)/ README
- リポジトリ public 化 → `v0.1.0` タグ → クライアント 1 社パイロット → フィードバック反映 → `v1.0.0`

## 検証計画まとめ

- **自動(CI・毎 PR)**: vitest ユニット + サーバー起動スモークを ubuntu / macos / windows の3 OS マトリクスで実行、TypeScript 型チェック、`claude plugin validate --strict`、dist 鮮度チェック、secret スキャン
- **手動(リリース前)**: `docs/verification.md` の E2E チェックリストを Claude Code CLI(macOS・Windows 両実機)と Cowork の両方で実施
- **セキュリティ確認**: client_secret が sensitive として平文保存されないこと、トークンファイルのパーミッション、ログにトークン・code を出さないこと、state/PKCE によるコールバック検証

## リスク・未確定事項

1. **localhost リダイレクト URI の可否**: Developer Console が `http://localhost` を許可しない場合、ローカルコールバック方式が成立しない → Phase 0 の最初で確認。不可なら手動コード貼り付けを主フローに昇格
2. **Cowork サンドボックスでのコールバック**: 利用者のブラウザから Cowork 実行環境の localhost に届かない可能性が高い → 手動貼り付けフォールバックを最初から実装しておく(設計済み)
3. **Board API の正確なパス/スコープ名**: Phase 0 の curl 検証で確定。実装では `client.ts` に隔離し修正コストを局所化
4. **90 日ごとの再認可**: リフレッシュトークン失効時に非エンジニアが迷わないよう、再認可の案内メッセージとドキュメントを丁寧に作る

## 設計書と進捗管理の運用

- この設計書をリポジトリに **`docs/plan.md`** としてコミットし、プロジェクトの正本にする
- 末尾に**進捗チェックリスト**(下記フェーズごとのチェックボックス)を設け、作業が進むたびに同じコミット/PR 内でチェックを更新する。セッションをまたいでも `docs/plan.md` を見れば現在地が分かる状態を維持する
- Phase 0 の curl 検証結果(`docs/api-notes.md`)で設計と実 API に差分が出た場合は、`docs/plan.md` 側も追記修正して常に実態と一致させる

### 進捗チェックリスト(docs/plan.md 末尾に含める)

- [x] Phase 0: Developer Console アプリ登録(人手)/ localhost リダイレクト可否確認(2026-07-08: 登録可、認可〜リフレッシュ成功)
- [x] Phase 0: curl で 認可→トークン→掲示板一覧→投稿一覧→本文→リフレッシュ→エラー形式 を一巡、api-notes.md 記録(2026-07-08 完了。コメントはスコープ外)
- [x] Phase 1: MCP サーバー実装(oauth / client / html / tools)+ ユニットテスト green(2026-07-08)
- [x] Phase 1: esbuild バンドル(dist/server.js)(2026-07-08)
- [x] Phase 2: plugin.json / .mcp.json / marketplace.json / スキル作成、plugin validate --strict 通過(2026-07-08)
- [ ] Phase 2: CI(3 OS マトリクス)green(※ 2026-07-08 ユーザー指示により本セッションではスキップ。次セッション以降)
- [ ] Phase 3: CLI 手動 E2E(macOS)完了・verification.md 記録
- [ ] Phase 3: CLI 手動 E2E(Windows)完了
- [ ] Phase 3: Cowork 実機検証(コールバック可否確認・フォールバック検証)完了
- [x] Phase 4: setup-admin / setup-user / README 完成(2026-07-08)
- [ ] Phase 4: リポジトリ public 化・v0.1.0 タグ
- [ ] Phase 4: パイロット導入 → フィードバック反映 → v1.0.0

## このセッションで着手する順

1. **この設計書を `docs/plan.md`(進捗チェックリスト付き)としてコミット** — 最初のコミットにする
2. Phase 0 の curl 検証キット: `docs/api-notes.md` テンプレと認可 URL 組み立て・トークン交換の curl 手順書 — 実際の curl 実行は Client ID/Secret 発行後(ユーザー側作業待ち)
3. `server/` scaffold + oauth.ts + client.ts + html.ts + tools.ts + テスト(api-notes 確定までは既知仕様で実装し、確定後に突き合わせ)
4. `plugin.json` / `.mcp.json` / `marketplace.json` / スキル
5. CI ワークフロー、docs、README
6. 各ステップ完了ごとに `docs/plan.md` のチェックリストを更新してコミット。ブランチ `claude/line-works-plugin-plan-a87xgu` へプッシュ → draft PR
