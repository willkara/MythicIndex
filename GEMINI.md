# MemoryQuill / MythicIndex Context

## Project Overview
**MemoryQuill** (active development in `mythic-index/`) is a full-stack web application designed for managing and exploring mythological narratives and character relationships. It is built on a serverless architecture using **Cloudflare Pages**, **D1 (SQLite)**, **Cloudflare Images**, and **SvelteKit**.

The project also includes a custom **Model Context Protocol (MCP) Server** to integrate AI tools and a robust suite of **Python/PowerShell scripts** for content ingestion, validation, and image management.

## Project Structure (`mythic-index/`)

All active development occurs within the `mythic-index/` directory.

| Directory | Type | Description |
|-----------|------|-------------|
| **`frontend/`** | Web App | **SvelteKit** application deployed to Cloudflare Pages. Handles UI and API (via Pages Functions/Actions). Uses **Drizzle ORM** for database interaction. |
| **`mcp-server/`** | Service | **TypeScript** MCP server. exposes tools for AI integration (using Anthropic/Google/OpenAI SDKs). |
| **`tools/`** | Utilities | **Python** & **PowerShell** scripts for content ingestion, image synchronization, slug validation, and database seeding. |
| **`MemoryQuill/`** | Data | The "Source of Truth" for story content, character definitions, and image metadata (YAML/JSON format). |
| **`narratology/`** | Docs | Documentation regarding narrative structure and ontology. |

## Development Workflows

### Frontend (`mythic-index/frontend`)

*   **Stack:** SvelteKit, Tailwind CSS, Lucide Svelte, Drizzle ORM.
*   **Database:** Cloudflare D1 (SQLite).
*   **Run Local Dev:**
    ```bash
    npm run dev
    # Runs: wrangler pages dev --d1=DB -- vite dev
    ```
*   **Build:**
    ```bash
    npm run build
    ```
*   **Database Management (Drizzle):**
    *   Schema: `src/lib/server/db/schema.ts`
    *   Config: `drizzle.config.ts`
    *   Migrations: Located in `drizzle/`

### MCP Server (`mythic-index/mcp-server`)

*   **Stack:** Node.js, TypeScript, `@modelcontextprotocol/sdk`.
*   **Run Local:**
    ```bash
    npm install
    npm run dev # tsc --watch
    # OR
    npm run start
    ```

### Tools & Scripts (`mythic-index/tools`)

*   **Primary Language:** Python (and some PowerShell/Node.js).
*   **Key Scripts:**
    *   `ingestion/ingest.py`: Likely for importing content from `MemoryQuill/` to the database.
    *   `upload_cloudflare_images.mjs`: Node.js script for image uploads.
    *   `check_*.py` / `fix_*.py`: Various validation and repair scripts for data integrity (slugs, images, references).

## Conventions & Architecture

*   **Source of Truth:** The content in `MemoryQuill/` (YAML files) is the primary source. The `tools/` scripts are used to sync this state to the D1 database.
*   **Serverless First:** The architecture relies heavily on Cloudflare's specific ecosystem (Pages for hosting, D1 for data, KV likely for caching/sessions, Images for media).
*   **Legacy Code:** `frontend/` and `backend-worker/` in the *root* (if present) or outside of `mythic-index/` are archives and should be ignored.
*   **Database Access:** Direct DB access in the frontend is managed via Drizzle ORM, configured to talk to the local D1 emulator during `npm run dev` via Wrangler.
