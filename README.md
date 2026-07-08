# LINE WORKS 掲示板プラグイン for Claude

LINE WORKS の掲示板(Board)を Claude / Claude Cowork から読み取り、要約・検索・活用できるようにする**読み取り専用**プラグインです。

> 「総務の掲示板の今週の投稿を要約して」「経費精算のお知らせを探して」— そんな依頼が Claude にそのまま通ります。

## 特長

- **読み取り専用** — 投稿・編集・削除は一切できないため、誤操作の心配がありません
- **本人の権限どおり** — 各利用者が自分の LINE WORKS アカウントでログインし、本人が閲覧できる掲示板だけが見えます(ユーザー OAuth)
- **非エンジニアでも導入可能** — ビルド不要。インストールして ID を貼り付け、ブラウザでログインするだけ
- **macOS / Windows 対応** — Node.js 18 以降のみが前提です

## インストール

```
/plugin marketplace add aalto-consulting-inc/claude-line-works
/plugin install line-works@aalto-plugins
```

- 管理者の方(最初の一度だけ必要な設定): [docs/setup-admin.md](docs/setup-admin.md)
- 利用者の方: [docs/setup-user.md](docs/setup-user.md)

## 提供ツール

| ツール | 説明 |
|---|---|
| `authorize` | LINE WORKS へのログイン認可 |
| `list_boards` | 掲示板の一覧 |
| `list_recent_posts` | 全掲示板を横断した最新投稿一覧 |
| `list_posts` | 掲示板の投稿一覧 |
| `get_post` | 投稿本文(Markdown 変換) |
| `list_comments` | 投稿のコメント一覧 |

`board-digest` スキルが同梱されており、掲示板の要約・情報探索の依頼を適切なツール呼び出しに展開します。

## 開発

```sh
cd server
npm ci
npm run typecheck   # 型チェック
npm test            # ユニットテスト
npm run build       # ../dist/server.js にバンドル(コミット対象)
node ../scripts/smoke.mjs   # バンドルのスモークテスト
```

- 設計書・開発計画・進捗: [docs/plan.md](docs/plan.md)
- 実 API の検証記録(Phase 0): [docs/api-notes.md](docs/api-notes.md)
- リリース前の手動検証: [docs/verification.md](docs/verification.md)
- ローカルでプラグインとして試す: `claude --plugin-dir .`

## 参考リンク

- [LINE WORKS Developers ドキュメント](https://developers.worksmobile.com/jp/docs)
- [Board(掲示板)API](https://developers.worksmobile.com/jp/docs/board)
- [ユーザーアカウント認証(OAuth 2.0)](https://developers.worksmobile.com/jp/docs/auth-oauth)
- [Claude Code プラグインドキュメント](https://code.claude.com/docs/en/plugins)

## ライセンス

MIT
