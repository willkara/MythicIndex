/**
 * Location management tools
 * Create, edit, and explore locations in your story world
 */

import { z } from 'zod';
import { getStorage } from '../services/storage.js';
import { getConfig } from '../services/config.js';
import type { Location } from '../types/index.js';
import * as d1 from '../services/d1.js';
import { getLogger } from '../services/logger.js';
import { elicitEntitySelection, formatCandidatesForGuidance } from '../services/elicitation.js';
import type { MatchType, MatchInfo } from './characters.js';

/**
 * Transform D1 ContentItemRow to Location type
 * Parses metadata_json to extract location-specific fields
 */
function contentItemToLocation(row: d1.ContentItemRow): Location {
  let metadata: Record<string, unknown> = {};

  try {
    metadata = row.metadata_json ? JSON.parse(row.metadata_json) : {};
  } catch (error) {
    const logger = getLogger();
    logger.debug('Failed to parse metadata_json for location', { module: 'locations', slug: row.slug, error });
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    name: row.title,
    aliases: metadata.aliases as string[] | undefined,

    // Geography
    type: metadata.type as Location['type'],
    parentLocationId: metadata.parentLocationId as string | undefined,
    parentLocationName: metadata.parentLocationName as string | undefined,
    region: metadata.region as string | undefined,

    // Description
    description: metadata.description as string | undefined,
    atmosphere: metadata.atmosphere as string | undefined,
    history: metadata.history as string | undefined,

    // Features
    features: metadata.features as string[] | undefined,
    inhabitants: metadata.inhabitants as string[] | undefined,

    // Media
    imageUrl: metadata.imageUrl as string | undefined,
    mapUrl: metadata.mapUrl as string | undefined,

    // Metadata
    firstAppearance: metadata.firstAppearance as string | undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface GetLocationResult {
  location: Location | null;
  candidates?: Location[];
  matchInfo?: MatchInfo;
  guidanceMessage?: string;
}

// Tool schemas
export const getLocationSchema = z.object({
  name: z.string().describe('Location name or slug'),
});

export const listLocationsSchema = z.object({
  type: z.enum(['city', 'town', 'village', 'building', 'room', 'region', 'landmark', 'natural']).optional()
    .describe('Filter by location type'),
  region: z.string().optional().describe('Filter by parent region'),
});

export const createLocationSchema = z.object({
  name: z.string().describe('Location name'),
  type: z.enum(['city', 'town', 'village', 'building', 'room', 'region', 'landmark', 'natural']).optional(),
  parentLocation: z.string().optional().describe('Parent location name (e.g., region or building)'),
  description: z.string().optional().describe('Physical description'),
  atmosphere: z.string().optional().describe('Mood, feeling, ambiance'),
  history: z.string().optional().describe('Historical background'),
  features: z.array(z.string()).optional().describe('Notable features'),
  inhabitants: z.array(z.string()).optional().describe('Who lives/works here'),
});

export const editLocationSchema = z.object({
  name: z.string().describe('Location name or slug to edit'),
  updates: z.object({
    description: z.string().optional(),
    atmosphere: z.string().optional(),
    history: z.string().optional(),
    features: z.array(z.string()).optional(),
    inhabitants: z.array(z.string()).optional(),
    type: z.enum(['city', 'town', 'village', 'building', 'room', 'region', 'landmark', 'natural']).optional(),
  }),
});

/**
 * Format a location for elicitation display
 */
function formatLocationOption(location: Location): string {
  const parts: string[] = [];
  if (location.type) parts.push(location.type);
  if (location.region) parts.push(`in ${location.region}`);
  if (location.parentLocationName) parts.push(`part of ${location.parentLocationName}`);
  return parts.length > 0 ? parts.join(' - ') : 'no details';
}

// Tool implementations
export async function getLocation(input: z.infer<typeof getLocationSchema>): Promise<GetLocationResult> {
  const logger = getLogger();
  const searchTerm = input.name.trim();

  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // Step 1: Try exact slug match first (fast path)
      const exactMatch = await d1.getLocation(searchTerm);
      if (exactMatch) {
        return {
          location: contentItemToLocation(exactMatch),
          matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 2: Fuzzy search
      const fuzzyResults = await d1.searchContentItems('location', searchTerm, { limit: 5 });

      if (fuzzyResults.length === 0) {
        // No matches at all
        return {
          location: null,
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 0 }
        };
      }

      if (fuzzyResults.length === 1) {
        // Single match - return it
        logger.debug('Single fuzzy match found for location', {
          module: 'locations',
          query: searchTerm,
          matchedSlug: fuzzyResults[0].slug,
          matchType: fuzzyResults[0].matchType,
          matchScore: fuzzyResults[0].matchScore
        });
        return {
          location: contentItemToLocation(fuzzyResults[0]),
          matchInfo: { type: 'fuzzy', originalQuery: searchTerm, matchCount: 1 }
        };
      }

      // Step 3: Multiple matches - try elicitation
      const candidates = fuzzyResults.map(contentItemToLocation);
      const elicitResult = await elicitEntitySelection(
        'location',
        candidates,
        searchTerm,
        formatLocationOption
      );

      if (elicitResult.success && elicitResult.selected) {
        return {
          location: elicitResult.selected,
          matchInfo: { type: 'elicited', originalQuery: searchTerm, matchCount: fuzzyResults.length }
        };
      }

      // Elicitation declined or not supported - return ambiguous result with guidance
      const guidanceMessage = formatCandidatesForGuidance(
        'location',
        candidates,
        searchTerm,
        formatLocationOption
      );

      return {
        location: null,
        candidates,
        matchInfo: { type: 'ambiguous', originalQuery: searchTerm, matchCount: fuzzyResults.length },
        guidanceMessage
      };

    } catch (error) {
      logger.warn('D1 fuzzy search failed for location, falling back to storage', {
        module: 'locations',
        error: (error as Error).message
      });
      // Fall through to storage
    }
  }

  // Fallback to local storage (existing exact-match logic)
  const config = getConfig();
  const storage = getStorage();
  const location = storage.getLocation(config.workspace.id, searchTerm);

  return {
    location,
    matchInfo: { type: 'exact', originalQuery: searchTerm, matchCount: location ? 1 : 0 }
  };
}

export async function listLocations(input: z.infer<typeof listLocationsSchema>): Promise<Location[]> {
  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // Note: D1 service doesn't support type/region filters yet
      // So we fetch all and filter in memory for now
      const rows = await d1.listLocations();
      let locations = rows.map(contentItemToLocation);

      // Apply filters
      if (input.type) {
        locations = locations.filter(l => l.type === input.type);
      }
      if (input.region) {
        locations = locations.filter(l => l.region === input.region);
      }

      return locations;
    } catch (error) {
      const logger = getLogger();
      logger.warn('D1 query failed for locations, falling back to storage', { module: 'locations', error });
      // Fall through to storage
    }
  }

  // Fallback to local storage
  const config = getConfig();
  const storage = getStorage();
  return storage.listLocations(config.workspace.id, input);
}

export function createLocation(input: z.infer<typeof createLocationSchema>): Location {
  const config = getConfig();
  const storage = getStorage();

  const now = new Date().toISOString();
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const id = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Look up parent location if specified
  let parentLocationId: string | undefined;
  let parentLocationName: string | undefined;
  let region: string | undefined;

  if (input.parentLocation) {
    const parent = storage.getLocation(config.workspace.id, input.parentLocation);
    if (parent) {
      parentLocationId = parent.id;
      parentLocationName = parent.name;
      region = parent.region || parent.name;
    }
  }

  const location: Location = {
    id,
    workspaceId: config.workspace.id,
    slug,
    name: input.name,
    type: input.type,
    parentLocationId,
    parentLocationName,
    region,
    description: input.description,
    atmosphere: input.atmosphere,
    history: input.history,
    features: input.features,
    inhabitants: input.inhabitants,
    createdAt: now,
    updatedAt: now,
  };

  storage.saveLocation(location);
  return location;
}

export function editLocation(input: z.infer<typeof editLocationSchema>): Location {
  const config = getConfig();
  const storage = getStorage();

  const existing = storage.getLocation(config.workspace.id, input.name);
  if (!existing) {
    throw new Error(`Location not found: ${input.name}`);
  }

  const updated: Location = {
    ...existing,
    ...input.updates,
    updatedAt: new Date().toISOString(),
  };

  storage.saveLocation(updated);
  return updated;
}

// Format location for display
export function formatLocationSummary(location: Location): string {
  const lines: string[] = [];

  lines.push(`# ${location.name}`);
  if (location.type) lines.push(`**Type:** ${location.type}`);
  if (location.parentLocationName) lines.push(`**Part of:** ${location.parentLocationName}`);
  if (location.region) lines.push(`**Region:** ${location.region}`);

  if (location.description) {
    lines.push(`\n## Description\n${location.description}`);
  }

  if (location.atmosphere) {
    lines.push(`\n## Atmosphere\n${location.atmosphere}`);
  }

  if (location.history) {
    lines.push(`\n## History\n${location.history}`);
  }

  if (location.features?.length) {
    lines.push('\n## Notable Features');
    location.features.forEach(f => lines.push(`- ${f}`));
  }

  if (location.inhabitants?.length) {
    lines.push('\n## Inhabitants');
    location.inhabitants.forEach(i => lines.push(`- ${i}`));
  }

  return lines.join('\n');
}
