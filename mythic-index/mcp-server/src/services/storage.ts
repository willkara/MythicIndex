/**
 * Local SQLite storage for caching and drafts
 * Provides offline-first capability with sync support
 */

import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { Character, Location, Chapter, TimelineEvent, LoreEntry, Draft, SyncState } from '../types/index.js';

export class StorageService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Characters table
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL, -- JSON blob for flexible schema
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_characters_workspace ON characters(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);

      -- Locations table
      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_locations_workspace ON locations(workspace_id);

      -- Chapters table
      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        number INTEGER,
        status TEXT NOT NULL,
        content TEXT,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_chapters_workspace ON chapters(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_number ON chapters(number);

      -- Timeline events
      CREATE TABLE IF NOT EXISTS timeline_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        title TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timeline_workspace ON timeline_events(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_timeline_sequence ON timeline_events(sequence);

      -- Lore entries
      CREATE TABLE IF NOT EXISTS lore_entries (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        slug TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(workspace_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_lore_workspace ON lore_entries(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_lore_category ON lore_entries(category);

      -- Local drafts
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        content TEXT NOT NULL,
        base_version TEXT,
        local_changes INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_entity ON drafts(entity_type, entity_id);

      -- Sync state tracking
      CREATE TABLE IF NOT EXISTS sync_state (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        local_hash TEXT NOT NULL,
        remote_hash TEXT,
        status TEXT NOT NULL,
        last_sync_at TEXT,
        PRIMARY KEY (entity_type, entity_id)
      );

      -- Full-text search for content
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        entity_type,
        entity_id,
        name,
        content,
        tokenize='porter unicode61'
      );
    `);
  }

  // ============ Characters ============

  getCharacter(workspaceId: string, slugOrName: string): Character | null {
    const row = this.db.prepare(`
      SELECT * FROM characters
      WHERE workspace_id = ? AND (slug = ? OR name = ? COLLATE NOCASE)
    `).get(workspaceId, slugOrName, slugOrName) as any;

    if (!row) return null;
    return { ...JSON.parse(row.data), id: row.id, slug: row.slug, name: row.name };
  }

  getCharacterById(id: string): Character | null {
    const row = this.db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...JSON.parse(row.data), id: row.id, slug: row.slug, name: row.name };
  }

  listCharacters(workspaceId: string, filters?: { role?: string; faction?: string; status?: string }): Character[] {
    let query = 'SELECT * FROM characters WHERE workspace_id = ?';
    const params: any[] = [workspaceId];

    const rows = this.db.prepare(query).all(...params) as any[];
    let characters = rows.map(row => ({
      ...JSON.parse(row.data),
      id: row.id,
      slug: row.slug,
      name: row.name,
    }));

    // Apply filters in memory (flexible for JSON fields)
    if (filters?.role) {
      characters = characters.filter(c => c.role === filters.role);
    }
    if (filters?.faction) {
      characters = characters.filter(c => c.faction === filters.faction);
    }
    if (filters?.status) {
      characters = characters.filter(c => c.status === filters.status);
    }

    return characters;
  }

  saveCharacter(character: Character): void {
    const { id, workspaceId, slug, name, createdAt, updatedAt, ...data } = character;
    const dataJson = JSON.stringify({ ...data, workspaceId, createdAt, updatedAt });

    this.db.prepare(`
      INSERT OR REPLACE INTO characters (id, workspace_id, slug, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, slug, name, dataJson, createdAt, updatedAt);

    // Update FTS index
    this.db.prepare(`
      INSERT OR REPLACE INTO content_fts (entity_type, entity_id, name, content)
      VALUES ('character', ?, ?, ?)
    `).run(id, name, JSON.stringify(data));
  }

  deleteCharacter(workspaceId: string, slug: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM characters WHERE workspace_id = ? AND slug = ?
    `).run(workspaceId, slug);
    return result.changes > 0;
  }

  // ============ Locations ============

  getLocation(workspaceId: string, slugOrName: string): Location | null {
    const row = this.db.prepare(`
      SELECT * FROM locations
      WHERE workspace_id = ? AND (slug = ? OR name = ? COLLATE NOCASE)
    `).get(workspaceId, slugOrName, slugOrName) as any;

    if (!row) return null;
    return { ...JSON.parse(row.data), id: row.id, slug: row.slug, name: row.name };
  }

  getLocationById(id: string): Location | null {
    const row = this.db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...JSON.parse(row.data), id: row.id, slug: row.slug, name: row.name };
  }

  listLocations(workspaceId: string, filters?: { type?: string; region?: string }): Location[] {
    const rows = this.db.prepare(`
      SELECT * FROM locations WHERE workspace_id = ?
    `).all(workspaceId) as any[];

    let locations = rows.map(row => ({
      ...JSON.parse(row.data),
      id: row.id,
      slug: row.slug,
      name: row.name,
    }));

    if (filters?.type) {
      locations = locations.filter(l => l.type === filters.type);
    }
    if (filters?.region) {
      locations = locations.filter(l => l.region === filters.region);
    }

    return locations;
  }

  saveLocation(location: Location): void {
    const { id, workspaceId, slug, name, createdAt, updatedAt, ...data } = location;
    const dataJson = JSON.stringify({ ...data, workspaceId, createdAt, updatedAt });

    this.db.prepare(`
      INSERT OR REPLACE INTO locations (id, workspace_id, slug, name, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, slug, name, dataJson, createdAt, updatedAt);

    this.db.prepare(`
      INSERT OR REPLACE INTO content_fts (entity_type, entity_id, name, content)
      VALUES ('location', ?, ?, ?)
    `).run(id, name, JSON.stringify(data));
  }

  // ============ Chapters ============

  getChapter(workspaceId: string, slugOrNumber: string | number): Chapter | null {
    let row: any;
    if (typeof slugOrNumber === 'number') {
      row = this.db.prepare(`
        SELECT * FROM chapters WHERE workspace_id = ? AND number = ?
      `).get(workspaceId, slugOrNumber);
    } else {
      row = this.db.prepare(`
        SELECT * FROM chapters WHERE workspace_id = ? AND slug = ?
      `).get(workspaceId, slugOrNumber);
    }

    if (!row) return null;
    return {
      ...JSON.parse(row.data),
      id: row.id,
      slug: row.slug,
      title: row.title,
      number: row.number,
      status: row.status,
      content: row.content,
    };
  }

  getChapterById(id: string): Chapter | null {
    const row = this.db.prepare('SELECT * FROM chapters WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      ...JSON.parse(row.data),
      id: row.id,
      slug: row.slug,
      title: row.title,
      number: row.number,
      status: row.status,
      content: row.content,
    };
  }

  listChapters(workspaceId: string, filters?: { status?: string; arc?: string }): Chapter[] {
    const rows = this.db.prepare(`
      SELECT * FROM chapters WHERE workspace_id = ? ORDER BY number ASC
    `).all(workspaceId) as any[];

    let chapters = rows.map(row => ({
      ...JSON.parse(row.data),
      id: row.id,
      slug: row.slug,
      title: row.title,
      number: row.number,
      status: row.status,
      content: row.content,
    }));

    if (filters?.status) {
      chapters = chapters.filter(c => c.status === filters.status);
    }
    if (filters?.arc) {
      chapters = chapters.filter(c => c.arc === filters.arc);
    }

    return chapters;
  }

  saveChapter(chapter: Chapter): void {
    const { id, workspaceId, slug, title, number, status, content, createdAt, updatedAt, ...data } = chapter;
    const dataJson = JSON.stringify({ ...data, workspaceId, createdAt, updatedAt });

    this.db.prepare(`
      INSERT OR REPLACE INTO chapters (id, workspace_id, slug, title, number, status, content, data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, slug, title, number ?? null, status, content ?? null, dataJson, createdAt, updatedAt);

    this.db.prepare(`
      INSERT OR REPLACE INTO content_fts (entity_type, entity_id, name, content)
      VALUES ('chapter', ?, ?, ?)
    `).run(id, title, content ?? '');
  }

  // ============ Search ============

  search(workspaceId: string, query: string, limit = 20): Array<{ type: string; id: string; name: string; snippet: string }> {
    const rows = this.db.prepare(`
      SELECT entity_type, entity_id, name, snippet(content_fts, 3, '<mark>', '</mark>', '...', 32) as snippet
      FROM content_fts
      WHERE content_fts MATCH ?
      LIMIT ?
    `).all(query, limit) as any[];

    return rows.map(row => ({
      type: row.entity_type,
      id: row.entity_id,
      name: row.name,
      snippet: row.snippet,
    }));
  }

  // ============ Drafts ============

  getDraft(entityType: string, entityId?: string): Draft | null {
    const row = this.db.prepare(`
      SELECT * FROM drafts WHERE entity_type = ? AND (entity_id = ? OR (entity_id IS NULL AND ? IS NULL))
    `).get(entityType, entityId ?? null, entityId ?? null) as any;

    if (!row) return null;
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      baseVersion: row.base_version,
      localChanges: !!row.local_changes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveDraft(draft: Draft): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO drafts (id, entity_type, entity_id, content, base_version, local_changes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draft.id,
      draft.entityType,
      draft.entityId ?? null,
      draft.content,
      draft.baseVersion ?? null,
      draft.localChanges ? 1 : 0,
      draft.createdAt,
      draft.updatedAt
    );
  }

  listDrafts(): Draft[] {
    const rows = this.db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      content: row.content,
      baseVersion: row.base_version,
      localChanges: !!row.local_changes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  deleteDraft(id: string): boolean {
    const result = this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ============ Sync State ============

  getSyncState(entityType: string, entityId: string): SyncState | null {
    const row = this.db.prepare(`
      SELECT * FROM sync_state WHERE entity_type = ? AND entity_id = ?
    `).get(entityType, entityId) as any;

    if (!row) return null;
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      localHash: row.local_hash,
      remoteHash: row.remote_hash,
      status: row.status,
      lastSyncAt: row.last_sync_at,
    };
  }

  setSyncState(state: SyncState): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sync_state (entity_type, entity_id, local_hash, remote_hash, status, last_sync_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      state.entityType,
      state.entityId,
      state.localHash,
      state.remoteHash ?? null,
      state.status,
      state.lastSyncAt ?? null
    );
  }

  getPendingSyncs(): SyncState[] {
    const rows = this.db.prepare(`
      SELECT * FROM sync_state WHERE status != 'synced'
    `).all() as any[];

    return rows.map(row => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      localHash: row.local_hash,
      remoteHash: row.remote_hash,
      status: row.status,
      lastSyncAt: row.last_sync_at,
    }));
  }

  close(): void {
    this.db.close();
  }
}

// Singleton helper
let storageInstance: StorageService | null = null;

export async function initStorage(dbPath: string): Promise<StorageService> {
  await mkdir(dirname(dbPath), { recursive: true });
  storageInstance = new StorageService(dbPath);
  return storageInstance;
}

export function getStorage(): StorageService {
  if (!storageInstance) {
    throw new Error('Storage not initialized. Call initStorage() first.');
  }
  return storageInstance;
}
