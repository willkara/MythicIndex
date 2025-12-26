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

## Deployment

Manual deployment to Cloudflare is handled through Wrangler CLI. See Cloudflare Pages and Workers documentation for deployment details.

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

## Image Generation System (Workflows)

### Overview

The frontend includes a comprehensive AI image generation system with:
- **Database-driven prompt templates** with Handlebars templating
- **Multi-provider support**: Workers AI (Flux Schnell), Google Gemini, OpenAI DALL-E
- **Cloudflare Workflows** for batch processing (6-100 images)
- **Reference image support** for character/location consistency
- **Prompt compilation pipeline**: Entity data → IR → Final text → AI generation → CDN upload

### Initial Setup

**1. Run Database Migrations:**
```bash
cd mythic-index/frontend

# Create new tables for image generation system
npx wrangler d1 execute memoryquill-dev --local --file=drizzle/0008_image_generation_system.sql

# Load default templates and seed data
npx wrangler d1 execute memoryquill-dev --local --file=drizzle/seed_prompt_templates.sql
```

**2. Configure Environment Variables:**

Add to `mythic-index/frontend/.env`:
```bash
# Required for image generation
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ACCOUNT_HASH=your_account_hash_here

# For Google Gemini (optional, for high-quality multi-reference generation)
GOOGLE_PROJECT_ID=your_project_id_here
GOOGLE_API_TOKEN=your_service_account_token_here
```

**3. Deploy Workflow (Production Only):**
```bash
cd mythic-index/frontend

# Deploy the batch image generation workflow
npx wrangler workflows deploy
```

### Architecture

**Three-Tier Processing Strategy:**
1. **1-5 images**: Direct execution (single API call)
2. **6-100 images**: Cloudflare Workflows (parallel batches with status polling)
3. **100+ images**: Google Batch API integration (future enhancement)

**Database Schema (14 new tables):**
- `prompt_template` - Template definitions with versioning
- `prompt_template_section` - Weighted sections (1-5 priority scale)
- `prompt_component` - Reusable Handlebars partials
- `style_preset` - Master styles by category (character/location/scene)
- `negative_prompt_preset` - Negative prompt library
- `prompt_ir` - Compiled intermediate representation cache
- `prompt_history` - Generation run tracking
- `image_reference_metadata` - Quality and aspect-specific tracking
- Supporting tables for overrides, variables, references, usage

**Prompt Compilation Pipeline:**
```
Entity Data (character/location/scene)
  ↓
TemplateEngine (Handlebars rendering)
  ↓
PromptCompiler (sections + references + style)
  ↓
CompiledPromptIR (weighted sections 1-5)
  ↓
PromptRenderer (weight-based ordering + trimming)
  ↓
Final Text Prompt
  ↓
ImageGenerator (Workers AI / Gemini / DALL-E)
  ↓
CloudflareImagesService (upload to CDN)
  ↓
Database (asset record + entity link)
```

### Key Services

**Located in `frontend/src/lib/server/ai/`:**
- `template-engine.ts` - Handlebars rendering with custom helpers
  - `inferExpression`: Maps personality traits → facial expressions
  - `capitalize`, `join`, `ifCond`: Standard utilities
  - Component/partial support for reusability
- `prompt-compiler.ts` - Entity data → CompiledPromptIR
  - Character portrait, location overview, chapter scene compilation
  - Smart reference image resolution with quality prioritization
- `prompt-renderer.ts` - IR → Final text prompts
  - Weight-based section ordering (priority 1 first)
  - Length-based trimming with intelligent truncation
  - Master style suffix injection
- `image-generator.ts` - Multi-provider AI wrapper
- `cloudflare-images.ts` - CDN upload and asset management
- `image-generation-service.ts` - End-to-end orchestration
- `batch-workflow.ts` - Cloudflare Workflows implementation

### API Endpoints

**Single Image Generation:**
```bash
POST /api/images/generate
Content-Type: application/json

{
  "entityType": "character",
  "entitySlug": "cidri-ashwalker",
  "provider": "workers-ai",      # or "google", "openai"
  "quality": "high",              # or "standard"
  "aspectRatio": "1:1",           # or "16:9", "9:16"
  "templateSlug": "character-portrait-default"  # optional override
}

Response:
{
  "success": true,
  "assetId": "uuid-here",
  "cloudflareId": "cloudflare-image-id",
  "uploadUrl": "https://imagedelivery.net/...",
  "generationRun": { ... }
}
```

**Batch Image Generation:**
```bash
POST /api/images/generate/batch
Content-Type: application/json

{
  "requests": [
    { "entityType": "character", "entitySlug": "cidri-ashwalker" },
    { "entityType": "location", "entitySlug": "undershade-canyon" },
    { "entityType": "chapter", "entitySlug": "ch01-awakening", "sceneId": "scene-uuid" }
  ],
  "userId": "user-123",
  "concurrency": 3  # Parallel image generation (default: 3)
}

Response:
{
  "success": true,
  "jobId": "workflow-job-uuid",
  "totalImages": 3,
  "statusUrl": "/api/images/generate/batch/workflow-job-uuid"
}
```

**Poll Batch Job Status:**
```bash
GET /api/images/generate/batch/{jobId}

Response:
{
  "jobId": "workflow-job-uuid",
  "status": "running",  # or "completed", "failed", "queued"
  "totalImages": 10,
  "completedImages": 7,
  "failedImages": 1,
  "results": [
    { "entitySlug": "cidri-ashwalker", "success": true, "assetId": "..." },
    { "entitySlug": "other-char", "success": false, "error": "..." }
  ],
  "startedAt": "2025-12-25T...",
  "completedAt": null
}
```

**Control Batch Jobs:**
```bash
# Cancel job
DELETE /api/images/generate/batch/{jobId}

# Pause job
PATCH /api/images/generate/batch/{jobId}
{ "action": "pause" }

# Resume job
PATCH /api/images/generate/batch/{jobId}
{ "action": "resume" }
```

### Prompt Template System

**Default Templates (in seed data):**
1. **Character Portrait** (`character-portrait-default`)
   - Weight 1 (constraints): Image type, format requirements
   - Weight 2 (subject): Species, age, appearance, personality-driven expression
   - Weight 3 (composition): Portrait framing, focus
   - Weight 4 (lighting): Atmospheric lighting
   - Weight 5 (style): Heroic fantasy, painterly style

2. **Location Overview** (`location-overview-default`)
   - Establishing shots with fantasy atmosphere
   - Environmental detail emphasis

3. **Scene Composite** (`scene-composite-default`)
   - Multi-character scenes with identity lock
   - Reference image support for consistency

**Custom Helpers:**
- `{{inferExpression entity.personality}}` - Maps traits to facial expressions
- `{{capitalize entity.species}}` - Capitalize first letter
- `{{join entity.features ", "}}` - Join arrays
- `{{#ifCond entity.age ">" 100}}ancient{{/ifCond}}` - Conditional logic

**Reusable Components (partials):**
- `{{> infer-expression}}` - Expression inference logic
- `{{> fantasy-urban}}` - Urban fantasy environment cues
- `{{> fantasy-wilderness}}` - Wilderness atmosphere cues

### Image Reference Metadata

Images can be tagged for reference quality and specific aspects:
- `isCanonical` - Official character/location representation
- `referenceQuality` - `high` / `medium` / `low`
- `faceReference` - Good for facial features
- `bodyReference` - Good for body proportions
- `clothingReference` - Good for attire details
- `environmentReference` - Good for location atmosphere

The system prioritizes canonical images and high-quality references when compiling prompts.

### Development Commands

```bash
cd mythic-index/frontend

# Run migrations (local development)
npx wrangler d1 execute memoryquill-dev --local --file=drizzle/0008_image_generation_system.sql
npx wrangler d1 execute memoryquill-dev --local --file=drizzle/seed_prompt_templates.sql

# Run migrations (production - use with caution)
npx wrangler d1 execute memoryquill-dev --file=drizzle/0008_image_generation_system.sql
npx wrangler d1 execute memoryquill-dev --file=drizzle/seed_prompt_templates.sql

# Deploy Workflows (production)
npx wrangler workflows deploy

# Test single generation (via curl)
curl -X POST http://localhost:5173/api/images/generate \
  -H "Content-Type: application/json" \
  -d '{"entityType":"character","entitySlug":"cidri-ashwalker","provider":"workers-ai"}'

# Test batch generation
curl -X POST http://localhost:5173/api/images/generate/batch \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"entityType":"character","entitySlug":"cidri-ashwalker"}],"userId":"test"}'
```

### Key Files

**Database:**
- `drizzle/0008_image_generation_system.sql` - Schema migration
- `drizzle/seed_prompt_templates.sql` - Default templates and presets
- `src/lib/server/db/schema.ts:920-1245` - TypeScript schema definitions

**Core Services:**
- `src/lib/server/ai/types.ts` - Comprehensive type definitions
- `src/lib/server/ai/template-engine.ts` - Handlebars template rendering
- `src/lib/server/ai/prompt-compiler.ts` - Entity → IR compilation
- `src/lib/server/ai/prompt-renderer.ts` - IR → text rendering
- `src/lib/server/ai/image-generator.ts` - Multi-provider wrapper
- `src/lib/server/ai/cloudflare-images.ts` - CDN upload service
- `src/lib/server/ai/image-generation-service.ts` - Main orchestrator
- `src/lib/server/ai/batch-workflow.ts` - Cloudflare Workflows

**API Routes:**
- `src/routes/api/images/generate/+server.ts` - Single generation
- `src/routes/api/images/generate/batch/+server.ts` - Batch start
- `src/routes/api/images/generate/batch/[jobId]/+server.ts` - Status/control

**Configuration:**
- `wrangler.toml:18-21` - Workflow binding configuration

### Admin UI for Template Management

A comprehensive web interface for managing prompt templates is available at `/admin/templates`.

**Template List (`/admin/templates`):**
- View all templates with metadata (category, status, version, section count)
- Statistics dashboard showing total, active, and default templates
- Filter templates by category and status
- Create new templates
- Quick navigation to editor and tester

**Template Editor (`/admin/templates/[id]`):**
- Edit template metadata (name, description, status)
- Section management with weight-based ordering (1-5 priority scale)
- Add/edit/delete template sections with Handlebars content
- Conditional section rendering with JavaScript expressions
- View available components (partials) for reference
- Delete templates with confirmation

**Template Tester (`/admin/templates/[id]/test`):**
- Test templates with real entity data (characters, locations)
- Preview compiled prompts before generation
- View intermediate representation (IR) with section weights
- Character count validation
- Formatted prompt display
- Error handling and debugging output

**Server Actions:**
- `updateTemplate` - Update template metadata
- `addSection` - Add new section to template
- `updateSection` - Update existing section
- `deleteSection` - Remove section from template
- `deleteTemplate` - Delete template and all sections

### Google Batch API Integration

For large-scale image generation (100+ images), the system integrates with Google Cloud Batch API for optimal cost and performance.

**Smart Batch Routing (`POST /api/images/generate/batch-smart`):**

Automatically routes batch requests to the optimal backend:
1. **1-5 images**: Direct synchronous generation
2. **6-100 images**: Cloudflare Workflows
3. **100+ images**: Google Batch API

Request format:
```bash
POST /api/images/generate/batch-smart
{
  "requests": [...],  # Array of ImageGenerationRequest
  "userId": "user-123",
  "concurrency": 20  # Optional, default varies by backend
}

Response (Google Batch):
{
  "success": true,
  "method": "google-batch",
  "jobName": "projects/.../jobs/...",
  "totalImages": 250,
  "estimatedCost": 7.50,
  "statusUrl": "/api/images/generate/google-batch/...",
  "message": "Batch job created with Google Batch API"
}
```

**Google Batch Job Status (`GET /api/images/generate/google-batch/[jobName]`):**
```bash
Response:
{
  "jobName": "projects/.../jobs/...",
  "state": "RUNNING",  # QUEUED, RUNNING, SUCCEEDED, FAILED
  "totalImages": 250,
  "completedImages": 180,
  "failedImages": 5,
  "runningImages": 65,
  "createTime": "2025-12-26T...",
  "startTime": "2025-12-26T...",
  "statusEvents": [...]
}
```

**Google Batch Features:**
- Automatic parallelization (configurable concurrency, default 20)
- Built-in retry logic (max 2 retries per task)
- Cost estimation ($0.03/image + $0.05/hour compute)
- Job cancellation support
- Cloud Logging integration
- Cloud Storage for results

**Cost Optimization:**
- e2-standard-2 machines: $0.05/hour
- Imagen API: ~$0.03 per image
- Total: ~$7.50 for 250 images (estimated 1 hour)
- Efficient parallelization reduces total job time
- Automatic resource cleanup after completion

**Configuration:**

Add to `mythic-index/frontend/.env`:
```bash
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_API_TOKEN=your-service-account-token
```

The service account needs permissions for:
- `batch.jobs.create`
- `batch.jobs.get`
- `batch.jobs.delete`
- `storage.objects.create` (for results)

### Future Enhancements (Not Yet Implemented)

- **Component manager UI** for Handlebars partials
- **Style preset manager UI** for master styles
- **Negative prompt library UI** for negative prompts
- **Template version control** and rollback
- **A/B testing** for prompt variations
- **Template usage analytics** and cost tracking per provider
- **Image variant generation** (multiple styles from same prompt)

## Notes

- The chargen CLI is the **primary content writer** - use it for ingestion, not admin upload
- Vectorize integration uses **entity-level chunking** (whole chapters/characters/locations)
- Python ingestion pipeline in `tools/ingestion/` is legacy, chargen CLI is preferred
- Image generation system uses **Cloudflare Workflows** for durable batch processing with free wait time
