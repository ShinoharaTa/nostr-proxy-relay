# API Reference

[日本語 (Japanese)](api_ja.md)

Full list of HTTP endpoints exposed by this relay.

| Group | Prefix | Auth | Purpose |
|---|---|---|---|
| Public | `/api/public/*` | **none** | Read-only, used by the LP and external monitors |
| Admin  | `/api/*`        | Basic   | Everything the admin console (`/console`) calls |
| Compat | `/config/*`     | none    | 301 permanent redirect to `/console/*` |

## Authentication

The admin API uses HTTP Basic Auth with the credentials defined as `ADMIN_USER` / `ADMIN_PASS` in `.env`.

```text
Authorization: Basic <base64(ADMIN_USER:ADMIN_PASS)>
```

Repeated failures throttle by IP (default: 10 failures within 5 min → 15 min lockout, configurable via `AUTH_*` env vars; current settings visible at `GET /api/system/info`).

---

## Public API (no auth)

### `GET /api/public/status`

Aggregated status used by the LP. 1-second cache. **Never includes npubs or IPs.**

```jsonc
{
  "status": "operational",                 // operational | degraded | down
  "uptime_sec": 131,
  "connections_active": 9,
  "events": {
    "posted_1h":    [/* 60 buckets, last hour at 1-min resolution */],
    "delivered_1h": [/* 60 */],
    "rejected_1h":  [/* 60 */]
  },
  "backends": [
    { "url": "wss://yabu.me", "status": "connected", "connected_since": "..." }
  ],
  "incidents": [
    { "ts": "2026-05-06 09:29:18", "event_type": "connected", "summary": "yabu.me " }
  ],
  "generated_at": "..."
}
```

---

## Admin API (Basic Auth required)

### Backend Relays

- `GET    /api/relay`         List backend relays (`url`, `enabled`, `role`, `weight`, `read_enabled`, `write_enabled`)
- `PUT    /api/relay`         Bulk update (`{ relays: [...] }`)
- `GET    /api/relay-status`  Live state of every relay (connected / last error / connected_since)
- `GET    /api/relay-nip11?url=...`  Probe NIP-11 of a remote URL
- `GET    /api/relay-info`    Own NIP-11
- `PUT    /api/relay-info`    Update own NIP-11

### Access Control

- `GET    /api/post-policy`               POST policy (`allowlist` / `denylist`), backend strategy and write routing
- `PUT    /api/post-policy`               Update (**front-end shows confirmation modal on change**). `write_routing`: `all` / `primary_default` (spec §5.15)
- `GET    /api/safelist`                  npub list
- `POST   /api/safelist`                  Upsert (`{ npub, flags, memo }`)
- `DELETE /api/safelist/:npub`
- `PUT    /api/safelist/:npub/ban`
- `PUT    /api/safelist/:npub/unban`
- `GET    /api/ip-access-control`         IP/CIDR ACL list (mode: `hard_ban` / `shadow_ban` / `whitelist` / `normal`)
- `POST   /api/ip-access-control`         Add
- `PUT    /api/ip-access-control/:id`
- `DELETE /api/ip-access-control/:id`
- `GET    /api/quarantine`                Currently quarantined npubs
- `POST   /api/quarantine`                Add (`{ npub, scope?, reason?, duration_secs? }`)
- `DELETE /api/quarantine/:id`            Release

### Filtering

- `GET    /api/req-kind-blacklist`        REQ kind blocklist
- `POST   /api/req-kind-blacklist`        Add (`kind_value` single OR `kind_min`–`kind_max` range)
- `PUT    /api/req-kind-blacklist/:id`
- `DELETE /api/req-kind-blacklist/:id`
- `GET    /api/filters`                   DSL rules
- `POST   /api/filters`                   Create (`{ name, nl_text, apply_to_post?, apply_to_backend? }`)
- `PUT    /api/filters/:id`               Update
- `DELETE /api/filters/:id`               Delete
- `POST   /api/filters/validate`          DSL syntax check (`{ query }` → `{ ok, error? }`)
- `GET    /api/simple-ban-rules`          Quick BAN rules
- `POST   /api/simple-ban-rules`          Create
- `PUT    /api/simple-ban-rules/:id`
- `DELETE /api/simple-ban-rules/:id`
- `POST   /api/translate/simple-to-dsl`   Quick BAN → DSL preview
- `POST   /api/translate/dsl-to-simple`   DSL → Quick BAN (when reversible)
- `POST   /api/translate/dry-run`         Apply DSL to one event and report the verdict
- `GET    /api/auto-guard`                Auto guard settings + active content mutes (spec §5.14)
- `PUT    /api/auto-guard`                Update auto guard settings (`{ enabled, burst_window_secs, burst_max_events, exclude_kinds, duplicate_threshold, duplicate_window_secs, quarantine_secs }`)
- `DELETE /api/auto-guard/content-mutes`  Clear all content mutes (emergency release for false positives)
- `GET    /api/stats/actors?by=ip|npub&window=1h|24h|7d|all&sort=...&limit=`  Actor aggregation (sorted desc + moderation status join, ui_redesign §14.2)
- `GET    /api/actors/:type/:id`          Actor inspector detail (type: `ip` / `npub`)
- `POST   /api/investigate`               Investigate events (queries upstream relays, analyses patterns; **stores nothing**, spec §5.16)

### Operations

- `GET    /api/stats`                     Live stats (active conns, rejection counts, top reasons)
- `GET    /api/stats/timeseries?period=1h|24h|7d`  Bucketed time series
- `GET    /api/connection-logs`           Connection history (`?limit&offset&ip_address&from&to`)
- `GET    /api/event-rejection-logs`      Filter rejection history (`?limit&offset&npub&kind&reason&from&to`)
- `GET    /api/relay-event-logs`          Backend-relay event history (`?limit&relay_url&event_type&from&to`)
- `GET    /api/app-version`               `{ "version": "0.3.1" }`
- `GET    /api/system/info`               version / uptime / auth_throttle / retention / disk / env_overrides
- `GET    /api/telemetry/status`          InfluxDB configuration status (token shows last 4 chars only)
- `POST   /api/telemetry/test`            Send one test write to InfluxDB and return success/failure

### Live Stream

- `GET    /api/events/stream`             SSE consumed by the Live Events tab
  - `Content-Type: text/event-stream`, `Transfer-Encoding: chunked`
  - Event kinds: `accepted` / `delivered` / `rejected` / `dropped` / `connection`

---

## Error Model

- `4xx` / `5xx` responses carry a free-form human-readable body.
- The frontend wraps them as `ApiError(status, body)` and turns them into toasts (`web/src/console/api/client.ts`).

---

## Compat: legacy `/config/*`

All legacy admin UI paths return a 301 permanent redirect, preserving the query string.

```text
GET /config                       → 301 Location: /console
GET /config/                      → 301 Location: /console
GET /config/dashboard             → 301 Location: /console/dashboard
GET /config/access/post-policy?x  → 301 Location: /console/access/post-policy?x
```

Implemented in `src/main.rs` as `legacy_config_root` / `legacy_config_rest`.

---

## Examples (curl)

```bash
# LP status (no auth)
curl http://localhost:8080/api/public/status

# Live stats
curl -u admin:pass http://localhost:8080/api/stats

# Quarantine an npub for 10 minutes
curl -u admin:pass -H 'Content-Type: application/json' \
  -d '{"npub":"npub1...","duration_secs":600}' \
  http://localhost:8080/api/quarantine

# Dry-run a DSL rule
curl -u admin:pass -H 'Content-Type: application/json' \
  -d '{"dsl":"kind == 1 AND content =~ /spam/i","event":{"kind":1,"content":"spam"}}' \
  http://localhost:8080/api/translate/dry-run

# InfluxDB test write
curl -u admin:pass -X POST http://localhost:8080/api/telemetry/test
```
