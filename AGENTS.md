# Repository Guidelines

## Project Structure & Module Organization

- `mythic-index/frontend/`: Cloudflare Pages app (SvelteKit + Tailwind). Pages/API routes live in `src/routes/`; shared code in `src/lib/`; D1/Drizzle migrations in `drizzle/` and DB code in `src/lib/server/db/`.
- `mythic-index/mcp-server/`: TypeScript MCP server used by `.mcp.json` (`src/` → compiled `dist/`).
- `mythic-index/MemoryQuill/`: Story content and metadata (used by ingestion and canon tooling).
- `mythic-index/tools/`: Maintenance scripts (imagery linking, ingestion pipeline under `tools/ingestion/`).
- `.github/workflows/`: CI and deploy workflows.

## Build, Test, and Development Commands

Use Node.js 20+ (matches CI and `mythic-index/mcp-server` engines).

Frontend (local Pages + D1 emulator via Wrangler):
```bash
cd mythic-index/frontend
npm ci
npm run dev
npm run check
npm run build
```

MCP server:
```bash
cd mythic-index/mcp-server
npm ci
npm run build
npm run start
```

Content/imagery tooling examples:
- `python mythic-index/tools/link_image.py --help`
- `cd mythic-index/tools/ingestion && ./bin/ingest.sh reingest-data --no-imagery --force`

## Coding Style & Naming Conventions

- Indentation: 2 spaces; LF line endings; trim trailing whitespace (see `mythic-index/frontend/.editorconfig`).
- TypeScript: keep `strict` behavior intact; prefer `camelCase` for variables/functions and `PascalCase` for components/types.
- Slugs and content folders: `kebab-case` (e.g., `src/routes/chapters/[slug]/`, `MemoryQuill/.../<slug>/`).

## Testing Guidelines

- CI runs `npm run check` + `npm run build` for `mythic-index/frontend/` and `npm run build` for `mythic-index/mcp-server/` (`.github/workflows/ci.yml`).
- Ingestion validation is script-based: `cd mythic-index/tools/ingestion && python validate.py`.

## Commit & Pull Request Guidelines

- Prefer Conventional Commit-style subjects already present in history: `feat:`, `fix:`, `docs:`, `chore:`, `security:` (example: `feat(mcp-server): ...`).
- PRs: include a short summary, how you validated changes (commands run), and screenshots for UI changes. Call out any schema/migration updates under `mythic-index/frontend/drizzle/`.

## Security & Configuration Tips

- Never commit secrets. Use local `.env`/shell env vars and keep `.env.example` current.
- Cloudflare bindings/config live in `mythic-index/frontend/wrangler.toml`; MCP wiring lives in `.mcp.json`.
