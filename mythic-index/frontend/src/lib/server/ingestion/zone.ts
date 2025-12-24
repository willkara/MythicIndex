/**
 * Zone parsing module
 * Parses location zones.yaml files containing zone metadata
 */

import * as yaml from 'yaml';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Connected zone relationship
 */
export interface ConnectedZone {
  slug: string;
  relationship: string;
  description?: string;
}

/**
 * Light conditions for a zone
 */
export interface LightConditions {
  natural?: string;
  artificial?: string;
}

/**
 * Parsed zone data from zones.yaml
 */
export interface ParsedZone {
  slug: string;
  name: string;
  zoneType?: string; // perimeter|threshold|heart|forge|liminal|sanctuary

  // Spatial
  locationWithin?: string;
  parentZoneSlug?: string | null;
  connectedZones?: ConnectedZone[];

  // Descriptions
  physicalDescription?: string;
  narrativeFunction?: string;
  emotionalRegister?: string;

  // Details
  signatureDetails?: string[];
  lightConditions?: LightConditions;
  moodAffinity?: string[];

  // Story integration
  characterAssociations?: string[];
  firstAppearance?: string;
  storySignificance?: string; // high|medium|low

  // Media
  imagerySlugs?: string[];
}

/**
 * Metadata section from zones.yaml
 */
export interface ZonesMetadata {
  locationSlug: string;
  locationName: string;
  zoneCount?: number;
  lastUpdated?: string;
}

/**
 * Complete parsed zones.yaml file
 */
export interface ParsedZonesFile {
  metadata: ZonesMetadata;
  zones: ParsedZone[];
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Parse zones.yaml file content
 *
 * @param content - Raw YAML file content
 * @param locationSlug - Location slug for validation
 * @returns Parsed zones file data or null if invalid
 */
export function parseZonesYaml(content: string, locationSlug?: string): ParsedZonesFile | null {
  try {
    const data = yaml.parse(content);

    if (!data || typeof data !== 'object') {
      console.error('zones.yaml: Invalid YAML structure');
      return null;
    }

    // Parse metadata
    const metadata: ZonesMetadata = {
      locationSlug: data.metadata?.location_slug || locationSlug || '',
      locationName: data.metadata?.location_name || '',
      zoneCount: data.metadata?.zone_count,
      lastUpdated: data.metadata?.last_updated,
    };

    // Validate metadata
    if (!metadata.locationSlug) {
      console.error('zones.yaml: Missing location_slug in metadata');
      return null;
    }

    // Validate location_slug matches directory if provided
    if (locationSlug && metadata.locationSlug !== locationSlug) {
      console.warn(
        `zones.yaml: location_slug mismatch (expected: ${locationSlug}, got: ${metadata.locationSlug})`
      );
    }

    // Parse zones array
    const zones: ParsedZone[] = [];
    const rawZones = data.zones;

    if (!Array.isArray(rawZones)) {
      console.error('zones.yaml: zones field must be an array');
      return null;
    }

    for (const rawZone of rawZones) {
      if (!rawZone || typeof rawZone !== 'object') {
        console.warn('zones.yaml: Skipping invalid zone entry');
        continue;
      }

      // Required fields
      if (!rawZone.slug || !rawZone.name) {
        console.warn('zones.yaml: Skipping zone missing slug or name');
        continue;
      }

      const zone: ParsedZone = {
        slug: rawZone.slug,
        name: rawZone.name,
        zoneType: rawZone.zone_type,

        // Spatial
        locationWithin: rawZone.location_within,
        parentZoneSlug: rawZone.parent_zone_slug ?? null,
        connectedZones: parseConnectedZones(rawZone.connected_zones),

        // Descriptions
        physicalDescription: rawZone.physical_description,
        narrativeFunction: rawZone.narrative_function,
        emotionalRegister: rawZone.emotional_register,

        // Details
        signatureDetails: parseStringArray(rawZone.signature_details),
        lightConditions: parseLightConditions(rawZone.light_conditions),
        moodAffinity: parseStringArray(rawZone.mood_affinity),

        // Story integration
        characterAssociations: parseStringArray(rawZone.character_associations),
        firstAppearance: rawZone.first_appearance,
        storySignificance: rawZone.story_significance,

        // Media
        imagerySlugs: parseStringArray(rawZone.imagery_slugs),
      };

      zones.push(zone);
    }

    return {
      metadata,
      zones,
    };
  } catch (error) {
    console.error('zones.yaml: Parse error:', error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse connected zones array
 */
function parseConnectedZones(value: unknown): ConnectedZone[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const connected: ConnectedZone[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && 'slug' in item && 'relationship' in item) {
      connected.push({
        slug: item.slug as string,
        relationship: item.relationship as string,
        description: item.description as string | undefined,
      });
    }
  }

  return connected.length > 0 ? connected : undefined;
}

/**
 * Parse light conditions object
 */
function parseLightConditions(value: unknown): LightConditions | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const conditions: LightConditions = {};
  const obj = value as Record<string, unknown>;

  if (typeof obj.natural === 'string') {
    conditions.natural = obj.natural;
  }
  if (typeof obj.artificial === 'string') {
    conditions.artificial = obj.artificial;
  }

  return Object.keys(conditions).length > 0 ? conditions : undefined;
}

/**
 * Parse string array field
 */
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const result = value.filter(item => typeof item === 'string');
  return result.length > 0 ? result : undefined;
}

/**
 * Validate zone slug format
 * Zone slugs should be kebab-case
 */
export function validateZoneSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Validate zone type enum
 */
export function validateZoneType(zoneType: string): boolean {
  const validTypes = ['perimeter', 'threshold', 'heart', 'forge', 'liminal', 'sanctuary'];
  return validTypes.includes(zoneType);
}

/**
 * Validate story significance enum
 */
export function validateStorySignificance(significance: string): boolean {
  const validLevels = ['high', 'medium', 'low'];
  return validLevels.includes(significance);
}
