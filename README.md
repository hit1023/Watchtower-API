# Watchtower API

Watchtowerは、Webページの意味のある変化を構造化イベントへ変換する監視サービスです。バージョン0.1はCloudflare Workers上で動作し、監視設定とスナップショットをD1へ保存します。必要に応じてWorkers AIによる変更分類も利用できます。

## 公開サービス

- ダッシュボード：[watchtower.s-quad.com](https://watchtower.s-quad.com)
- APIドキュメント：[watchtower.s-quad.com/docs/](https://watchtower.s-quad.com/docs/)
- API：[watchtower-api.s-quad.com](https://watchtower-api.s-quad.com)

どちらのカスタムドメインもCloudflare経由のHTTPSで配信しています。ダッシュボードのAPIキーは、標準では`sessionStorage`に保存されます。「このブラウザに保存する」を選択した場合は、利用者が削除するまで`localStorage`に保存されます。

## 現在できること

- URLと自然言語の監視指示を登録
- 手動実行、またはCron Triggerによる15分ごとの定期実行
- HTML、JSON、プレーンテキストを比較しやすい形式へ正規化
- スナップショット、実行履歴、重要な変更イベントをD1へ保存
- ローカル・プライベートURLの拒否、レスポンスサイズ制限、リダイレクト検証、タイムアウト
- 通常の差分解析に加え、`AI_ENABLED=true`でWorkers AIによる変更分類を有効化

## ローカル開発

```bash
npm install
npm run types
npm run db:migrate:local
npm run dev
```

`APP_ENV=development`で、リクエスト先のホスト名が`localhost`または`127.0.0.1`の場合に限り、`WATCHTOWER_API_KEY`なしで利用できます。デプロイ済みURLでは常にAPIキーが必要です。ローカルでも認証を試す場合は、`.dev.vars.example`を`.dev.vars`へコピーし、24文字以上の秘密キーを設定してください。

監視を作成して実行する例：

```bash
curl -X POST http://localhost:8787/v1/watches \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://developers.cloudflare.com/changelog/",
    "instruction": "新製品、料金、非推奨化、破壊的なAPI変更を検出",
    "interval_minutes": 60,
    "importance_threshold": 0.7
  }'

curl -X POST http://localhost:8787/v1/watches/WATCH_ID/run
curl http://localhost:8787/v1/events
```

APIキーを設定している場合は、`-H 'Authorization: Bearer YOUR_KEY'`を追加します。

## Cloudflareへのデプロイ

本番WorkerとAPACリージョンのD1データベースは構築済みです。APIを更新する場合：

1. `npx wrangler login`でCloudflareへログインします。
2. 新しいマイグレーションがある場合は`npm run db:migrate:remote`を実行します。
3. `npm run check`で検証します。
4. `npm run deploy`でデプロイします。

ダッシュボードとドキュメントは別途デプロイします。

```bash
npm run check:frontend
npm run deploy:frontend
```

APIと静的フロントエンドは別々のWorkersです。カスタムドメインは`wrangler.jsonc`と`wrangler.frontend.jsonc`で宣言し、DNSレコードと証明書はCloudflareが管理します。

本番の`WATCHTOWER_API_KEY`はCloudflare Secretとして保存されています。ローテーションには`npx wrangler secret put WATCHTOWER_API_KEY`を使用します。

必要に応じて、Cloudflare Accessによる追加の認証レイヤーを導入できます。

## API一覧

| メソッド | パス | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 稼働状態を確認 |
| `POST` | `/v1/watches` | 監視を作成 |
| `GET` | `/v1/watches` | 監視一覧を取得 |
| `GET` | `/v1/watches/:id` | 指定した監視を取得 |
| `POST` | `/v1/watches/:id/run` | 監視を即時実行 |
| `GET` | `/v1/events` | 重要な変更イベントを取得 |

## 現在の範囲

バージョン0.1では、サイズを制限した正規化テキストをD1へ保存します。R2へのスナップショット保存、Browser Renderingによる取得、Webhook、AI Search、MCP連携は、コアとなる変更検出を検証した後の拡張候補です。
