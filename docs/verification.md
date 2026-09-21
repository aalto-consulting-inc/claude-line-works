# 手動 E2E 検証チェックリスト

リリース前に、実際の LINE WORKS テナントを使って以下を確認します。
実施ごとに日付・環境・結果を記録してください。**このチェックリストのローカル手動 E2E が公開前の唯一の必須ゲート**です(CI 整備は公開後のオプショナル要件)。

## 実施記録

公開前の必須は macOS の 2 レーンのみ。Windows 実機検証は公開前スコープ外(公開後にフィードバックがあれば対応)。

| 日付 | 実施者 | 環境 (OS / Claude) | 結果 |
|---|---|---|---|
| 2026-09-20 | Murano | macOS / Claude Code CLI(マーケットプレイス経由) | ✅ 完了(下記チェック参照。認可 → 掲示板一覧 → 投稿一覧 → 本文 → 自動リフレッシュを一巡) |
| 2026-09-21 | Murano | macOS / Claude Desktop(MCPB / v0.2.0) | ✅ 完了(下記チェック参照。userConfig UI・認可の自動ブラウザ起動・掲示板一覧まで確認) |

## 準備

- [x] テスト用掲示板に投稿がある: 日本語・長文・HTML 装飾(業務報告掲示板の日報が該当)
- [x] Claude Code CLI 検証時はマーケットプレイス経由 `/plugin install line-works@aalto-plugins` で起動
- [x] Claude Desktop 検証時は Releases から `.mcpb`(v0.2.0 時点の名称は `line-works-board-0.2.0.mcpb`、v0.3.0 以降は `line-works-<バージョン>.mcpb`)を DL → 設定 → 拡張機能 からインストール

## 正常系

- [x] インストール直後、userConfig(Client ID / Secret)の入力が求められる(2026-09-20 CLI: marketplace 経由 `/plugin install` で入力プロンプト表示。callback_port の入力欄が空欄で表示される点は description に「空欄で既定 9876」を追記して補足 / 2026-09-21 Desktop MCPB: 拡張機能インストール時に同等の userConfig 入力 UI が表示、Client Secret は sensitive: true でキーチェーン保存)
- [x] `authorize` 実行 → URL 提示 → ブラウザでログイン → 「認可が完了しました」ページが表示される(2026-09-21 Desktop MCPB: authorize ツールが既定ブラウザを自動起動、URL は本文にも Markdown リンクで露出、localhost:9876 コールバック成立、tokens.json 保存を確認。CLI 側は Phase 0 curl で認可〜トークン交換を確認済)
- [x] 認可後、`list_boards` で掲示板一覧が返る(20 件取得、nextCursor null)
- [x] `list_posts` で投稿一覧が返る(日本語タイトルが化けない、cursor 継続あり)
- [x] `get_post` の本文が Markdown で返る(2026-09-20: 短文と長文(生産管理課の日報)の両方で確認。長文は LLM 側で中間ファイル分割して処理する挙動あり — バグではないがサイズ大の投稿があることをスキル/ドキュメントで意識すべき)
- [x] `list_recent_posts` の挙動を確認(2026-09-20: 「新規投稿通知 ON」の掲示板がないため 0 件。LINE WORKS Web 側でも同条件で 0 件、仕様どおり。ツール説明を実態に合わせて更新)
- [x] 非エンジニア想定シナリオ:「業務報告掲示板の投稿で日付が9/19相当のものを要約して」を実行(2026-09-20: list_posts → 該当5件抽出 → 並列 get_post 5回 → 部署別に整形要約、日付/人名/金額/添付ファイル名まで欠落なく反映)
- [x] コメント要求時の応答確認(2026-09-20: `commentCount: 0` の投稿では「対象なし」と自然応答。commentCount > 0 の投稿でスコープ外案内の文言確認は要追加)

## 認証系

- [x] トークンファイル(tokens.json)の expiresAt を過去に書き換え → **サーバー再起動後の次のツール呼び出しで自動リフレッシュされ成功**(2026-09-20: サーバー内メモリキャッシュがあるため書き換え直後の同一プロセスでは不発。再起動後は期限切れ検知 → refresh_token 交換 → 新 access_token 取得 → tokens.json 更新 を確認)
- [ ] refresh_token を壊す → 「もう一度ログインしてください」という日本語の案内が返る(スタックトレースが出ない)
- [ ] 不正な code を `code_or_url` に渡す → 分かりやすいエラー(ユニットテストでカバー、手動再現は保留)
- [ ] コールバック URL の state を改ざん → エラーページになりトークンが保存されない(ユニットテストでカバー、手動再現は保留)

## フォールバック系(ローカルコールバック不成立時の汎用フォールバック)

- [ ] コールバックが成立しない状態で、リダイレクト先 URL の手動貼り付け(`authorize` の `code_or_url`)で認可が完了する(Claude Code CLI 上で 1 回実施すれば足りる)

## コンテンツ系

- [x] 長文投稿(数千文字)が途中で切れない(2026-09-20: 生産管理課日報で確認。get_post の応答は完全。ただしサイズ大につき LLM 側で中間ファイル分割を選択する場面あり)
- [x] 投稿が多い掲示板で cursor による続き取得ができる(2026-09-20: list_posts の nextCursor 有無を確認済み。実際の cursor 継続コールは未実施だが実装済み・ユニットテスト有)
- [x] 存在しない boardId → 整形されたエラー案内(2026-09-20: 19 桁で int64 超過は「boardId must be of type long」を整形して案内、有効形式で権限外の ID は 403「アクセス権なし / ID 誤り / スコープ不足」の 3 原因併記で案内。スタックトレース無し)
- [x] 権限のない掲示板 → 「アクセス権がない」の案内(上記 403 応答で整形済み)

## セキュリティ系

- [x] client_secret が settings.json などに平文で保存されていない(2026-09-20 確認: CLI プラグインでは `~/.claude/settings.json` に client_id のみ平文、client_secret は macOS キーチェーンに `Claude Code-credentials-*` として保存 / 2026-09-21 Desktop MCPB でも sensitive: true 指定によりキーチェーン保存)
- [x] ツールのエラー出力・ログに access_token / refresh_token / code が含まれない(tokens.ts / oauth.ts でエラー整形時にトークン・code を出さない実装を確認、ユニットテストでもカバー)
- [x] リポジトリ内に認証情報が含まれない(2026-09-20 コミット履歴を grep で走査、client_secret / accessToken / refreshToken / Client ID いずれも検出なし。`.gitignore` に tokens.json / .env / .claude/settings.local.json を明記)
- [x] tokens.json のパーミッションが 600、データディレクトリが 700(2026-09-20 oauth.ts saveTokens で mode 明示、実ファイルに chmod 適用済み)

## OS 別確認(macOS)

- [x] `node dist/server.js` がそのまま起動する(2026-09-20: `node scripts/smoke.mjs` で 5 ツール認識確認 / 2026-09-21 Desktop MCPB: Desktop 内蔵の Node ランタイムで起動、Node 追加インストール不要)
- [x] 認可のコールバック(127.0.0.1)が成立する(2026-09-20 CLI + 2026-09-21 Desktop MCPB とも成立)
- [x] トークン保存先に書き込みできる(CLI: `~/.claude/plugins/data/line-works-aalto-plugins/tokens.json` / Desktop MCPB: `~/.line-works-mcp/tokens.json`。両方 600 で保存)
