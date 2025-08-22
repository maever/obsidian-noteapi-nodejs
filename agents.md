# Agents Brief — NoteAPI (for ChatGPT/Codex)

You are an assistant developer. Your job is to implement endpoints and utilities for NoteAPI.


## Goals
- Implement a safe, robust Fastify + TypeScript HTTP API for an Obsidian vault mounted at `VAULT_ROOT`.
- Preserve YAML frontmatter and Markdown content round‑trip.
- Provide fast search via Meilisearch with highlighted snippets.
- Keep responses minimal and streaming‑friendly.


## Non‑Goals (for now)
- OAuth, multi‑user tenancy, binary attachments.


## Architectural rules
- Use TypeScript strict mode.
- All file access is **within** `VAULT_ROOT`; reject path traversal.
- Strong ETags based on SHA‑256 of the exact on‑disk file content.
- `PUT /notes/{path}` requires `If-Match`; return `412` on mismatch.
- Return `ETag` on successful `GET`/`PUT`.
- Always normalize and validate paths (use `utils/paths.ts`).
- Keep pure functions testable. No side effects in helpers.
- Copy docker-compose.yml.example to docker-compose.yml while testing (do not commit)
- Validate that interactions with Meilisearch follow best practices and remain compatible with the current server version.

## Test instructions

- Do not use docker for tests
- Use the latest stable Meilisearch release (currently 1.18.0) if possible https://github.com/meilisearch/meilisearch/releases/tag/v1.18.0
- Install Meilisearch before running tests:
  - `curl -L https://github.com/meilisearch/meilisearch/releases/download/v1.18.0/meilisearch-linux-amd64 -o meilisearch`
  - `chmod +x meilisearch`
  - `./meilisearch --master-key masterKey --no-analytics &`

## Tests
- Do not use Docker for tests 
- Run a curl GET heartbeat test on `/health` → should return `{"ok":true}`
- Run a curl GET test on `/openapi.json` → should return valid JSON that contains at least `/search` and `/notes`
- Run a curl GET on `/notes/<path>` without Authorization header → should return 401/403 (auth enforced)
- Run a curl POST on `/notes` with path/frontmatter/content → should create note, return 201 with etag
- Run a curl GET on `/notes/<path>` → should return frontmatter, content, toc[], etag
- Run a curl GET on `/notes/<path>?section=<heading>` → should only return the requested section
- Run a curl PATCH on `/notes/<path>` with If-Match header and updated content → should return 200 with new etag
- Run a curl DELETE on `/notes/<path>` with If-Match header → should return 204 and remove/move file
- Run a curl PATCH on `/notes/<path>` with an old or invalid If-Match → should return 412 Precondition Failed
- Run a curl POST on `/folders` with path → should create directory, return 201
- Run a curl GET on `/folders` → should list folders including newly created one
- Run a curl GET on `/search?q=banana` → should yield at least one hit with `<em>banana</em>` in snippet
- Run a curl GET on `/search?q=doesnotexist` → should return 200 with empty hits array
- Run a curl POST on `/admin/reindex` without Authorization → should return 401/403
- Run a curl POST on `/admin/reindex` with Authorization → should return counts > 0
- Run a curl GET on `/search?q=banana` after reindex → should still yield hits
- Attempt to create a note with `../escape.md` path → should return 400/403 (path traversal blocked)
- Attempt to create a note in nested dirs (`a/b/c/note.md`) without pre-creating folders → should succeed
- Create a large note (~1 MB) and run GET/SEARCH → should succeed within reasonable time
- Create a note with only frontmatter (empty body) → should read back with empty content safely


## Endpoints (MVP)
- `GET /health` → `{ ok: true }`
- `GET /notes/{path}?heading=...&range=START-END` → `{ frontmatter, content, outline }` + `ETag` header
- `POST /notes` → create `{ path, frontmatter?, content }`
- `PUT /notes/{path}` → update (requires `If-Match`)
- `DELETE /notes/{path}`
- `POST /notes/{path}/move` → `{ newPath }`
- `GET /folders` → tree listing
- `POST /folders` → create folder `{ path }`
- `GET /search?q=...&limit=...` → `{ hits: [{ path, title, snippet, score }] }`


## Search index document shape
```ts
interface Doc {
id: string; // stable hash of path
path: string; // posix path within vault
title: string;
aliases: string[];
tags: string[];
headings: string[]; // H1..H6 text
links: string[]; // wiki-link targets
body: string; // plain text only
updatedAt: number; // mtimeMs
}