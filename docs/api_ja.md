# API リファレンス

すべての管理用 API エンドポイントは **Basic 認証** が必要です。

## 認証
HTTP ヘッダーに以下を含めてください。
`Authorization: Basic <base64(ADMIN_USER:ADMIN_PASS)>`

---

## エンドポイント一覧

### リレー設定
- `GET /api/relay`: 現在のバックエンドリレー設定を取得
- `PUT /api/relay`: バックエンドリレー（接続先）を更新

### セーフリスト管理
- `GET /api/safelist`: 登録済み npub 一覧
- `POST /api/safelist`: npub の追加・更新
- `DELETE /api/safelist/:npub`: 削除
- `PUT /api/safelist/:npub/ban`: 指定した npub を BAN
- `PUT /api/safelist/:npub/unban`: BAN 解除

### フィルタルール管理 (DSL)
- `GET /api/filters`: フィルタルール一覧
- `POST /api/filters`: ルールの作成
- `PUT /api/filters/:id`: ルールの更新
- `DELETE /api/filters/:id`: ルールの削除
- `POST /api/filters/validate`: DSL クエリの構文チェック

### IP アクセス制御
- `GET /api/ip-access-control`: IP リスト取得
- `POST /api/ip-access-control`: IP の BAN/許可設定
- `DELETE /api/ip-access-control/:id`: 設定削除

### 統計・ログ
- `GET /api/stats`: 接続数、拒否理由などの統計情報
- `GET /api/connection-logs`: 接続履歴
- `GET /api/event-rejection-logs`: フィルタリングによる拒否履歴

---

## 使用例 (curl)

### セーフリストへの追加
```bash
curl -X POST \
  -H "Authorization: Basic $(echo -n 'admin:pass' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"npub": "npub1...", "flags": 1, "memo": "My Account"}' \
  http://localhost:8080/api/safelist
```

### 統計情報の取得
```bash
curl -H "Authorization: Basic $(echo -n 'admin:pass' | base64)" \
  http://localhost:8080/api/stats
```
