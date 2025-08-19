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