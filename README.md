# MemoryQuill / MythicIndex

A modern web application for managing and exploring mythological narratives and character relationships, built on Cloudflare's serverless platform.

## Active Development Stack

All active development happens in the `mythic-index/` directory. The application runs entirely on **Cloudflare Workers + D1 + Pages + Images**.

```
mythic-index/
├── frontend/              # SvelteKit frontend (deployed to Cloudflare Pages)
├── chargen/              # TypeScript CLI for content ingestion and embeddings
├── MemoryQuill/          # Story content, character data, and imagery metadata
├── narratology/          # Documentation and narrative analysis
├── tools/                # Utility scripts and tools
└── docs/                 # Project documentation
```

## Directory Structure

### Active Development

| Directory | Purpose | Technology |
|-----------|---------|-----------|
| `mythic-index/frontend/` | Web UI for browsing mythology content | SvelteKit, Tailwind CSS, Vite |
| `mythic-index/chargen/` | CLI for content ingestion and embeddings generation | TypeScript, Node.js |
| `mythic-index/MemoryQuill/` | Story content, character definitions, image metadata | YAML, JSON |
| `mythic-index/tools/` | Build scripts and utility tools | Python, PowerShell, shell scripts |
| `mythic-index/narratology/` | Documentation on mythological structure and narrative theory | Markdown, docs |

### Legacy / Reference Only

| Directory | Status | Notes |
|-----------|--------|-------|
| `frontend/` | Archived | Old Angular frontend. **Do not use for development.** See `mythic-index/frontend/` instead. |
| `backend-worker/` | Archived | Old backend implementation. **Do not use for development.** See `mythic-index/backend-worker/` instead. |

### Root Configuration & Documentation

- `.env.example` - Environment variables template
- `CLOUDFLARE_DEPLOYMENT.md` - Complete deployment guide and infrastructure details
- `CLOUDFLARE_MIGRATION_ANALYSIS.md` - Notes on migration from legacy stack

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Cloudflare account (for deployment)

### Local Development

**Frontend:**
```bash
cd mythic-index/frontend
npm install
npm run dev
```

**Backend Worker:**
```bash
cd mythic-index/backend-worker
npm install
npm run dev
```

**Both together:**
```bash
cd mythic-index/frontend
npm run dev  # Uses wrangler pages dev with local D1
```

### Building

```bash
cd mythic-index/frontend
npm run build
```

## Deployment

All deployments are handled through Cloudflare. See `CLOUDFLARE_DEPLOYMENT.md` for complete deployment instructions and the production pipeline.

**Quick deploy:**
```bash
./scripts/deploy-prod.sh
```

## Content Management

Story content, character definitions, and image metadata are managed in:
- `mythic-index/MemoryQuill/` - Primary content source
- `mythic-index/MemoryQuill/imagery.yaml` - Image definitions (source of truth)

## Project Configuration

- `package.json` files in each subdirectory for dependency management
- `wrangler.toml` files for Cloudflare-specific configuration
- `.env.example` - Environment variables template

## Documentation

- `CLOUDFLARE_DEPLOYMENT.md` - Infrastructure, deployment, and environment setup
- `CLOUDFLARE_MIGRATION_ANALYSIS.md` - Historical notes on stack migration
- `mythic-index/narratology/` - Content structure and narrative documentation
- `mythic-index/docs/` - Additional project documentation

## Contributing

When contributing to this project:
1. **Always work in `mythic-index/`** for active development
2. Do not modify the archived `frontend/` or `backend-worker/` root directories
3. Update content in `mythic-index/MemoryQuill/`
4. Follow the deployment guide in `CLOUDFLARE_DEPLOYMENT.md` before pushing to production

## License

See `LICENSE` for details.
