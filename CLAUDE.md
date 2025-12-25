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

### Vectorize Setup (Semantic Search)
```bash
cd mythic-index/frontend

# Create Vectorize index for embeddings (1024 dimensions for BGE-M3)
npx wrangler vectorize create mythicindex-content-embeddings \
  --dimensions=1024 \
  --metric=cosine

# Note the index ID from output, add to .env as CLOUDFLARE_VECTORIZE_INDEX_ID
# The index is already configured in wrangler.toml
```

### Chargen CLI (Content Writer & Ingestion)
```bash
cd mythic-index/chargen
npm install
npm run build
npm start  # Interactive menu for content ingestion, image generation, etc.
```

## Architecture

### Tech Stack
- **Frontend**: SvelteKit 5 (Runes) + TypeScript + TailwindCSS + Drizzle ORM
- **Database**: Cloudflare D1 (SQLite)
- **Vector Search**: Cloudflare Vectorize + Workers AI (BGE-M3 embeddings)
- **Hosting**: Cloudflare Pages (frontend) + Workers (API) + Images (CDN)
- **Ingestion**: Chargen CLI (TypeScript) for content + embeddings, Python pipeline (legacy)

### Directory Structure
```
mythic-index/
├── frontend/           # SvelteKit app (main development area)
│   ├── src/lib/server/db/schema.ts     # Drizzle ORM schema
│   ├── src/lib/server/ai/embedding.ts  # BGE-M3 embedding service
│   ├── src/lib/components/             # Reusable UI components
│   ├── src/routes/                     # SvelteKit file-based routing
│   └── wrangler.toml                   # Cloudflare bindings (D1, Vectorize, AI)
├── chargen/            # TypeScript CLI for content ingestion + embeddings
│   ├── src/ingestion/services/vectorize.ts  # Vectorize REST API client
│   ├── src/ingestion/services/workers-ai.ts # Workers AI embedding generation
│   └── src/menus/ingestion/            # Interactive ingestion menus
├── tools/ingestion/    # Legacy Python content ingestion pipeline
└── MemoryQuill/story-content/  # Source markdown content
    ├── chapters/       # Chapter content.md files
    ├── characters/     # Character profile.md files
    └── locations/      # Location overview.md files
```

### Data Model

**Content Flow:**
```
Markdown files → Chargen CLI → D1 database → SvelteKit frontend
                      ↓
                Workers AI (BGE-M3) → Vectorize index → Semantic search
```

**Entity-Level Embedding Strategy:**
- **Chapters**: Entire chapter (~3,700 words) embedded as single 1024-dim vector
- **Characters**: Full profile embedded as single vector
- **Locations**: Complete overview embedded as single vector
- **BGE-M3 capacity**: 8,192 tokens (~32K chars) supports entity-level chunking

**Key D1 Tables (Drizzle schema):**
- `content_item`: Base entity for chapters, characters, locations (kind field differentiates)
- `content_revision` → `content_section` → `content_block`: Hierarchical content structure
- `scene`: Scene-level metadata linked to content
- `character` / `location`: Dedicated entity tables with typed fields
- `character_relationship` / `scene_character` / `scene_zone`: Rich relationship tracking
- `image_asset` / `image_link`: Cloudflare Images integration

**Vectorize Index:**
- Index name: `mythicindex-content-embeddings`
- Dimensions: 1024 (BGE-M3 output)
- Metric: Cosine similarity
- Metadata: `{ kind, slug, title, textPreview }`
- Storage: ~115 entity vectors (chapters + characters + locations)

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

Copy `.env.example` to `.env`. Required variables:

**Cloudflare Core:**
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_API_TOKEN` - API token with D1, Images, Vectorize, and Workers AI permissions
- `CLOUDFLARE_ACCOUNT_HASH` - Account hash for image delivery URLs

**D1 Database:**
- `CLOUDFLARE_D1_DATABASE_ID` - D1 database ID (from `wrangler d1 list`)

**Vectorize (Semantic Search):**
- `CLOUDFLARE_VECTORIZE_INDEX_ID` - Index ID from `wrangler vectorize create` command

**Optional:**
- `WORKSPACE_ID` - Workspace identifier (default: 'default')
- `CONTENT_DIR` - Path to MemoryQuill/story-content (auto-detected if not set)

## Semantic Search with Vectorize

### How It Works

1. **Ingestion (Chargen CLI)**:
   - When content is ingested via chargen, entire entities are embedded
   - `WorkersAI.generateEmbedding()` creates 1024-dim vector using BGE-M3
   - `VectorizeService.upsertBatch()` stores vectors with metadata
   - Embedding generation is optional (can be skipped with `--skip-embeddings`)

2. **Search (Frontend)**:
   - User query → `EmbeddingService.generateEmbedding()` → query vector
   - `EmbeddingService.searchSimilar()` queries Vectorize for top-K matches
   - Results hydrated from D1 for full content display

3. **Entity-Level Chunking Benefits**:
   - Entire narratives preserved (no context fragmentation)
   - 1 vector per entity = simple ID mapping (vector ID = content_item.id)
   - Average chapter (3,700 words) fits in BGE-M3's 8,192 token window
   - Minimal index size (~115 vectors total)

### Key Files

**Chargen (Ingestion):**
- `chargen/src/ingestion/services/workers-ai.ts` - BGE-M3 embedding generation via REST API
- `chargen/src/ingestion/services/vectorize.ts` - Vectorize upsert/delete via REST API
- `chargen/src/ingestion/services/d1-inserts.ts` - Entity insertion with optional embedding

**Frontend (Search):**
- `frontend/src/lib/server/ai/embedding.ts` - EmbeddingService with Vectorize query
- `frontend/src/routes/search/+page.server.ts` - Search route (to be implemented)
- `frontend/wrangler.toml` - Vectorize and AI bindings configuration

## Notes

- The chargen CLI is the **primary content writer** - use it for ingestion, not admin upload
- Vectorize integration uses **entity-level chunking** (whole chapters/characters/locations)
- Python ingestion pipeline in `tools/ingestion/` is legacy, chargen CLI is preferred
