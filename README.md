# NoteAPI

A small, typed HTTP service that gives a Custom GPT safe, full access to an Obsidian vault. Supports CRUD, folders, fast full‑text search (Meilisearch), section/outline reads, OpenAPI, and simple API‑key auth. Intended for private use on small to medium sized note vaults (see limitations).

## What do I need
- A little bit of technical knowledge (how to start up a Docker Compose container.)
- An Obsidian or other markdown note's vault that you've synced to server / vps (using syncthing for example).
- A ChatGPT subscription that allows you to create custom GPTs and connect them to action (ChatGPT Plus and higher will work as of now).
- A (sub)domain, either your own domain or a DDNS service (e.g. No-IP, DuckDNS, Dynu or FreeDNS)
- A SSL Proxy (Nginx proxy manager or Cloudflare if you have your own domain)
- Follow the instructions below in the Running section for next steps

## Features
- CRUD on Markdown notes with YAML frontmatter
- Move/rename and folder operations
- OpenAPI 3.1 standard for ChatGPT Actions (/openapi.json)
- Simple API key auth via `Authorization: Bearer <key>` (set using .env)
- Indexing watcher to keep search fresh (for Meilis)
- Safe writes enforced by strong ETags and `If-Match`
- (limited support for) Graph helpers (backlinks, neighbors, aliases)
  
API Commands:
- List folders recursively
- List notes recursively
- CRUD for notes
- Get batch of notes
- Export notes recursively in a directory
- Full‑text search (using Meilisearch)
- Section/outline reads to keep LLM context small (Line range reads via `?range=start-end`)

## Roadmap / Todos
- Code cleanup
- Improved rich text support 
- Chunked API responses limited to 100KB
- Configurable api limits
- Improved SSL Support (for now SSL support is realized using a proxy or CDN, e.g. Nginx Proxy Manager or Cloudflare), I aim to install my own solution.

## Requirements
- Recommended Unix environment (will run on windows too though through Docker)
- Node.js ≥ 20
- Docker & Docker Compose (for Meilisearch)
- An existing Syncthing share mounted locally as your vault root

## Custom ChatGPT Instructions
This API works best when used with a custom GPT.
I'd suggest adding these instructions to your GPT (next to anything you add yourself).
```
Dynamic notes are accessed through the NoteAPI, it is connected to a vault of markdown notes.
If you are asked a question on content that is not mentioned in the static data, always consult the noteapi.
Always prefer live noteapi vault data over static knowledge. 

When Search results show multiple related notes, request batches of notes instead of single documents. 
Before creating a new note without a specific directory, consider the directory structure that exists, place notes in logical places.
Before editing a note a second time, always first fetch the latest version, modify and submit that (as ETAG mismatches could occur otherwise).

If an API call fails / errors, follow instructions listed below:

404 (note missing): offer to create from template.
409 (etag mismatch): re-fetch the related note, if there is no diff then reupload, otherwise ask how to proceed.
500: retry once; if fails, report clearly without guessing.
```
(I have not optimized these notes, but they work for me)


## Limitations
- ChatGPT's API "Actions" currently will only accept API responses around 100kb, so very large single notes (/note) or large directory structures (/folders) could be an issue ( Note vaults with over ~1000 folders will likely exceed the limit, ideally avoid more than 5 layers directory of recursion)
- ChatGPT will try hard to minimize the amount of API requests, so it will on occassion ignore instructions and not refetch notes generating ETAG conflicts as a result. In this case it will often suggest to refetch the note itself though.
- ChatGPT has instructions to shy away from anything that looks like bulk tasks, in order to get it to do bulk work use agent mode.
- There is technically a limit of 300 requests per minute on the default the (nodejs) fastify package. ChatGPT won't reach this. (for your own scripts monitor the ratelimit-remaining header)

## Running

For tight IT security:
Set optional `FILE_UID`/`FILE_GID` in your environment to chown new files and directories. `FILE_UMASK` controls the process umask (octal, default `000` for `666`/`777` modes). When using Docker Compose, you can also run the service as that user via `user: "${FILE_UID}:${FILE_GID}"`.  If this is gibberish to you, feel free to ignore it.


### Method 1: Docker Compose (Easiest and recommended)
1. Copy `.env.example` to `.env` and set any required values (e.g. `NOTEAPI_KEY`). The default `MEILI_HOST` within docker is `http://meili:7700`. For MEILI_MASTER_KEY just either enter a 16+ character long text string or leave it as is, it will generate a key for you upon first boot. For BASE_URL, enter your (sub)domain url here. 
2. Copy `docker-compose.yml.example` to `docker-compose.yml`.
3. Start the stack:
   ```sh
   docker compose up -d
   ```
4. Configure your (nginx) proxy, setup SSL ('Let's Encrypt' will do) and point it to port 3000 locally.
   The bundled `docker-compose.yml.example` starts Meilisearch with `--max-indexing-memory 1GiB` to cap indexing RAM usage.

### Method 2: Local CLI
1. Copy `.env.example` to `.env` and set `MEILI_HOST=http://127.0.0.1:7700`.  For MEILI_MASTER_KEY just either enter a 16+ character long text string or leave it as is, it will generate a key for you upon first boot. For BASE_URL, enter your (sub)domain url here. 
2. Start Meilisearch:
   ```sh
   curl -L https://github.com/meilisearch/meilisearch/releases/download/v1.18.0/meilisearch-linux-amd64 -o meilisearch
   chmod +x meilisearch
   ./meilisearch --master-key masterKey --no-analytics --max-indexing-memory 1GiB &
   ```
3. Install dependencies and run the server:
   ```sh
   npm ci
   npm run dev
   ```
4. Configure your (nginx) proxy, setup SSL ('Let's Encrypt' will do) and point it to port 3000 locally.
