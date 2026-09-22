# 管理者向けセットアップガイド

LINE WORKS MCP プラグインを社内で使えるようにするための、テナント管理者向けの手順です。
所要時間はおよそ 10 分です。この作業は**一度だけ**行えば、社内の全利用者が同じ Client ID / Client Secret を使えます。

## 1. Developer Console でアプリを登録する

1. [LINE WORKS Developer Console](https://dev.worksmobile.com/) に**テナント管理者**でログイン
2. 「アプリの新規追加」からクライアントアプリを作成(名前の例: `Claude LINE WORKS 連携`)
   - アプリの種類を聞かれたら **「認証アプリ」を選択**してください
     - **認証アプリ** = LINE WORKS API を呼び出すためのアプリ。OAuth でアクセストークンを取得して掲示板 API にアクセスする、このプラグインの用途はこちら
     - **プロビジョニングアプリ** = ID プロビジョニング(SCIM)連携用。Okta / Entra ID などからのアカウント自動同期のためのもので、**今回は使いません**
3. **OAuth Scopes** で掲示板の読み取りスコープ(`board.read`)を追加
   - 読み取り以外のスコープは付与しないでください(このプラグインは閲覧専用です)
4. **Redirect URL** に次を登録:
   ```
   http://localhost:9876/callback
   ```
5. **Refresh Token Rotation** の設定がある場合は **ON を推奨**(OFF でも動作します)
   - ON にするとトークン更新のたびに新しい Refresh Token に切り替わり、漏えい時のリスクが下がります。プラグインはどちらの設定でも自動で追従します
6. 発行された **Client ID** と **Client Secret** を控える

## 2. 利用者に共有する

以下の 3 点を、社内の安全な手段(LINE WORKS のトークなど)で利用者に共有してください:

- Client ID
- Client Secret
- 利用者向け手順書([setup-user.md](./setup-user.md))へのリンク

### Client Secret の取扱いポリシー(必読)

このプラグインは各利用者の PC で動作するため、**Client Secret を組織内の全利用者に配布する構造**になっています(LINE WORKS が PKCE 非対応のため。2026-09-20 公式ドキュメント確認)。以下を守ってください:

- **配布経路は組織内限定**: LINE WORKS のトーク、社内メール等、部外者の目に触れない経路のみ。公開チャットや外部 SNS、GitHub の公開リポジトリ・Issue・スクリーンショットへの投稿は禁止
- **利用者から社外への転送禁止**: 利用者向け手順書にも同旨を記載
- **端末を紛失/退職者が出た場合**: 個別トークンの失効に加え、必要に応じて Client Secret を Developer Console で **再発行** → 全利用者に再配布(再発行後は旧 Secret が使えなくなるため、全利用者が設定を更新する必要あり)
- **漏えいが疑われる場合**: 即座に Developer Console で Secret を再発行し、旧 Secret を無効化

### 悪用リスクの評価(参考)

Client Secret が漏えいしても、以下の防御層があるため単独では被害が発生しません:

- **LINE WORKS ログイン必須** — Secret 単体で API を呼び出せない。利用者が LINE WORKS にログインして認可する必要がある
- **Redirect URI が `localhost:9876` に固定** — 外部サイトが認可 code を傍受することは困難
- **読み取り専用スコープ** — 万一悪用されても書き込み・削除は不可
- **組織テナントに紐付いた Secret** — 別テナントのデータは見えない

現実的なリスクは「悪意ある同組織メンバーが同僚を騙して自分の localhost:9876 に code を送らせる」ソーシャルエンジニアリング型。これは組織内の通常のセキュリティ運用(退職者対応・不審動作の監視)でカバーされる範囲です。

## 3. 権限とセキュリティについて

- このプラグインは**ユーザー OAuth** を使います。各利用者は自分の LINE WORKS アカウントでログインし、**本人が閲覧できる掲示板だけ**が Claude から見えます。管理者権限が利用者に渡ることはありません
- プラグインができるのは掲示板の**読み取りのみ**です。投稿・編集・削除はできません
- ログイン状態は約 90 日で失効します。失効した利用者は再度ブラウザでログインするだけで復旧します

## 参考: 公式ドキュメント

- [LINE WORKS Developers ドキュメント](https://developers.worksmobile.com/jp/docs)
- [Developer Console の使い方](https://developers.worksmobile.com/jp/docs/developer-console)
- [認可・認証の概要](https://developers.worksmobile.com/jp/docs/auth)
- [Board(掲示板)API](https://developers.worksmobile.com/jp/docs/board)

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 利用者に掲示板が見えない | その利用者が LINE WORKS 上でその掲示板を閲覧できるか確認 |
| 「スコープが不足」エラー | Developer Console でアプリに `board.read` が付与されているか確認 |
| Redirect URL のエラー | `http://localhost:9876/callback` が正確に登録されているか確認(末尾スラッシュなし) |
