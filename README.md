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
# kinds to auto-close as one-shot after EOSE (comma-separated)
# Example: only kind 0 is treated as one-shot
export EOSE_AUTOCLOSE_KINDS=0
proxy-nostr-relay
```

The server will start at `ws://localhost:8080`.

### 3. Landing Page

Open `http://localhost:8080/` in your browser. The public landing page (`/`) shows live status — uptime, active connections, 1-hour event throughput, backend relays, and recent incidents — without authentication. It polls `GET /api/public/status` every 10 seconds.

### 4. Admin Console

Open `http://localhost:8080/console` and sign in with the ID / password you set above. The new admin console (theme **PROFILER**, Watch Dogs 1 ctOS) is fully responsive (PC / tablet / phone). It is organized into 5 navigation groups:

- **OVERVIEW** — Dashboard / Live Events (SSE) / Logs
- **BACKEND** — Backend Relays / NIP-11
- **ACCESS CONTROL** — POST Policy / Npub / IP ACL / Quarantine
- **FILTERING** — Kind Blocklist / DSL Rules / Quick BAN
- **OPERATIONS** — Telemetry / System

> The previous admin path `/config/*` is permanently redirected (`301 Moved Permanently`) to `/console/*`. Existing bookmarks keep working.

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
- When a relay sends `CLOSED`, the corresponding subscription is removed from the cache.
- For subscriptions whose filters contain only kinds configured in `EOSE_AUTOCLOSE_KINDS` (default: `0`), the proxy sends `CLOSE` to the backend relay right after forwarding `EOSE` and removes them from cache.
- After a successful backend reconnection, all cached `REQ` messages are automatically re-sent to restore subscriptions.
- This prevents timeline updates from stopping after a backend relay interruption.

### Relay Pool Heartbeat
- Persistent relay connections in the relay pool also send periodic `Ping` frames and monitor responses.
- Timeout detection feeds into the existing auto-reconnect loop with exponential backoff.

## Runtime Logs

- Logs are written to both stdout and files.
- File logs are rotated hourly in `logs/` by default.
- Files older than 72 hours (3 days) are automatically removed.
- You can change log output directory with `LOG_DIR`.

```bash
export LOG_DIR=logs
proxy-nostr-relay
```

## Detailed Documentation

- [Configuration & Operation (systemd/Nginx)](docs/configuration.md)
- [Data Persistence & Backup](docs/persistence.md)
- [Filter Query Language (DSL) Specification](docs/filter-query.md)
- [API Reference](docs/api.md) — public, admin, SSE and the legacy 301
- [UI Redesign Plan & PROFILER theme](docs/ui_redesign_ja.md) (Japanese)
- [Developer Guide](docs/development.md)

## License
MIT OR Apache-2.0
