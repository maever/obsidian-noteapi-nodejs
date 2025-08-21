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

## Quick Start
1. Rename `docker-compose.yml.example` to `docker-compose.yml`.
2. Run `docker compose up -d` to launch the stack.

