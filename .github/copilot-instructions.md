# Copilot Instructions for NoteAPI

## Project Overview
- **NoteAPI** is a TypeScript Fastify HTTP API for safe, robust access to an Obsidian vault (Markdown notes with YAML frontmatter) via REST endpoints.
- The API supports CRUD, folder operations, full-text search (Meilisearch), and section/outline reads. It is designed for LLM/AI agent use and runs behind a reverse proxy (e.g., Nginx Proxy Manager).
- All file access is strictly within the `VAULT_ROOT` directory; path traversal is rejected.

## Key Components & Structure
- **src/**: Main source code (routes, server, config, utils)
  - `routes/`: Fastify route handlers for notes, folders, search, health, watcher
  - `utils/`: Helpers for ETags, path normalization, etc.
  - `search/meili.ts`: Meilisearch integration
  - `config.ts`: Loads environment/configuration
- **openapi/noteapi.yaml**: OpenAPI 3.1 spec for endpoints
- **test/**: Smoke tests
- **docker-compose.yml**: Runs Meilisearch and the API (mounts vault, sets env)

## Patterns & Conventions
- **Strict TypeScript**: All code uses strict mode; type safety is enforced.
- **Path Handling**: Use `utils/paths.ts` for all path normalization/validation. Never access files outside `VAULT_ROOT`.
- **ETags**: Strong ETags are SHA-256 hashes of file content. `PUT /notes/{path}` requires `If-Match` and returns 412 on mismatch.
- **Minimal, streaming-friendly responses**: Avoid large payloads; return only necessary data.
- **API Key Auth**: All endpoints require `Authorization: Bearer <key>` (see `config.ts`).
- **Search**: Uses Meilisearch, with document shape defined in `agents.md`.

## Developer Workflows
- **Build**: `npm run build` (outputs to `dist/`)
- **Dev**: `npm run dev` (uses `tsx` for live reload)
- **Test**: `npm test` (Node.js test runner)
- **Run with Docker Compose**: `docker-compose up` (starts Meilisearch and API)

## Integration Points
- **Meilisearch**: Runs as a service in Docker Compose; API connects via `MEILI_HOST`/`MEILI_MASTER_KEY`.
- **Obsidian Vault**: Mounted as `/vault` in the container; all note/folder operations are relative to this root.

## Examples & References
- See `agents.md` for endpoint specs, document shape, and architectural rules.
- See `openapi/noteapi.yaml` for endpoint details and parameters.
- See `src/routes/` for implementation patterns (e.g., ETag handling, path validation).

## Special Notes
- Do not implement OAuth, multi-user, or binary attachments (see "Non-Goals" in `agents.md`).
- Always validate and normalize paths before file access.
- Keep helpers pure and testable; avoid side effects outside route handlers.

---
For more, see `README.md` and `agents.md`.
