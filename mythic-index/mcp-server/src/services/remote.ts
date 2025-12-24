/**
 * Remote API service for querying Cloudflare D1 database
 * Provides direct access to the Mythic Index backend
 */

import { getConfig } from './config.js';
import { getStorage } from './storage.js';
import { getLogger } from './logger.js';
import type { Character, Location, Chapter, TimelineEvent, LoreEntry } from '../types/index.js';

export interface RemoteQueryOptions {
  useCache?: boolean; // Fall back to cache if offline
  updateCache?: boolean; // Update local cache with results
}

const DEFAULT_OPTIONS: RemoteQueryOptions = {
  useCache: true,
  updateCache: true,
};

export class RemoteService {
  private baseUrl: string;
  private apiKey: string;
  private workspaceId: string;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.remote.apiUrl;
    this.apiKey = config.remote.apiKey;
    this.workspaceId = config.workspace.id;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {},
    queryOptions: RemoteQueryOptions = DEFAULT_OPTIONS
  ): Promise<T> {
    if (!this.baseUrl || !this.apiKey) {
      if (queryOptions.useCache) {
        throw new Error('OFFLINE'); // Signal to use cache
      }
      throw new Error('Remote API not configured. Set apiUrl and apiKey in config.');
    }

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Workspace-ID': this.workspaceId,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error (${response.status}): ${error}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (queryOptions.useCache && (error as Error).message.includes('fetch')) {
        throw new Error('OFFLINE');
      }
      throw error;
    }
  }

  // ============ Characters ============

  async getCharacter(slugOrName: string, options?: RemoteQueryOptions): Promise<Character | null> {
    try {
      const result = await this.fetch<{ data: Character | null }>(
        `/api/v1/characters/${encodeURIComponent(slugOrName)}`,
        { method: 'GET' },
        options
      );

      if (result.data && options?.updateCache !== false) {
        const storage = getStorage();
        storage.saveCharacter(result.data);
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.getCharacter(this.workspaceId, slugOrName);
      }
      throw error;
    }
  }

  async listCharacters(
    filters?: { role?: string; faction?: string; status?: string },
    options?: RemoteQueryOptions
  ): Promise<Character[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.role) params.set('role', filters.role);
      if (filters?.faction) params.set('faction', filters.faction);
      if (filters?.status) params.set('status', filters.status);

      const result = await this.fetch<{ data: Character[] }>(
        `/api/v1/characters?${params}`,
        { method: 'GET' },
        options
      );

      if (options?.updateCache !== false) {
        const storage = getStorage();
        result.data.forEach(char => storage.saveCharacter(char));
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.listCharacters(this.workspaceId, filters);
      }
      throw error;
    }
  }

  async createCharacter(character: Omit<Character, 'id' | 'createdAt' | 'updatedAt'>): Promise<Character> {
    const result = await this.fetch<{ data: Character }>(
      '/api/v1/characters',
      {
        method: 'POST',
        body: JSON.stringify(character),
      }
    );

    const storage = getStorage();
    storage.saveCharacter(result.data);

    return result.data;
  }

  async updateCharacter(slug: string, updates: Partial<Character>): Promise<Character> {
    const result = await this.fetch<{ data: Character }>(
      `/api/v1/characters/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );

    const storage = getStorage();
    storage.saveCharacter(result.data);

    return result.data;
  }

  // ============ Locations ============

  async getLocation(slugOrName: string, options?: RemoteQueryOptions): Promise<Location | null> {
    try {
      const result = await this.fetch<{ data: Location | null }>(
        `/api/v1/locations/${encodeURIComponent(slugOrName)}`,
        { method: 'GET' },
        options
      );

      if (result.data && options?.updateCache !== false) {
        const storage = getStorage();
        storage.saveLocation(result.data);
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.getLocation(this.workspaceId, slugOrName);
      }
      throw error;
    }
  }

  async listLocations(
    filters?: { type?: string; region?: string },
    options?: RemoteQueryOptions
  ): Promise<Location[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.type) params.set('type', filters.type);
      if (filters?.region) params.set('region', filters.region);

      const result = await this.fetch<{ data: Location[] }>(
        `/api/v1/locations?${params}`,
        { method: 'GET' },
        options
      );

      if (options?.updateCache !== false) {
        const storage = getStorage();
        result.data.forEach(loc => storage.saveLocation(loc));
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.listLocations(this.workspaceId, filters);
      }
      throw error;
    }
  }

  async createLocation(location: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
    const result = await this.fetch<{ data: Location }>(
      '/api/v1/locations',
      {
        method: 'POST',
        body: JSON.stringify(location),
      }
    );

    const storage = getStorage();
    storage.saveLocation(result.data);

    return result.data;
  }

  async updateLocation(slug: string, updates: Partial<Location>): Promise<Location> {
    const result = await this.fetch<{ data: Location }>(
      `/api/v1/locations/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );

    const storage = getStorage();
    storage.saveLocation(result.data);

    return result.data;
  }

  // ============ Chapters ============

  async getChapter(slugOrNumber: string | number, options?: RemoteQueryOptions): Promise<Chapter | null> {
    try {
      const result = await this.fetch<{ data: Chapter | null }>(
        `/api/v1/chapters/${encodeURIComponent(String(slugOrNumber))}`,
        { method: 'GET' },
        options
      );

      if (result.data && options?.updateCache !== false) {
        const storage = getStorage();
        storage.saveChapter(result.data);
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.getChapter(this.workspaceId, slugOrNumber);
      }
      throw error;
    }
  }

  async listChapters(
    filters?: { status?: string; arc?: string },
    options?: RemoteQueryOptions
  ): Promise<Chapter[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.arc) params.set('arc', filters.arc);

      const result = await this.fetch<{ data: Chapter[] }>(
        `/api/v1/chapters?${params}`,
        { method: 'GET' },
        options
      );

      if (options?.updateCache !== false) {
        const storage = getStorage();
        result.data.forEach(ch => storage.saveChapter(ch));
      }

      return result.data;
    } catch (error) {
      if ((error as Error).message === 'OFFLINE') {
        const storage = getStorage();
        return storage.listChapters(this.workspaceId, filters);
      }
      throw error;
    }
  }

  async createChapter(chapter: Omit<Chapter, 'id' | 'createdAt' | 'updatedAt'>): Promise<Chapter> {
    const result = await this.fetch<{ data: Chapter }>(
      '/api/v1/chapters',
      {
        method: 'POST',
        body: JSON.stringify(chapter),
      }
    );

    const storage = getStorage();
    storage.saveChapter(result.data);

    return result.data;
  }

  async updateChapter(slug: string, updates: Partial<Chapter>): Promise<Chapter> {
    const result = await this.fetch<{ data: Chapter }>(
      `/api/v1/chapters/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }
    );

    const storage = getStorage();
    storage.saveChapter(result.data);

    return result.data;
  }

  // ============ Semantic Search ============

  async semanticSearch(
    query: string,
    options?: { topK?: number; type?: string }
  ): Promise<Array<{
    type: string;
    id: string;
    slug: string;
    title: string;
    preview: string;
    score: number;
  }>> {
    const result = await this.fetch<{
      data: Array<{
        type: string;
        id: string;
        slug: string;
        title: string;
        preview: string;
        score: number;
      }>;
    }>(
      '/api/v1/search',
      {
        method: 'POST',
        body: JSON.stringify({
          query,
          topK: options?.topK ?? 10,
          type: options?.type,
        }),
      }
    );

    return result.data;
  }

  // ============ Sync ============

  async sync(): Promise<{
    pulled: number;
    pushed: number;
    conflicts: string[];
  }> {
    const storage = getStorage();
    const pending = storage.getPendingSyncs();

    let pulled = 0;
    let pushed = 0;
    const conflicts: string[] = [];

    // Pull latest from remote
    try {
      const characters = await this.listCharacters();
      pulled += characters.length;

      const locations = await this.listLocations();
      pulled += locations.length;

      const chapters = await this.listChapters();
      pulled += chapters.length;
    } catch (error) {
      const logger = getLogger();
      logger.error('Pull failed', error as Error, { module: 'remote', operation: 'pull' });
    }

    // Push local changes
    for (const sync of pending) {
      if (sync.status === 'local_ahead') {
        try {
          switch (sync.entityType) {
            case 'character': {
              const character = storage.getCharacterById(sync.entityId);
              if (character) {
                if (sync.remoteHash) {
                  // Update
                  await this.updateCharacter(character.slug, character);
                } else {
                  // Create
                  const { id, createdAt, updatedAt, ...data } = character;
                  await this.createCharacter(data);
                }
                pushed++;
              }
              break;
            }
            case 'location': {
              const location = storage.getLocationById(sync.entityId);
              if (location) {
                if (sync.remoteHash) {
                  // Update
                  await this.updateLocation(location.slug, location);
                } else {
                  // Create
                  const { id, createdAt, updatedAt, ...data } = location;
                  await this.createLocation(data);
                }
                pushed++;
              }
              break;
            }
            case 'chapter': {
              const chapter = storage.getChapterById(sync.entityId);
              if (chapter) {
                if (sync.remoteHash) {
                  // Update
                  await this.updateChapter(chapter.slug, chapter);
                } else {
                  // Create
                  const { id, createdAt, updatedAt, ...data } = chapter;
                  await this.createChapter(data);
                }
                pushed++;
              }
              break;
            }
          }
        } catch (error) {
          conflicts.push(`${sync.entityType}:${sync.entityId}`);
        }
      } else if (sync.status === 'conflict') {
        conflicts.push(`${sync.entityType}:${sync.entityId}`);
      }
    }

    return { pulled, pushed, conflicts };
  }

  // ============ Image Upload ============

  async uploadImage(
    imagePath: string,
    metadata: {
      entityType: 'character' | 'location' | 'chapter';
      entityId: string;
      role: 'portrait' | 'scene' | 'header' | 'gallery';
    }
  ): Promise<{ url: string; id: string }> {
    const fs = await import('fs/promises');
    const imageData = await fs.readFile(imagePath);
    const base64 = imageData.toString('base64');

    const result = await this.fetch<{ data: { url: string; id: string } }>(
      '/api/v1/images',
      {
        method: 'POST',
        body: JSON.stringify({
          image: base64,
          filename: imagePath.split('/').pop(),
          ...metadata,
        }),
      }
    );

    return result.data;
  }
}

// Singleton
let remoteInstance: RemoteService | null = null;

export function initRemote(): RemoteService {
  remoteInstance = new RemoteService();
  return remoteInstance;
}

export function getRemote(): RemoteService {
  if (!remoteInstance) {
    throw new Error('RemoteService not initialized. Call initRemote() first.');
  }
  return remoteInstance;
}
