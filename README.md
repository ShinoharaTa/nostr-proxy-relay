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

## Detailed Documentation

- [Configuration & Operation (systemd/Nginx)](docs/configuration.md)
- [Data Persistence & Backup](docs/persistence.md)
- [Filter Query Language (DSL) Specification](docs/filter-query.md)
- [API Reference](docs/api.md)
- [Developer Guide](docs/development.md)

## License
MIT OR Apache-2.0
