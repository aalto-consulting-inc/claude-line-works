# セキュリティポリシー

## サポート対象バージョン

| バージョン | サポート |
| --- | --- |
| 最新リリース | ✅ |
| それ以前 | ❌(最新版への更新をお願いします) |

修正は最新リリースに対してのみ行い、過去バージョンへのバックポートは行いません。

## 脆弱性の報告

**公開 issue には書かないでください。** 報告は非公開で受け付けます。

1. このリポジトリの [Security タブ](https://github.com/aalto-consulting-inc/claude-line-works/security/advisories/new) を開く
2. 「Report a vulnerability」から報告する

報告に含めてほしい内容:

- 影響を受けるバージョン(`.claude-plugin/plugin.json` または `mcpb/manifest.json` の `version`)
- 再現手順、または該当コードの箇所
- 想定される影響(トークン漏洩・権限昇格・情報漏洩など)
- 利用環境(Claude Code CLI / Claude Desktop MCPB、OS)

**認証情報そのものは報告に貼り付けないでください。** access_token / refresh_token / client_secret / 認可 code などが漏れている場合は、値ではなく「どこに何が露出しているか」を記載してください。

## 対応の流れ

1. 一次返信: 1 週間以内を目安(ベストエフォート)
2. 影響範囲の確認と再現
3. 修正版のリリース
4. GitHub Security Advisory の公開(報告者のクレジットは希望に応じて記載)

## 想定される攻撃面

このプラグインは LINE WORKS の OAuth トークンを利用者のローカル環境に保存します。特に以下の領域の報告を歓迎します。

- トークンの保存・読み出し(ファイルパーミッション、保存先の妥当性)
- OAuth 認可フロー(state の検証、ローカルコールバックの取り扱い)
- エラー出力・ログへの認証情報の混入
- 依存パッケージ経由のサプライチェーン

設計上の前提と既知のリスク評価は [docs/setup-admin.md](docs/setup-admin.md)、検証記録は [docs/verification.md](docs/verification.md) に記載しています。

## 対象外

- LINE WORKS 本体・LINE WORKS API の脆弱性 → [LINE WORKS Developers](https://developers.worksmobile.com/jp/docs) へ
- Claude Code / Claude Desktop 本体の脆弱性 → Anthropic へ
- 利用者側の設定ミス(client_secret の共有、過剰なスコープ付与など)
