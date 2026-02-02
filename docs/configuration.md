# Configuration Reference

[日本語 (Japanese)](configuration_ja.md)

`proxy-nostr-relay` can be customized using environment variables.

## Environment Variables List

Settings are performed using the `export` command.

| Variable Name | Description | Required | Default Value |
| :--- | :--- | :--- | :--- |
| `ADMIN_USER` | Login username for the admin UI (/config) | ✅ | - |
| `ADMIN_PASS` | Login password for the admin UI (/config) | ✅ | - |
| `DATABASE_URL` | Path to the SQLite database | ❌ | `sqlite:data/app.sqlite` |
| `RELAY_URL` | URL of your relay displayed on the landing page | ❌ | `wss://your-relay.example.com` |
| `GITHUB_URL` | Source code URL displayed on the landing page | ❌ | Project repository URL |
| `RUST_LOG` | Log output level (`debug`, `info`, `warn`, `error`) | ❌ | `info` |

## Operation Examples

### 1. Execution in Shell
```bash
export ADMIN_USER=admin
export ADMIN_PASS=your-secure-password
proxy-nostr-relay
```

### 2. Auto-start with systemd (Linux)
To automatically start the relay upon server reboot, use systemd.

Example of creating `/etc/systemd/system/proxy-nostr-relay.service`:

```ini
[Unit]
Description=Proxy Nostr Relay
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/nostr-relay
# Environment Variable Settings
Environment="ADMIN_USER=admin"
Environment="ADMIN_PASS=your-secure-password"
Environment="DATABASE_URL=sqlite:/home/your-user/nostr-relay/data/app.sqlite"
Environment="RUST_LOG=info"
# Execution Command
ExecStart=/home/your-user/.cargo/bin/proxy-nostr-relay
Restart=always

[Install]
WantedBy=multi-user.target
```

**Enabling the Service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable proxy-nostr-relay
sudo systemctl start proxy-nostr-relay
```

## Reverse Proxy Configuration (SSL/WSS)

To connect from a Nostr client, SSL (wss://) is usually required. It is recommended to place Nginx or similar as a front-end.

**Nginx Configuration Example:**
```nginx
server {
    server_name your-relay.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
