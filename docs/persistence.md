# Data Persistence and Operation Guide

[日本語 (Japanese)](persistence_ja.md)

`proxy-nostr-relay` saves all settings, safelists, logs, and statistics in a SQLite database.
For stable operation, it is important to understand the data storage location and backup methods.

## Data Storage Location

By default, a `data/` folder is created in the directory where the binary is executed, and the database file is saved inside.

```text
.
├── proxy-nostr-relay (Binary)
└── data/
    └── app.sqlite     <-- This is the most important file
```

### Changing the Database File Location
You can change the storage location by specifying the `DATABASE_URL` environment variable.

```bash
export DATABASE_URL="sqlite:/path/to/your/custom/location/relay.sqlite"
```

## Backup Procedures

Since SQLite is a single file, backup is very easy. However, simply copying the file while the application is running may result in a corrupted file depending on the timing of writes.

### 1. Safe Backup (Recommended)
Use SQLite's `VACUUM INTO` feature or temporarily stop the application before copying.

**Manual Backup Example:**
```bash
# Stop the application
# Copy the file
cp data/app.sqlite data/app.sqlite.bak.$(date +%Y%m%d)
# Restart the application
```

### 2. Automating Regular Backups
It is highly recommended to use cron or similar tools to regularly synchronize the entire `data/` directory to another storage or cloud.

## Server Migration (Moving)

To migrate the relay to another server, follow these steps:

1.  Run `cargo install proxy-nostr-relay` on the new server.
2.  Obtain `data/app.sqlite` from the old server.
3.  Create the `data/` directory in the appropriate location on the new server and place the file.
4.  Set environment variables and start the server.

## Troubleshooting

### If the Database is Corrupted
If a database error occurs at startup, try the following steps:

1.  Take a backup of `data/app.sqlite`.
2.  Delete the file and start the server to see if a new database is created.
3.  Attempt to restore from the backup.

> **Note**: Deleting the `data/` directory will result in the loss of all relay information, safelists, and accumulated statistics configured in the admin UI.
