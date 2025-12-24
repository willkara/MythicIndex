# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoryQuill / MythicIndex is a web application for managing mythological narratives and character relationships. The active codebase lives entirely in `mythic-index/` - do not modify legacy directories at the root level.

## Commands

### Frontend Development
```bash
cd mythic-index/frontend
npm install
npm run dev          # Dev server with local D1 (via wrangler pages dev)
npm run dev:vite     # Vite-only dev server (no D1)
npm run build        # Production build
npm run check        # TypeScript and Svelte checks
```

### MCP Server
```bash
cd mythic-index/mcp-server
npm install
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run inspector    # Test with MCP Inspector
```

### Content Ingestion (Python)
```bash
cd mythic-index/tools/ingestion
./bin/ingest.sh init-db --force              # Initialize database
./bin/ingest.sh reingest-data --no-imagery --force  # Full content re-ingestion
python validate.py                            # Run 41 automated validation tests
```

### Database Setup (First Time)
```bash
cd mythic-index/frontend
npx wrangler d1 execute memoryquill-dev --local --file=drizzle/0000_ambitious_sleeper.sql
npx wrangler d1 execute memoryquill-dev --local --file=seed.sql
```

## Architecture

### Tech Stack
- **Frontend**: SvelteKit 5 (Runes) + TypeScript + TailwindCSS + Drizzle ORM
- **Database**: Cloudflare D1 (SQLite)
- **Hosting**: Cloudflare Pages (frontend) + Workers (API) + Images (CDN)
- **Ingestion**: Python pipeline for markdown-to-database conversion

### Directory Structure
```
mythic-index/
├── frontend/           # SvelteKit app (main development area)
│   ├── src/lib/server/db/schema.ts  # Drizzle ORM schema
│   ├── src/lib/components/          # Reusable UI components
│   ├── src/routes/                  # SvelteKit file-based routing
│   └── wrangler.toml               # Cloudflare Pages config
├── mcp-server/         # Model Context Protocol server for AI integration
├── tools/ingestion/    # Python content ingestion pipeline
└── MemoryQuill/story-content/  # Source markdown content
    ├── chapters/       # Chapter content.md files
    ├── characters/     # Character profile.md files
    └── locations/      # Location overview.md files
```

### Data Model

Content flows: **Markdown files** -> **Python ingestion** -> **D1 database** -> **SvelteKit frontend**

Key tables (Drizzle schema):
- `content_item`: Base entity for chapters, characters, locations (kind field differentiates)
- `content_revision` -> `content_section` -> `content_block`: Hierarchical content structure
- `scene`: Scene-level metadata linked to content
- `lore_entity` / `entity_link`: Character and location entities with relationships
- `image_asset` / `image_link`: Cloudflare Images integration

### Routes
- `/canon` - Content browser (characters, locations, chapters)
- `/chapters/[slug]`, `/characters/[slug]`, `/locations/[slug]` - Content readers
- `/admin/upload` - Markdown ingestion UI
- `/search` - Search functionality

## Key Patterns

### SvelteKit Server Functions
Server-side data loading in `+page.server.ts` files uses Drizzle ORM with the D1 binding:
```typescript
export const load: PageServerLoad = async ({ platform }) => {
    const db = drizzle(platform?.env?.DB);
    // Query using Drizzle...
};
```

### Image Handling
Images are stored in Cloudflare Images. The `ResponsiveImage.svelte` component handles variant selection and lazy loading. Image URLs follow the pattern:
```
https://imagedelivery.net/{account_hash}/{image_id}/{variant}
```

### Content Blocks
The frontend renders different block types (prose, dialogue, scene headers) via components in `src/lib/components/blocks/`.

## CI/CD

GitHub Actions runs on push/PR to main/master:
- `npm run check` - Type checking
- `npm run build` - Build verification

Deployment workflows exist for Cloudflare (see `.github/workflows/deploy-cloudflare*.yml`).

## Environment Variables

Copy `.env.example` to `.env`. Required for Cloudflare Images:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCOUNT_HASH`
- `CLOUDFLARE_API_TOKEN`

## Notes

- There's a merge conflict in `schema.ts` (displayStyle field) that should be resolved
- The MCP server (`memoryquill`) is pre-configured in `.mcp.json` for Claude Code integration
- Python ingestion requires a virtual environment with dependencies from `tools/ingestion/requirements.txt`
