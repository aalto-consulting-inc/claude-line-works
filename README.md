# LINE WORKS MCP プラグイン for Claude

LINE WORKS を Claude(Code / Desktop)から利用するための MCP プラグインです。

> [!TIP]
> 「総務の掲示板の今週の投稿を要約して」「経費精算のお知らせを探して」— そんな依頼が Claude でできます。

## 対応機能

| LINE WORKS の機能 | 対応状況 | 備考 |
|---|---|---|
| 掲示板(Board) | ✅ 読み取りのみ | 掲示板一覧・投稿一覧・投稿本文の読み取りに対応。投稿のコメントの読み取りは未対応 |
| トーク / Bot | ❌ 未対応 | 将来検討 |
| カレンダー | ❌ 未対応 | 将来検討 |
| 組織・メンバー情報 | ❌ 未対応 | 将来検討 |

要求する OAuth スコープも現在は掲示板の読み取り(`board.read`)のみです。機能追加時はスコープの追加が必要になります。

## 特長

- **読み取り専用** — 現時点のツールはすべて読み取りのみ。投稿・編集・削除は一切できないため、誤操作の心配がありません
- **本人の権限どおり** — 各利用者が自分の LINE WORKS アカウントでログインし、本人がアクセスできる範囲だけが見えます(ユーザー OAuth)
- **非エンジニアでも導入可能** — ビルド不要。インストールして ID を貼り付け、ブラウザでログインするだけ
- **macOS / Windows 対応**

## 対応環境と配布形式

| 環境 | 対応 | 配布形式 | 備考 |
|---|---|---|---|
| Claude Desktop | ✅ | `.mcpb`(Anthropic 公式の Desktop 拡張機能) | **Free プランでも利用可能**。Node.js のインストール不要(Desktop がランタイム提供) |
| Claude Code(CLI / IDE) | ✅ | プラグイン(このリポジトリのマーケットプレイス経由) | Claude Code は Pro / Max / Team / Enterprise プラン向け(Node.js 18 以降を含む) |
| claude.ai(ブラウザ版チャット) | ❌ | — | ローカル MCP サーバーを実行できないため。対応にはリモート MCP のホスティングが必要(将来検討) |

※ 実機検証は macOS(Claude Code CLI + Claude Desktop)で実施。Windows も Node 18+ 環境で動作する想定だが、公開前の実機検証は行わないため公開後にフィードバックがあれば個別対応します。

## インストール

- **管理者向け**: [docs/setup-admin.md](docs/setup-admin.md) : 最初に設定が必要
- **利用者向け**: [docs/setup-user.md](docs/setup-user.md) : Claude Desktop / Claude Code CLI 両対応の手順

## 提供ツール

### 共通

| ツール | 説明 |
|---|---|
| `authorize` | LINE WORKS へのログイン認可 |

### 掲示板(Board)

| ツール | 説明 |
|---|---|
| `list_boards` | 掲示板の一覧 |
| `list_recent_posts` | 全掲示板を横断した最新投稿一覧 |
| `list_posts` | 掲示板の投稿一覧 |
| `get_post` | 投稿本文(Markdown 変換) |

掲示板向けの `board-digest` スキルが同梱されており、掲示板の要約・情報探索の依頼を適切なツール呼び出しに展開します。

## システム構成

### アーキテクチャ

プラグインはすべて利用者の PC 内で動きます(中間サーバーなし)。認証情報とトークンが第三者のサーバーを経由することはありません。

```mermaid
graph LR
    subgraph PC["利用者の PC(macOS / Windows)"]
        User(["利用者"])
        Claude["Claude Code / Desktop<br/>+ board-digest スキル"]
        MCP["line-works プラグイン<br/>MCP サーバー(Node 18+)<br/>dist/server.js"]
        Token[("トークン保存<br/>CLAUDE_PLUGIN_DATA")]
        Browser["ブラウザ"]
    end
    subgraph LW["LINE WORKS クラウド"]
        Auth["認証サーバー<br/>auth.worksmobile.com"]
        API["LINE WORKS API<br/>www.worksapis.com/v1.0<br/>(現状は Board API のみ利用)"]
    end
    User -- "掲示板を要約して" --> Claude
    Claude -- "MCP ツール呼び出し" --> MCP
    MCP <--> Token
    MCP -- "トークン取得・自動更新" --> Auth
    MCP -- "掲示板の読み取り(Bearer)" --> API
    User -- "認可 URL を開く" --> Browser
    Browser -- "ログイン・同意" --> Auth
    Auth -- "code(localhost コールバック)" --> MCP
```

### シーケンス(初回の認可〜掲示板の要約)

```mermaid
sequenceDiagram
    autonumber
    actor U as 利用者
    participant C as Claude
    participant S as MCP サーバー<br/>(プラグイン)
    participant B as ブラウザ
    participant A as LINE WORKS 認証
    participant P as LINE WORKS API<br/>(Board)

    U->>C: 「お知らせ掲示板を要約して」
    C->>S: list_boards
    S-->>C: 認可が必要(authorize を案内)
    C->>S: authorize
    S->>S: 127.0.0.1:9876 で待受開始
    S-->>C: 認可 URL
    C-->>U: URL を提示
    U->>B: URL を開く
    B->>A: ログイン・同意
    A-->>B: localhost へリダイレクト(code)
    B->>S: GET /callback?code&state
    S->>A: code をトークンに交換
    A-->>S: access / refresh トークン
    Note over S: トークンを保存<br/>(失効前に自動リフレッシュ)
    C->>S: list_boards(再実行)
    S->>P: GET /boards(Bearer)
    P-->>S: 掲示板一覧
    C->>S: list_posts → get_post
    S->>P: GET /boards/{id}/posts/{postId}
    P-->>S: 投稿(HTML 本文)
    S-->>C: Markdown に変換して返却
    C-->>U: 要約を回答
```

ローカルコールバックが成立しない環境では、リダイレクト先 URL を利用者がコピーして Claude に貼り付けるフォールバック(`authorize` の `code_or_url`)で同じ処理が行われます。

## 開発

```sh
cd server
npm ci
npm run typecheck   # 型チェック
npm test            # ユニットテスト
npm run build       # ../dist/server.js にバンドル(コミット対象)
node ../scripts/smoke.mjs   # バンドルのスモークテスト
```

#### `dist/server.js` の扱い

プラグインは `.mcp.json` から `${CLAUDE_PLUGIN_ROOT}/dist/server.js` を直接起動するため、バンドルはリポジトリにコミットしている。ただし **PR ごとに手でビルドしてコミットする必要はない**。

`server/**` を変更した PR には [`.github/workflows/dist.yml`](.github/workflows/dist.yml) が反応し、バンドルを再ビルドして差分があれば `build: rebuild dist/server.js` として PR ブランチに自動コミットする(Dependabot PR も同様)。CI の同期チェックは PR では行わず、main への push とリリースビルド時に最終確認する。

制約:

- **fork からの PR は対象外**。権限付きで他人のコードを実行しないため。fork の場合は手で `npm run build` してコミットする
- **`DIST_BOT_TOKEN` シークレットの登録が必要。** `GITHUB_TOKEN` で push すると bot のコミットに CI が付かず(`GITHUB_TOKEN` の仕様)、main の「Require status checks to pass」を満たせない PR になってしまう。`contents: write` を持つ fine-grained PAT か GitHub App トークンを登録する。未登録のまま `dist/` の更新が必要になった場合、`dist.yml` は黙ってフォールバックせず対処手順を出して失敗する。トークンの期限切れ・失効も push の失敗として同様に案内される
- このワークフロー追加**以前**に作られた PR には遡って発火しない。Dependabot PR なら `@dependabot recreate` とコメントすれば作り直されて発火する

#### コード解析(CodeQL)

CodeQL は **advanced setup**([`.github/workflows/codeql.yml`](.github/workflows/codeql.yml))で動かしている。default setup ではなくワークフローに切り出しているのは、**解析対象から `dist/` を除外するため**([`.github/codeql/codeql-config.yml`](.github/codeql/codeql-config.yml))。default setup ではパス除外を設定できない。

`dist/server.js` は esbuild の生成物なので、解析対象に含めると

- 同じ指摘がソース側(`server/src`)とバンドル側で二重に上がる
- バンドルされた第三者コードの指摘まで上がるが、こちらでは直せない(依存自体の脆弱性は Dependabot alerts の担当)
- `dist.yml` による自動再ビルドのたびに行番号がずれ、dismiss しても新しいアラートが生え続ける

という問題がある。

- 実 API の検証記録: [docs/api-notes.md](docs/api-notes.md)
- 手動 E2E 検証チェックリスト: [docs/verification.md](docs/verification.md)
- ローカルでプラグインとして試す: `claude --plugin-dir .`
- Claude Desktop 用 MCPB(`.mcpb`)をビルド: `cd server && npm run build:mcpb`(`build/line-works.mcpb` が出力される)

### リリース

手元で `git tag` を打つ必要はない。[Release workflow](https://github.com/aalto-consulting-inc/claude-line-works/actions/workflows/release.yml) にバージョンを指定して実行すると、資産とリリースノート付きの下書きリリースが出来る。人がやるのは中身を確認して Publish するだけ。

1. **バージョンを上げて main にマージ** — `cd server && npm version <x.y.z> --no-git-tag-version`(`server/package.json` と `server/package-lock.json` が更新される)+ `.claude-plugin/plugin.json` / `mcpb/manifest.json` / `server/src/index.ts` の `version` を手で揃える。`dist/server.js` はリリース PR でも `dist.yml` が自動コミットする。マージした時点で Claude Code(マーケットプレイス経由)の利用者に反映される
2. **workflow を実行** — [Release workflow](https://github.com/aalto-consulting-inc/claude-line-works/actions/workflows/release.yml) の **Run workflow** から。Use workflow from は `main`、バージョンに `0.3.1` のように入力して実行
3. **Action の完了を待つ** — タグ重複チェック → バージョン整合チェック → テスト → `.mcpb` ビルド → 下書きリリース作成。`line-works.mcpb` と `line-works.mcpb.sha256` が添付され、本文には自動生成のリリースノートとチェックサムが入る
4. **Publish release** — Releases で内容を確認して公開。git タグはこのとき初めて作られ、Claude Desktop の利用者向けリンク(`releases/latest/download/line-works.mcpb`)が新版を指す

補足:

- 下書きの Target は実行時の main の SHA に固定される。Publish までに main が進んでも、ビルドした中身とタグの指す commit はずれない
- workflow は上の 5 ファイルすべてを指定バージョンと突き合わせる。1 つでも古いままなら落ちる
- バージョン不一致やテスト失敗で落ちた場合、下書きは作られない。修正を main にマージしてから同じバージョンで再実行すればよい
- 既に下書きがある状態で再実行すると、資産を差し替えて本文を更新する。自分で書き換えた本文は保持される
- タグを直接 push しても、GitHub 上で下書きを手で作っても何も起きない。リリースは必ず Actions から始める(`release` イベントは下書きの作成では発火しないため)
- 公開済みのリリースや既存のタグと同じバージョンを指定すると、上書きせずに失敗する
- チェックサムはリリースノート内を `<!-- sha256:start -->` 〜 `<!-- sha256:end -->` で囲んで挿入する。再実行しても重複せず、囲みの外に書いた本文は保持される

## TODO

- [ ] **パイロット導入** — 試験運用開始 → フィードバック反映 → `v1.0.0`
- [ ] **Windows 実機検証**(任意・フィードバック起点で対応)
- [ ] **Dependabot のバージョン更新を有効化** — 現在は脆弱性起点のセキュリティ更新のみ。定期更新を再開する場合は [`.github/dependabot.yml`](.github/dependabot.yml) の `open-pull-requests-limit` を `0` から戻す。依存更新で変わる `dist/server.js` は [`.github/workflows/dist.yml`](.github/workflows/dist.yml) が自動コミットするため、定期更新を戻しても手作業は増えない

## 参考リンク

- [LINE WORKS Developers ドキュメント](https://developers.worksmobile.com/jp/docs)
- [Board(掲示板)API](https://developers.worksmobile.com/jp/docs/board)
- [ユーザーアカウント認証(OAuth 2.0)](https://developers.worksmobile.com/jp/docs/auth-oauth)
- [Claude Code プラグインドキュメント](https://code.claude.com/docs/en/plugins)

## ライセンス

MIT
