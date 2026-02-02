# Developer Guide

[日本語 (Japanese)](development_ja.md)

This guide is for those who want to build this project from source or modify it.

## Requirements
- **Rust**: 1.75 or higher
- **Node.js**: 20 or higher (for frontend build)
- **SQLite**: 3.x

## Build Procedures

### 1. Full Build (Recommended)
Running `cargo build` will automatically build the frontend via `build.rs` and embed it into the binary.

```bash
cargo build --release
```

### 2. Frontend Only Build
```bash
cd web
npm ci
npm run build
```

## Development Mode

Start the frontend and backend separately to enable hot reloading.

### Terminal 1: Backend
```bash
export ADMIN_USER=admin
export ADMIN_PASS=admin
cargo run
```

### Terminal 2: Frontend
```bash
cd web
npm run dev
```
The development server will start at `http://localhost:3000`, and API requests will be automatically proxied to port 8080.

## Project Structure
- `src/`: Rust backend source
  - `api/`: HTTP API implementation
  - `proxy/`: WebSocket proxy logic
  - `filter/`: Filtering engine
  - `parser/`: DSL parser
- `web/`: React frontend source
- `migrations/`: Database migration files
- `docs/`: Documentation
