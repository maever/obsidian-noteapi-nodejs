# NoteAPI


A small, typed HTTP service that gives a Custom GPT safe, full access to an Obsidian vault (Syncthing-backed). Supports CRUD, folders, fast full‑text search (Meilisearch), section/outline reads, OpenAPI, and simple API‑key auth. Designed to run behind Nginx Proxy Manager on Unraid.


## Features (MVP)
- CRUD on Markdown notes with YAML frontmatter
- Move/rename and folder ops
- List folders recursively
- List notes recursively
- Export notes recursively
- Full‑text search with highlighted snippets (Meilisearch)
- Section/outline reads to keep LLM context small
- Line range reads via `?range=start-end`
- OpenAPI 3.1 for ChatGPT Actions
- Simple API key auth via `Authorization: Bearer <key>`
- Works behind Nginx Proxy Manager (NPM)
- Safe writes enforced by strong ETags and `If-Match`
- Graph helpers (backlinks, neighbors, aliases)
- Templates with variables and roll tables
- Indexing watcher to keep search fresh


## Roadmap
- Richer templating features
- Additional roll-table utilities


## Requirements
- Node.js ≥ 20
- Docker & Docker Compose (for Meilisearch)
- An existing Syncthing share mounted locally as your vault root

## Limitations
- ChatGPT's Actions integration is optimized for very light API use; requests that span more than about three files may exceed its current capabilities. This constraint stems from ChatGPT rather than the API itself.

## Running

Set optional `FILE_UID`/`FILE_GID` in your environment to chown new files and
directories. `FILE_UMASK` controls the process umask (octal, default `000` for
`666`/`777` modes). When using Docker Compose, you can also run the service as
that user via `user: "${FILE_UID}:${FILE_GID}"`.

### Method 1: Docker Compose
1. Copy `.env.example` to `.env` and set any required values (e.g. `NOTEAPI_KEY`). The default `MEILI_HOST` is `http://meili:7700`.
2. Copy `docker-compose.yml.example` to `docker-compose.yml`.
3. Start the stack:
   ```sh
   docker compose up -d
   ```

### Method 2: Local CLI
1. Copy `.env.example` to `.env` and set `MEILI_HOST=http://127.0.0.1:7700`.
2. Start Meilisearch:
   ```sh
   curl -L https://github.com/meilisearch/meilisearch/releases/download/v1.18.0/meilisearch-linux-amd64 -o meilisearch
   chmod +x meilisearch
   ./meilisearch --master-key masterKey --no-analytics &
   ```
3. Install dependencies and run the server:
   ```sh
   npm ci
   npm run dev
   ```
