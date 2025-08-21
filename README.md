# NoteAPI


A small, typed HTTP service that gives a Custom GPT safe, full access to an Obsidian vault (Syncthing-backed). Supports CRUD, folders, fast full‑text search (Meilisearch), section/outline reads, OpenAPI, and simple API‑key auth. Designed to run behind Nginx Proxy Manager on Unraid.


## Features (MVP)
- CRUD on Markdown notes with YAML frontmatter
- Move/rename and folder ops
- List folders recursively
- Export notes recursively
- Full‑text search with highlighted snippets (Meilisearch)
- Section/outline reads to keep LLM context small
- Line range reads via `?range=start-end`
- OpenAPI 3.1 for ChatGPT Actions
- Simple API key auth via `Authorization: Bearer <key>`
- Works behind Nginx Proxy Manager (NPM)


## Roadmap (stubs in code)
- Graph helpers (backlinks, neighbors, aliases)
- Templates with variables
- Safe writes using strong ETags and `If-Match`
- Roll tables (markdown tables or fenced blocks)
- Indexing watcher to keep search fresh


## Requirements
- Node.js ≥ 20
- Docker & Docker Compose (for Meilisearch)
- An existing Syncthing share mounted locally as your vault root

