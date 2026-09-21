# 利用者向けセットアップガイド

Claude から LINE WORKS を使えるようにする手順です。**プログラミングの知識は不要**です。
事前に、管理者から **Client ID** と **Client Secret** を受け取っておいてください。

対応環境: macOS / Windows(Claude Code、Claude Desktop)

## 1. プラグインをインストールする

### Claude Code(ターミナル)の場合

```
/plugin marketplace add aalto-consulting-inc/claude-line-works
/plugin install line-works@aalto-plugins
```

### Claude Desktop の場合(拡張機能ファイル `.mcpb` 経由)

Claude Code CLI が無くても、Claude Desktop 単体で完結します。

#### 手順

1. **`.mcpb` ファイルをダウンロード**
   - [Releases 一覧](https://github.com/aalto-consulting-inc/claude-line-works/releases) を開き、最新リリースの Assets から `.mcpb` ファイル(`line-works-<バージョン>.mcpb`)を取得
2. **Claude Desktop を起動** → **設定** → **拡張機能** → **拡張機能をインストール** → ダウンロードした `.mcpb` を選択(またはドラッグ&ドロップ)
3. インストール画面で **Client ID / Client Secret / コールバックポート** を入力
   - Client ID: 管理者から受け取った値
   - Client Secret: 管理者から受け取った値(**macOS のキーチェーン等の安全な保管領域に暗号化保存**されます)
   - コールバックポート: 空欄のままで OK(自動的に 9876 が使われます)
4. インストール完了 → Claude Desktop のチャットが `line-works` MCP サーバーに自動接続

> Claude Desktop の拡張機能(`.mcpb`)は Anthropic 公式のパッケージ形式です。単一ファイルで MCP サーバーが同梱されているため、Node.js を別途インストールする必要はありません(Claude Desktop がランタイムを提供)。

## 2. Client ID と Client Secret を入力する

インストール時(または初回有効化時)に設定画面が表示されます。
管理者から受け取った **Client ID** と **Client Secret** をそのまま貼り付けてください。
「コールバックポート」は通常そのまま(9876)で構いません(空欄でも自動的に 9876 が使われます)。

> **Client Secret の取扱い**: パスワードと同等の秘密情報です。**社外の人に共有・スクリーンショットに写り込む・SNS 投稿・公開の場所への貼付けは禁止**です。
> 万一漏えいの心配がある場合は管理者に連絡してください(Developer Console で再発行できます)。

## 3. LINE WORKS にログインして認可する

Claude に次のように話しかけてください:

> LINE WORKS に接続して

Claude が URL を表示するので、それをブラウザで開き、LINE WORKS にログインして「許可」を押します。
「認可が完了しました」と表示されたら、タブを閉じて Claude に戻ってください。

> **うまくいかないとき**: ログイン後にブラウザが「このページに接続できません」等のエラーになった場合は、
> そのページの**アドレスバーの URL を全部コピー**して、Claude に「この URL で認可を完了して: (貼り付け)」と伝えてください。

## 4. 使ってみる

こんなふうに話しかけられます:

- 「最近の掲示板の投稿をまとめて」
- 「総務の掲示板の今週の投稿を要約して」
- 「経費精算に関するお知らせを探して」

## よくある質問

**Q. 自分に見えない掲示板も見られてしまう?**
いいえ。あなたの LINE WORKS アカウントで閲覧できる掲示板だけが対象です。

**Q. Claude が掲示板に投稿してしまうことはない?**
ありません。このプラグインは読み取り専用です。

**Q. しばらく使っていなかったら「ログインし直して」と言われた**
ログインの有効期限(約 90 日)が切れています。手順 3 をもう一度行ってください。

**Q. Client Secret はどこに保存される?**
お使いの端末の安全な保管領域(macOS はキーチェーン、Windows は資格情報マネージャー)に保存され、平文の設定ファイルには残りません。
アクセストークン・リフレッシュトークンは Claude の設定フォルダ内(`~/.claude/plugins/data/line-works-aalto-plugins/tokens.json`)に、本人のみ読み書き可能な権限(600)で保存されます。
