# NIP-11 リレー情報比較

## 収集日
2024年12月（推定）

## リレー一覧とNIP-11情報

### 1. nos.lol (Strfry)
- **URL**: `wss://nos.lol/`
- **Name**: nos.lol
- **Description**: Generally accepts notes, except spammy ones.
- **Contact**: https://wikifreedia.xyz/nos.lol/
- **Software**: git+https://github.com/hoytech/strfry.git
- **Version**: 1.0.4
- **Pubkey**: c5fadeb5d90d68baffc631455a07ca340ccf1e31110955e16d45eb5f87147cd9
- **Icon**: https://nos.lol/favicon.ico
- **Negentropy**: 1 (サポート)
- **Supported NIPs**: [1, 2, 4, 9, 11, 22, 28, 40, 70, 77]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 131072
  - max_subscriptions: 20

---

### 2. yabu.me (Strfry)
- **URL**: `wss://yabu.me/`
- **Name**: やぶみ 🏹📨
- **Description**: Aggregator relay for (mainly) Japanese users.
- **Contact**: mailto:admin@yabu.me
- **Software**: git+https://github.com/hoytech/strfry.git
- **Version**: 1.0.4
- **Pubkey**: b707d6be7fd9cc9e1aee83e81c3994156cfcf74ded5b09111930fdeeeb5a0c20
- **Icon**: https://yabu.me/icon.png
- **Negentropy**: 1 (サポート)
- **Supported NIPs**: [1, 2, 4, 9, 11, 22, 28, 40, 70, 77]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 1310720 (1.3MB)
  - max_subscriptions: 50

---

### 3. relay-jp.nostr.wirednet.jp (Strfry)
- **URL**: `wss://relay-jp.nostr.wirednet.jp/`
- **Name**: relay-jp.nostr.wirednet.jp
- **Description**: relay-jp.nostr.wirednet.jp
- **Contact**: kirino.minato+relay-jp@gmail.com
- **Software**: git+https://github.com/hoytech/strfry.git
- **Version**: 1.0.4-2-g5a950be
- **Pubkey**: 634bd19e5c87db216555c814bf88e66ace175805291a6be90b15ac3b2247da9b
- **Icon**: https://relay-jp.nostr.wirednet.jp/favicon.ico
- **Negentropy**: 1 (サポート)
- **Supported NIPs**: [1, 2, 4, 9, 11, 22, 28, 40, 70, 77]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 131072
  - max_subscriptions: 20

---

### 4. nostr.compile-error.net (relayer framework)
- **URL**: `wss://nostr.compile-error.net/`
- **Name**: nostr-relay
- **Description**: relay powered by the relayer framework
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/nostr-relay
- **Version**: 0.0.217
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **Icon**: https://nostr.compile-error.net/logo.png
- **Banner**: (空)
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 26, 28, 33, 40, 42, 45, 50, 65, 70]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 524288
  - max_subscriptions: 20
  - max_subid_length: 100
  - max_event_tags: 100
  - max_content_length: 16384
  - created_at_lower_limit: 0
  - created_at_upper_limit: 0
  - auth_required: false
  - payment_required: false
  - restricted_writes: false
- **Fees**: {}

---

### 5. cagliostr.compile-error.net (C++)
- **URL**: `wss://cagliostr.compile-error.net/`
- **Name**: cagliostr
- **Description**: Nostr relay written in C++
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/cagliostr
- **Version**: 0.0.178
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **Icon**: https://raw.githubusercontent.com/mattn/cagliostr/main/cagliostr.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 26, 28, 33, 40, 42, 45, 50, 62, 70]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 5242880 (5MB)
  - max_subscriptions: 20
  - max_filters: 10
  - max_subid_length: 100
  - max_event_tags: 100
  - max_content_length: 16384
  - min_pow_difficulty: 30
  - auth_required: false
  - payment_required: false
  - restricted_writes: false
- **Fees**: {}

---

### 6. ruby-nostr-relay.compile-error.net (Ruby)
- **URL**: `wss://ruby-nostr-relay.compile-error.net/`
- **Name**: Ruby Nostr Relay
- **Description**: A lightweight Nostr relay implementation in Ruby
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/ruby-nostr-relay
- **Version**: 1.0.0
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **Icon**: https://ruby-nostr-relay.compile-error.net/logo.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40, 50, 62, 70]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 65536
  - max_subscriptions: 20
  - max_filters: 10
  - max_subid_length: 100
  - min_prefix: 4
  - max_event_tags: 2000
  - max_content_length: 65536
  - min_pow_difficulty: 0
  - auth_required: false
  - payment_required: false

---

### 7. lua-nostr-relay.compile-error.net (Lua)
- **URL**: `wss://lua-nostr-relay.compile-error.net/`
- **Name**: Lua Nostr Relay
- **Description**: A lightweight Nostr relay implementation in Lua
- **Contact**: mattn.jp@gmail.com
- **Software**: lua-nostr-relay
- **Version**: 0.0.1
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **URL**: wss://lua-nostr-relay.compile-error.net
- **Icon**: https://lua-nostr-relay.compile-error.net/logo.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40]
- **Limitations**: (記載なし)

---

### 8. lisp-nostr-relay.compile-error.net (Lisp)
- **URL**: `wss://lisp-nostr-relay.compile-error.net/`
- **Name**: Lisp Nostr Relay
- **Description**: A lightweight Nostr relay implementation in Lisp
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/lisp-nostr-relay
- **Version**: 1.0.0
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **Icon**: https://lisp-nostr-relay.compile-error.net/logo.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40, 50, 62, 70]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 65536
  - max_subscriptions: 20
  - max_filters: 10
  - max_subid_length: 100
  - min_prefix: 4
  - max_event_tags: 2000
  - max_content_length: 65536
  - min_pow_difficulty: 0
  - auth_required: false
  - payment_required: false

---

### 9. nim-nostr-relay.compile-error.net (Nim)
- **URL**: `wss://nim-nostr-relay.compile-error.net/`
- **Name**: Nim Nostr Relay
- **Description**: A lightweight Nostr relay implementation in Nim
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/nim-nostr-relay
- **Version**: 0.0.1
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **Icon**: https://nim-nostr-relay.compile-error.net/logo.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 33, 40]
- **Limitations**: (記載なし)

---

### 10. relay.damus.io (Strfry)
- **URL**: `wss://relay.damus.io/`
- **Name**: damus.io
- **Description**: Damus strfry relay
- **Contact**: jb55@jb55.com
- **Software**: git+https://github.com/hoytech/strfry.git
- **Version**: 1.0.4-1-g783f9ce8cc77
- **Pubkey**: 32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245
- **Icon**: https://damus.io/img/logo.png
- **Negentropy**: 1 (サポート)
- **Supported NIPs**: [1, 2, 4, 9, 11, 22, 28, 40, 70, 77]
- **Limitations**:
  - max_limit: 500
  - max_message_length: 400000
  - max_subscriptions: 300

---

### 11. zig-nostr-relay.compile-error.net (Zig)
- **URL**: `wss://zig-nostr-relay.compile-error.net/`
- **Name**: Zig Nostr Relay
- **Description**: A lightweight Nostr relay implementation in Zig
- **Contact**: mattn.jp@gmail.com
- **Software**: https://github.com/mattn/zig-nostr-relay
- **Version**: 0.1.0
- **Pubkey**: 2c7cc62a697ea3a7826521f3fd34f0cb273693cbe5e9310f35449f43622a5cdc
- **URL**: wss://zig-nostr-relay.compile-error.net
- **Icon**: https://zig-nostr-relay.compile-error.net/logo.png
- **Negentropy**: (記載なし)
- **Supported NIPs**: [1, 2, 4, 9, 11, 20, 22, 33, 40, 42]
- **Limitations**: (記載なし)

---

## 比較表

### ソフトウェア別分類

| ソフトウェア | リレー数 | Negentropyサポート |
|------------|---------|-------------------|
| Strfry | 4 | すべてサポート |
| relayer framework (Go) | 1 | 未記載 |
| C++ (cagliostr) | 1 | 未記載 |
| Ruby | 1 | 未記載 |
| Lua | 1 | 未記載 |
| Lisp | 1 | 未記載 |
| Nim | 1 | 未記載 |
| Zig | 1 | 未記載 |

### 共通フィールドの比較

#### max_limit
- **500**: すべてのリレーで統一

#### max_message_length
- **131072** (128KB): nos.lol, relay-jp.nostr.wirednet.jp
- **1310720** (1.3MB): yabu.me
- **400000** (400KB): relay.damus.io
- **524288** (512KB): nostr.compile-error.net
- **5242880** (5MB): cagliostr.compile-error.net
- **65536** (64KB): ruby, lisp

#### max_subscriptions
- **20**: 大多数
- **50**: yabu.me
- **300**: relay.damus.io

#### Negentropyサポート
- **サポート**: nos.lol, yabu.me, relay-jp.nostr.wirednet.jp, relay.damus.io (すべてStrfry)
- **未記載**: その他のリレー

### Supported NIPsの比較

#### 最も多くサポートしているNIPs
- **nostr.compile-error.net**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 26, 28, 33, 40, 42, 45, 50, 65, 70] (19個)
- **cagliostr**: [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 26, 28, 33, 40, 42, 45, 50, 62, 70] (19個)

#### Strfry系の共通NIPs
- [1, 2, 4, 9, 11, 22, 28, 40, 70, 77] (10個)

### 追加フィールドの例

一部のリレーでは以下の追加フィールドが使用されています：

- `max_filters`: フィルタの最大数
- `max_subid_length`: サブスクリプションIDの最大長
- `max_event_tags`: イベントタグの最大数
- `max_content_length`: コンテンツの最大長
- `min_pow_difficulty`: 最小PoW難易度
- `min_prefix`: 最小プレフィックス
- `created_at_lower_limit`: created_atの下限
- `created_at_upper_limit`: created_atの上限
- `restricted_writes`: 書き込み制限
- `fees`: 料金情報
- `banner`: バナー画像URL
- `url`: リレーのURL（一部のリレーで使用）

## 実装への推奨事項

現在のプロジェクトに追加を検討すべきフィールド：

1. **max_filters**: フィルタの最大数（cagliostr, ruby, lispで使用）
2. **max_subid_length**: サブスクリプションIDの最大長（複数のリレーで使用）
3. **max_event_tags**: イベントタグの最大数（複数のリレーで使用）
4. **max_content_length**: コンテンツの最大長（複数のリレーで使用）
5. **min_pow_difficulty**: PoW難易度の最小値（cagliostrで使用）
6. **fees**: 料金情報（nostr.compile-error.net, cagliostrで使用）
7. **banner**: バナー画像URL（nostr.compile-error.netで使用）
