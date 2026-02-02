# API Reference

[日本語 (Japanese)](api_ja.md)

All administrative API endpoints require **Basic Authentication**.

## Authentication
Include the following in the HTTP header:
`Authorization: Basic <base64(ADMIN_USER:ADMIN_PASS)>`

---

## Endpoints List

### Relay Configuration
- `GET /api/relay`: Get current backend relay settings
- `PUT /api/relay`: Update backend relay (connection target)

### Safelist Management
- `GET /api/safelist`: List of registered npubs
- `POST /api/safelist`: Add or update an npub
- `DELETE /api/safelist/:npub`: Remove an npub
- `PUT /api/safelist/:npub/ban`: BAN a specific npub
- `PUT /api/safelist/:npub/unban`: Unban an npub

### Filter Rule Management (DSL)
- `GET /api/filters`: List of filter rules
- `POST /api/filters`: Create a rule
- `PUT /api/filters/:id`: Update a rule
- `DELETE /api/filters/:id`: Delete a rule
- `POST /api/filters/validate`: Syntax check for DSL queries

### IP Access Control
- `GET /api/ip-access-control`: Get IP list
- `POST /api/ip-access-control`: BAN or allow IP settings
- `DELETE /api/ip-access-control/:id`: Delete setting

### Statistics & Logs
- `GET /api/stats`: Statistical information such as connection count and rejection reasons
- `GET /api/connection-logs`: Connection history
- `GET /api/event-rejection-logs`: History of rejections due to filtering

---

## Usage Examples (curl)

### Adding to Safelist
```bash
curl -X POST \
  -H "Authorization: Basic $(echo -n 'admin:pass' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"npub": "npub1...", "flags": 1, "memo": "My Account"}' \
  http://localhost:8080/api/safelist
```

### Getting Statistics
```bash
curl -H "Authorization: Basic $(echo -n 'admin:pass' | base64)" \
  http://localhost:8080/api/stats
```
