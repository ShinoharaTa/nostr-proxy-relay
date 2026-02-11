# Proxy Nostr Relay

A proxy relay server for the Nostr protocol.
Eliminates bots and unwanted posts using advanced filtering logic and a DSL (Domain Specific Language).

[日本語 (Japanese)](README_ja.md)

## Quick Start

### 1. Install
Run the following command in an environment with Rust installed.

```bash
cargo install proxy-nostr-relay
```

### 2. Launch
Set the username and password for the admin UI and start the server.

```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-password
proxy-nostr-relay
```

The server will start at `ws://localhost:8080`.

### 3. Admin UI
Open the following URL in your browser and log in with the ID/password you set.
`http://localhost:8080/config`

Here you can configure the backend relay to connect to.

---

## Data Persistence (Important)

All settings and logs are saved in the `data/` directory created in the execution directory.
**By backing up or migrating this directory, you can continue your operations.**

For more details, please refer to the [Persistence Guide](docs/persistence.md).

## Key Features

- **Advanced Bot Filtering**: Automatically detects duplicate posts of Kind 6/7.
- **Filter Query Language (DSL)**: Create custom rules in a format like `kind == 1 AND content matches ".*NG.*"`.
- **Web Admin UI**: Real-time statistics confirmation and configuration changes from the browser.
- **Access Control**: IP-based BAN and npub-based safelist management.
- **WebSocket Keep-Alive & Auto-Reconnect**: Ping/Pong based connection health monitoring with automatic backend relay reconnection and subscription recovery.

## WebSocket Connection Stability

The proxy includes built-in mechanisms for WebSocket connection stability based on [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) Ping/Pong control frames.

### Client-side Keep-Alive
- The proxy sends a WebSocket `Ping` to each connected client every **30 seconds**.
- If no message (including `Pong` responses) is received from a client within **120 seconds**, the connection is considered dead and is closed.
- This ensures stale sessions are cleaned up and `connection_logs.disconnected_at` is updated reliably.

### Backend Relay Keep-Alive
- The proxy sends a WebSocket `Ping` to the backend relay every **30 seconds**.
- If no message is received from the backend relay within **90 seconds**, the connection is considered timed out.
- On backend disconnect or timeout, the proxy automatically reconnects after a short delay.

### Subscription Recovery (REQ Re-send)
- The proxy caches all active `REQ` subscriptions (keyed by `subscription_id`) per [NIP-01](https://nips.nostr.com/1).
- When a client sends `CLOSE`, the corresponding subscription is removed from the cache.
- After a successful backend reconnection, all cached `REQ` messages are automatically re-sent to restore subscriptions.
- This prevents timeline updates from stopping after a backend relay interruption.

### Relay Pool Heartbeat
- Persistent relay connections in the relay pool also send periodic `Ping` frames and monitor responses.
- Timeout detection feeds into the existing auto-reconnect loop with exponential backoff.

## Detailed Documentation

- [Configuration & Operation (systemd/Nginx)](docs/configuration.md)
- [Data Persistence & Backup](docs/persistence.md)
- [Filter Query Language (DSL) Specification](docs/filter-query.md)
- [API Reference](docs/api.md)
- [Developer Guide](docs/development.md)

## License
MIT OR Apache-2.0
