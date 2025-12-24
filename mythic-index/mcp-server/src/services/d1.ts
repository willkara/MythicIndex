/**
 * Cloudflare D1 Database Service
 * Direct database access via Cloudflare D1 REST API
 */

import { logD1Query, getLogger, logServiceOperation } from './logger.js';

export interface D1Config {
  accountId: string;
  databaseId: string;
  token: string;
}

interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: {
    served_by?: string;
    duration?: number;
    changes?: number;
    last_row_id?: number;
    changed_db?: boolean;
    size_after?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

interface D1Response<T = Record<string, unknown>> {
  result: D1QueryResult<T>[];
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

let config: D1Config | null = null;

/**
 * Initialize D1 configuration
 */
export function initD1(d1Config?: D1Config): void {
  if (d1Config) {
    config = d1Config;
    return;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error(
      'D1 requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN environment variables'
    );
  }

  config = { accountId, databaseId, token };
}

/**
 * Reset the D1 configuration
 */
export function resetD1(): void {
  config = null;
}

/**
 * Check if D1 is configured and available
 */
export function isD1Available(): boolean {
  if (config) return true;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  const available = !!(accountId && databaseId && token);

  const logger = getLogger();
  logger.debug('D1 availability check', {
    module: 'd1',
    operation: 'isD1Available',
    available,
    hasConfig: !!config,
    hasEnvVars: !!(accountId && databaseId && token),
  });

  return available;
}

/**
 * Get the current D1 configuration
 */
function getConfig(): D1Config {
  if (!config) {
    initD1();
  }
  if (!config) {
    throw new Error('D1 not configured');
  }
  return config;
}

/**
 * Execute a SQL query against D1
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return logD1Query(sql, params, async () => {
    const { accountId, databaseId, token } = getConfig();

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`D1 query failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as D1Response<T>;

    if (!data.success) {
      throw new Error(`D1 query error: ${data.errors.map(e => e.message).join(', ')}`);
    }

    // Return results from first query (we're sending single queries)
    return data.result[0]?.results || [];
  });
}

/**
 * Execute multiple SQL statements in a batch
 */
export async function batch<T = Record<string, unknown>>(
  statements: Array<{ sql: string; params?: unknown[] }>
): Promise<T[][]> {
  return logServiceOperation(
    'd1',
    'batch query',
    async () => {
      const { accountId, databaseId, token } = getConfig();

      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

      // D1 API expects sql array for batch
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(statements.map(s => ({
          sql: s.sql,
          params: s.params || [],
        }))),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`D1 batch query failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as D1Response<T>;

      if (!data.success) {
        throw new Error(`D1 batch error: ${data.errors.map(e => e.message).join(', ')}`);
      }

      return data.result.map(r => r.results || []);
    },
    { statementCount: statements.length }
  );
}

// ============ Content Types ============

export interface ContentItemRow {
  id: string;
  workspace_id: string;
  kind: string;
  slug: string;
  title: string;
  summary: string | null;
  status: string;
  default_revision_id: string | null;
  metadata_json: string;
  word_count: number | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ContentRevisionRow {
  id: string;
  content_id: string;
  revision_number: number;
  state: string;
  author_id: string;
  based_on_revision_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentSectionRow {
  id: string;
  revision_id: string;
  section_type: string;
  title: string | null;
  position: number;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

export interface ContentBlockRow {
  id: string;
  section_id: string;
  block_type: string;
  position: number;
  text_payload: string | null;
  rich_payload: string | null;
  word_count: number | null;
  is_scene_anchor: number;
  created_at: string;
  updated_at: string;
}

export interface SceneRow {
  id: string;
  content_id: string;
  revision_id: string;
  slug: string;
  title: string | null;
  sequence_order: number;
  synopsis: string | null;
  scene_when: string | null;
  primary_location_id: string | null;
  pov_entity_id: string | null;
  est_read_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface LoreEntityRow {
  id: string;
  workspace_id: string;
  content_id: string | null;
  entity_type: string;
  slug: string;
  display_name: string;
  short_blurb: string | null;
  portrait_asset_id: string | null;
  origin_scene_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageAssetRow {
  id: string;
  source_path: string;
  storage_path: string;
  file_hash: string;
  file_size_bytes: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  generated_by_provider: string | null;
  generated_prompt: string | null;
  metadata_json: string | null;
  cloudflare_image_id: string | null;
  cloudflare_base_url: string | null;
  cloudflare_variant_names: string | null;
  cloudflare_default_variant: string | null;
  cloudflare_uploaded_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ImageLinkRow {
  id: string;
  asset_id: string;
  content_id: string;
  scene_id: string | null;
  role: string;
  sort_order: number | null;
  caption: string | null;
  alt_text: string | null;
  display_style: string | null;
  created_at: string | null;
}

export interface CharacterRow {
  id: string;
  workspace_id: string;
  slug: string;
  content_item_id: string | null;
  name: string;
  aliases: string | null;
  race: string | null;
  character_class: string | null;
  role: string | null;
  status: string;
  first_appearance: string | null;
  appearance_age: string | null;
  appearance_height: string | null;
  appearance_build: string | null;
  appearance_hair: string | null;
  appearance_eyes: string | null;
  appearance_distinguishing_features: string | null;
  appearance_clothing: string | null;
  visual_summary: string | null;
  personality_archetype: string | null;
  personality_temperament: string | null;
  personality_positive_traits: string | null;
  personality_negative_traits: string | null;
  personality_moral_alignment: string | null;
  background: string | null;
  motivations: string | null;
  fears: string | null;
  secrets: string | null;
  primary_weapons: string | null;
  fighting_style: string | null;
  tactical_role: string | null;
  speech_style: string | null;
  signature_phrases: string | null;
  faction: string | null;
  occupation: string | null;
  notes: string | null;
  portrait_image_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============ Content Queries ============

/**
 * Get a content item by kind and slug
 */
export async function getContentItem(kind: string, slug: string): Promise<ContentItemRow | null> {
  const results = await query<ContentItemRow>(
    'SELECT * FROM content_item WHERE kind = ? AND slug = ? LIMIT 1',
    [kind, slug]
  );
  return results[0] || null;
}

/**
 * List content items by kind
 */
export async function listContentItems(kind: string, options?: {
  limit?: number;
  offset?: number;
  status?: string;
}): Promise<ContentItemRow[]> {
  const params: unknown[] = [kind];
  let sql = 'SELECT * FROM content_item WHERE kind = ?';

  if (options?.status) {
    sql += ' AND status = ?';
    params.push(options.status);
  }

  sql += ' ORDER BY updated_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  if (options?.offset) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  return query<ContentItemRow>(sql, params);
}

/**
 * Get a character by slug
 */
export async function getCharacter(slug: string): Promise<CharacterRow | null> {
  const results = await query<CharacterRow>(
    'SELECT * FROM character WHERE slug = ? LIMIT 1',
    [slug]
  );
  return results[0] || null;
}

/**
 * Get a location by slug
 */
export async function getLocation(slug: string): Promise<ContentItemRow | null> {
  return getContentItem('location', slug);
}

/**
 * Get a chapter by slug
 */
export async function getChapter(slug: string): Promise<ContentItemRow | null> {
  return getContentItem('chapter', slug);
}

/**
 * List all characters
 */
export async function listCharacters(options?: {
  limit?: number;
  offset?: number;
  workspaceId?: string;
}): Promise<CharacterRow[]> {
  const params: unknown[] = [];
  let sql = 'SELECT * FROM character';

  // Optional workspace filter (default to 'default' if not specified)
  if (options?.workspaceId !== undefined) {
    sql += ' WHERE workspace_id = ?';
    params.push(options.workspaceId);
  } else {
    sql += ' WHERE workspace_id = ?';
    params.push('default');
  }

  sql += ' ORDER BY updated_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
  if (options?.offset) {
    sql += ' OFFSET ?';
    params.push(options.offset);
  }

  return query<CharacterRow>(sql, params);
}

/**
 * List all locations
 */
export async function listLocations(options?: { limit?: number; offset?: number }): Promise<ContentItemRow[]> {
  return listContentItems('location', options);
}

/**
 * List all chapters
 */
export async function listChapters(options?: { limit?: number; offset?: number; status?: string }): Promise<ContentItemRow[]> {
  return listContentItems('chapter', options);
}

// ============ Revision and Content Block Queries ============

/**
 * Get a revision by ID
 */
export async function getRevision(revisionId: string): Promise<ContentRevisionRow | null> {
  const results = await query<ContentRevisionRow>(
    'SELECT * FROM content_revision WHERE id = ? LIMIT 1',
    [revisionId]
  );
  return results[0] || null;
}

/**
 * Get sections for a revision
 */
export async function getRevisionSections(revisionId: string): Promise<ContentSectionRow[]> {
  return query<ContentSectionRow>(
    'SELECT * FROM content_section WHERE revision_id = ? ORDER BY position ASC',
    [revisionId]
  );
}

/**
 * Get blocks for a section
 */
export async function getSectionBlocks(sectionId: string): Promise<ContentBlockRow[]> {
  return query<ContentBlockRow>(
    'SELECT * FROM content_block WHERE section_id = ? ORDER BY position ASC',
    [sectionId]
  );
}

/**
 * Get full content with all blocks for a content item
 */
export async function getFullContent(kind: string, slug: string): Promise<{
  item: ContentItemRow;
  revision: ContentRevisionRow | null;
  sections: ContentSectionRow[];
  blocks: ContentBlockRow[];
} | null> {
  // Get content item
  const item = await getContentItem(kind, slug);
  if (!item) {
    return null;
  }

  // Get default revision
  let revision: ContentRevisionRow | null = null;
  if (item.default_revision_id) {
    revision = await getRevision(item.default_revision_id);
  }

  if (!revision) {
    return { item, revision: null, sections: [], blocks: [] };
  }

  // Get sections
  const sections = await getRevisionSections(revision.id);

  // Get all blocks for all sections
  const blocks: ContentBlockRow[] = [];
  for (const section of sections) {
    const sectionBlocks = await getSectionBlocks(section.id);
    blocks.push(...sectionBlocks);
  }

  return { item, revision, sections, blocks };
}

// ============ Image Queries ============

/**
 * Get images linked to a content item
 */
export async function getContentImages(contentId: string): Promise<Array<{
  link: ImageLinkRow;
  asset: ImageAssetRow;
}>> {
  const results = await query<ImageLinkRow & ImageAssetRow>(
    `SELECT il.*, ia.*
     FROM image_link il
     INNER JOIN image_asset ia ON il.asset_id = ia.id
     WHERE il.content_id = ?
     ORDER BY il.sort_order ASC`,
    [contentId]
  );

  // Split the combined row back into link and asset
  return results.map(row => ({
    link: {
      id: row.id,
      asset_id: row.asset_id,
      content_id: row.content_id,
      scene_id: row.scene_id,
      role: row.role,
      sort_order: row.sort_order,
      caption: row.caption,
      alt_text: row.alt_text,
      display_style: row.display_style,
      created_at: row.created_at,
    } as ImageLinkRow,
    asset: {
      id: row.asset_id,
      source_path: row.source_path,
      storage_path: row.storage_path,
      file_hash: row.file_hash,
      file_size_bytes: row.file_size_bytes,
      mime_type: row.mime_type,
      width: row.width,
      height: row.height,
      generated_by_provider: row.generated_by_provider,
      generated_prompt: row.generated_prompt,
      metadata_json: row.metadata_json,
      cloudflare_image_id: row.cloudflare_image_id,
      cloudflare_base_url: row.cloudflare_base_url,
      cloudflare_variant_names: row.cloudflare_variant_names,
      cloudflare_default_variant: row.cloudflare_default_variant,
      cloudflare_uploaded_at: row.cloudflare_uploaded_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    } as ImageAssetRow,
  }));
}

// ============ Scene Queries ============

/**
 * Get scenes for a content item (chapter)
 */
export async function getContentScenes(contentId: string): Promise<SceneRow[]> {
  return query<SceneRow>(
    'SELECT * FROM scene WHERE content_id = ? ORDER BY sequence_order ASC',
    [contentId]
  );
}

// ============ Entity Queries ============

/**
 * Get lore entity by slug
 */
export async function getLoreEntity(slug: string): Promise<LoreEntityRow | null> {
  const results = await query<LoreEntityRow>(
    'SELECT * FROM lore_entity WHERE slug = ? LIMIT 1',
    [slug]
  );
  return results[0] || null;
}

// ============ Search Queries ============

/**
 * Search content by title or summary
 */
export async function searchContent(searchQuery: string, options?: {
  kind?: string;
  limit?: number;
}): Promise<ContentItemRow[]> {
  const params: unknown[] = [`%${searchQuery}%`];
  let sql = 'SELECT * FROM content_item WHERE (title LIKE ? OR summary LIKE ?)';
  params.push(`%${searchQuery}%`);

  if (options?.kind) {
    sql += ' AND kind = ?';
    params.push(options.kind);
  }

  sql += ' ORDER BY updated_at DESC';

  if (options?.limit) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }

  return query<ContentItemRow>(sql, params);
}

// ============ Fuzzy Search Queries ============

export type ContentItemKind = 'character' | 'location' | 'chapter';
export type MatchType = 'exact_slug' | 'exact_title' | 'metadata' | 'partial_slug' | 'partial_title';

export interface ContentItemSearchResult extends ContentItemRow {
  matchType: MatchType;
  matchScore: number;
}

/**
 * Search for content items with fuzzy matching
 * Priority: exact slug (100) > exact title (90) > metadata match (80) > partial slug (60) > partial title (50)
 */
export async function searchContentItems(
  kind: ContentItemKind,
  searchTerm: string,
  options?: { limit?: number }
): Promise<ContentItemSearchResult[]> {
  const limit = options?.limit ?? 10;
  const normalizedTerm = searchTerm.toLowerCase().trim();
  const slugTerm = normalizedTerm.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  // Build metadata pattern based on entity type
  // For characters: search aliases
  // For locations: search region
  // For chapters: search arc
  const metadataPattern = `%${normalizedTerm}%`;
  const partialSlugPattern = `%${slugTerm}%`;
  const partialTitlePattern = `%${normalizedTerm}%`;

  // Use a single query with CASE expressions for match scoring
  // SQLite doesn't have COLLATE NOCASE in LIKE by default, but LIKE is case-insensitive for ASCII
  const sql = `
    SELECT
      *,
      CASE
        WHEN slug = ? THEN 'exact_slug'
        WHEN LOWER(title) = ? THEN 'exact_title'
        WHEN LOWER(metadata_json) LIKE ? THEN 'metadata'
        WHEN slug LIKE ? THEN 'partial_slug'
        WHEN LOWER(title) LIKE ? THEN 'partial_title'
        ELSE 'none'
      END as match_type,
      CASE
        WHEN slug = ? THEN 100
        WHEN LOWER(title) = ? THEN 90
        WHEN LOWER(metadata_json) LIKE ? THEN 80
        WHEN slug LIKE ? THEN 60
        WHEN LOWER(title) LIKE ? THEN 50
        ELSE 0
      END as match_score
    FROM content_item
    WHERE kind = ?
      AND (
        slug = ?
        OR LOWER(title) = ?
        OR LOWER(metadata_json) LIKE ?
        OR slug LIKE ?
        OR LOWER(title) LIKE ?
      )
    ORDER BY match_score DESC
    LIMIT ?
  `;

  const params = [
    // For match_type CASE
    slugTerm, normalizedTerm, metadataPattern, partialSlugPattern, partialTitlePattern,
    // For match_score CASE
    slugTerm, normalizedTerm, metadataPattern, partialSlugPattern, partialTitlePattern,
    // For WHERE clause
    kind,
    slugTerm, normalizedTerm, metadataPattern, partialSlugPattern, partialTitlePattern,
    // LIMIT
    limit
  ];

  const results = await query<ContentItemRow & { match_type: string; match_score: number }>(sql, params);

  return results.map(r => ({
    ...r,
    matchType: r.match_type as MatchType,
    matchScore: r.match_score
  }));
}

/**
 * Search for characters with fuzzy matching (queries dedicated character table)
 * Priority: exact slug (100) > exact name (90) > partial slug (60) > partial name (50) > aliases (40)
 */
export async function searchCharacters(
  searchTerm: string,
  options?: { limit?: number; workspaceId?: string }
): Promise<CharacterRow[]> {
  const limit = options?.limit ?? 10;
  const workspaceId = options?.workspaceId ?? 'default';
  const normalizedTerm = searchTerm.toLowerCase().trim();
  const slugTerm = normalizedTerm.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const sql = `
    SELECT *,
      CASE
        WHEN slug = ? THEN 100
        WHEN LOWER(name) = ? THEN 90
        WHEN slug LIKE ? THEN 60
        WHEN LOWER(name) LIKE ? THEN 50
        WHEN LOWER(aliases) LIKE ? THEN 40
        ELSE 0
      END as match_score
    FROM character
    WHERE workspace_id = ?
      AND (
        slug = ?
        OR LOWER(name) = ?
        OR slug LIKE ?
        OR LOWER(name) LIKE ?
        OR LOWER(aliases) LIKE ?
      )
    ORDER BY match_score DESC
    LIMIT ?
  `;

  const partialPattern = `%${normalizedTerm}%`;
  const partialSlugPattern = `%${slugTerm}%`;

  return query<CharacterRow>(sql, [
    // CASE scoring parameters
    slugTerm, normalizedTerm, partialSlugPattern, partialPattern, partialPattern,
    // WHERE workspace_id
    workspaceId,
    // WHERE matching conditions
    slugTerm, normalizedTerm, partialSlugPattern, partialPattern, partialPattern,
    // LIMIT
    limit
  ]);
}
