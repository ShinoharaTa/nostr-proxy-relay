# NIP-11 推奨値ガイド

このドキュメントでは、nostr-proxy-relayアプリケーションの機能を考慮したNIP-11の推奨値を説明します。

## アプリケーションの特徴

### コア機能
- **プロキシリレー**: バックエンドリレーへのプロキシとして動作
- **REQ（読み取り）**: 公開、認証不要で利用可能
- **EVENT（投稿）**: セーフリストに登録されたnpubからのみ許可
- **フィルタリング**: Kind 6/7のBot検出、Filter Query Languageによる高度なフィルタリング
- **管理機能**: IP管理、Kindブラックリスト、ログ機能

### 制約事項
- プロキシリレーであるため、バックエンドリレーの制限を超えないようにする必要がある
- セーフリスト機能により、EVENT投稿は制限されているが、auth_requiredはfalse

## 推奨値

### 基本情報

```json
{
  "name": "Your Proxy Relay Name",
  "description": "A proxy relay with bot filtering capabilities and Filter Query Language support",
  "contact": "nostr:npub1... or admin@example.com",
  "pubkey": "32-byte hex public key",
  "software": "https://github.com/ShinoharaTa/nostr-proxy-relay",
  "version": "0.1.0",
  "icon": "https://your-domain.com/icon.png"
}
```

### Supported NIPs

**最小構成（推奨）:**
```json
{
  "supported_nips": [1, 11]
}
```

**拡張構成（バックエンドが対応している場合）:**
```json
{
  "supported_nips": [1, 2, 4, 9, 11, 22, 28, 40, 70]
}
```

**説明:**
- **NIP-01**: 基本プロトコル（必須）
- **NIP-11**: リレー情報（実装済み）
- **NIP-02**: フォローリスト（バックエンドが対応していれば追加）
- **NIP-04**: 暗号化メッセージ（バックエンドが対応していれば追加）
- **NIP-09**: イベント削除（バックエンドが対応していれば追加）
- **NIP-22**: イベント作成時刻の制限（バックエンドが対応していれば追加）
- **NIP-28**: パブリックチャット（バックエンドが対応していれば追加）
- **NIP-40**: 有効期限付きイベント（バックエンドが対応していれば追加）
- **NIP-70**: Zap（バックエンドが対応していれば追加）

### Limitations

#### 推奨値（標準構成）

```json
{
  "limitation": {
    "max_limit": 500,
    "max_message_length": 131072,
    "max_subscriptions": 20,
    "max_filters": 10,
    "max_event_tags": 100,
    "max_content_length": 16384
  }
}
```

#### 値の根拠

| フィールド | 推奨値 | 根拠 |
|-----------|--------|------|
| `max_limit` | **500** | 業界標準。すべての主要リレーで使用されている値 |
| `max_message_length` | **131072** (128KB) | Strfry系の標準値。プロキシなのでバックエンドの制限を超えないようにする |
| `max_subscriptions` | **20** | 大多数のリレーで使用されている標準値 |
| `max_filters` | **10** | Filter Query Languageをサポートしているため、複雑なフィルタに対応可能。標準的な値 |
| `max_event_tags` | **100** | 標準的な値。過剰なタグを防ぐ |
| `max_content_length` | **16384** (16KB) | 標準的な値。コンテンツのサイズを制限してリソースを保護 |

#### 制限の緩い構成（大規模運用向け）

```json
{
  "limitation": {
    "max_limit": 500,
    "max_message_length": 524288,
    "max_subscriptions": 50,
    "max_filters": 20,
    "max_event_tags": 2000,
    "max_content_length": 65536
  }
}
```

#### 制限の厳しい構成（リソース節約向け）

```json
{
  "limitation": {
    "max_limit": 100,
    "max_message_length": 65536,
    "max_subscriptions": 10,
    "max_filters": 5,
    "max_event_tags": 50,
    "max_content_length": 8192
  }
}
```

### Negentropy

```json
{
  "negentropy": 0
}
```

**説明:**
- プロキシリレーであるため、Negentropyのサポートはバックエンドリレーに依存します
- バックエンドリレーがNegentropyをサポートしている場合でも、プロキシ層では直接サポートしていないため、**0（未サポート）**を推奨します
- 将来的にプロキシ層でNegentropyをサポートする場合は、**1（サポート）**に変更可能

### Auth Required / Payment Required

```json
{
  "limitation": {
    "auth_required": false,
    "payment_required": false
  }
}
```

**説明:**
- **auth_required**: `false` - REQ（読み取り）は公開されているため
- **payment_required**: `false` - 現在の実装では料金機能がないため
- EVENT（投稿）はセーフリストで制限されているが、これはNIP-11の`auth_required`とは異なる概念

## バックエンドリレーとの整合性

プロキシリレーとして動作するため、**バックエンドリレーの制限を超えない値**を設定することが重要です。

### 推奨アプローチ

1. **バックエンドリレーのNIP-11情報を取得**
   ```bash
   curl -H "Accept: application/nostr+json" https://your-backend-relay.com/
   ```

2. **バックエンドの制限値を確認**
   - `max_limit`
   - `max_message_length`
   - `max_subscriptions`
   - その他の制限

3. **プロキシリレーの値を設定**
   - バックエンドの値以下に設定
   - または、バックエンドの値と同じにする

### 例：Strfryをバックエンドに使用する場合

Strfryの標準値：
- `max_limit`: 500
- `max_message_length`: 131072
- `max_subscriptions`: 20

推奨設定：
```json
{
  "limitation": {
    "max_limit": 500,
    "max_message_length": 131072,
    "max_subscriptions": 20,
    "max_filters": 10,
    "max_event_tags": 100,
    "max_content_length": 16384
  }
}
```

## 実装例

### 標準構成（推奨）

```json
{
  "name": "My Proxy Relay",
  "description": "A proxy relay with bot filtering capabilities",
  "contact": "nostr:npub1...",
  "pubkey": "your-pubkey-hex",
  "software": "https://github.com/ShinoharaTa/nostr-proxy-relay",
  "version": "0.1.0",
  "icon": "https://your-domain.com/icon.png",
  "supported_nips": [1, 11],
  "negentropy": 0,
  "limitation": {
    "max_limit": 500,
    "max_message_length": 131072,
    "max_subscriptions": 20,
    "max_filters": 10,
    "max_event_tags": 100,
    "max_content_length": 16384,
    "auth_required": false,
    "payment_required": false
  }
}
```

## 設定のカスタマイズ

管理画面（`/config`）の「NIP-11 Info」タブから、これらの値をカスタマイズできます。

### 推奨設定手順

1. バックエンドリレーのNIP-11情報を確認
2. 管理画面で「NIP-11 Info」タブを開く
3. バックエンドの制限値を参考に、適切な値を設定
4. 「Save Changes」をクリック
5. 設定が即座に反映されることを確認：
   ```bash
   curl -H "Accept: application/nostr+json" https://your-relay.com/
   ```

## 注意事項

1. **バックエンドの制限を超えない**: プロキシリレーなので、バックエンドの制限を超える値を設定すると、実際には動作しません
2. **Supported NIPs**: 実際にサポートしているNIPのみを記載してください。バックエンドがサポートしていても、プロキシ層で処理していないNIPは含めないことを推奨します
3. **Negentropy**: プロキシ層で直接サポートしていないため、0を推奨します
4. **即時反映**: 設定変更は即座に反映されますが、クライアントのキャッシュを考慮する必要がある場合があります
