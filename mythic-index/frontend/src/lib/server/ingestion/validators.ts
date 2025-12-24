/**
 * Zod validation schemas for content ingestion
 */

import { z } from 'zod';

// ============================================================================
// Character Validators
// ============================================================================

/**
 * Zod schema for validating character frontmatter from YAML
 * Allows passthrough for additional custom fields
 */
export const characterFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    aliases: z.array(z.string()).optional().default([]),
    race: z.string().optional(),
    class: z.string().optional(),
    role: z.enum(['protagonist', 'antagonist', 'supporting', 'minor']).optional(),
  })
  .passthrough();

/**
 * Zod schema for validating character appearance data
 */
export const characterAppearanceSchema = z.object({
  age: z.string().optional(),
  height: z.string().optional(),
  build: z.string().optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  distinguishingFeatures: z.array(z.string()).optional().default([]),
  clothing: z.string().optional(),
});

/**
 * Zod schema for validating character personality traits
 */
export const characterPersonalitySchema = z.object({
  archetype: z.string().optional(),
  temperament: z.string().optional(),
  positiveTraits: z.array(z.string()).optional().default([]),
  negativeTraits: z.array(z.string()).optional().default([]),
  moralAlignment: z.string().optional(),
});

/**
 * Zod schema for validating character combat information
 */
export const characterCombatSchema = z.object({
  primaryWeapons: z.string().optional(),
  fightingStyle: z.string().optional(),
  tacticalRole: z.string().optional(),
});

/**
 * Zod schema for validating character voice and dialogue characteristics
 */
export const characterVoiceSchema = z.object({
  speechStyle: z.string().optional(),
  signaturePhrases: z.array(z.string()).optional().default([]),
});

/**
 * Zod schema for validating complete parsed character data
 * Used to validate character profiles after parsing from markdown
 */
export const parsedCharacterSchema = z.object({
  slug: z.string().min(1),
  frontmatter: characterFrontmatterSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  race: z.string().optional(),
  characterClass: z.string().optional(),
  role: z.string().optional(),
  status: z.string().default('alive'),
  firstAppearance: z.string().optional(),
  appearance: characterAppearanceSchema,
  visualSummary: z.string().optional(),
  personality: characterPersonalitySchema,
  background: z.string().optional(),
  motivations: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  combat: characterCombatSchema,
  voice: characterVoiceSchema,
  faction: z.string().optional(),
  occupation: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Zod schema for validating relationship types between characters
 */
export const relationshipTypeSchema = z.enum([
  'ally',
  'rival',
  'mentor',
  'student',
  'family',
  'romantic',
  'enemy',
  'neutral',
]);

/**
 * Zod schema for validating character relationships
 */
export const parsedRelationshipSchema = z.object({
  targetSlug: z.string().min(1),
  targetName: z.string().min(1),
  relationshipType: relationshipTypeSchema,
  description: z.string().optional(),
  strength: z.number().min(1).max(10).optional(),
});

// ============================================================================
// Location Validators
// ============================================================================

/**
 * Zod schema for validating location types
 */
export const locationTypeSchema = z.enum([
  'city',
  'town',
  'village',
  'building',
  'room',
  'region',
  'landmark',
  'natural',
]);

/**
 * Zod schema for validating location frontmatter from YAML
 * Allows passthrough for additional custom fields
 */
export const locationFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    type: locationTypeSchema.optional(),
    region: z.string().optional(),
    significance: z.string().optional(),
    atmosphere: z.string().optional(),
  })
  .passthrough();

/**
 * Zod schema for validating complete parsed location data
 * Used to validate location profiles after parsing from markdown
 */
export const parsedLocationSchema = z.object({
  slug: z.string().min(1),
  frontmatter: locationFrontmatterSchema,
  name: z.string().min(1),
  locationType: z.string().optional(),
  region: z.string().optional(),
  parentLocation: z.string().optional(),
  quickDescription: z.string().optional(),
  visualSummary: z.string().optional(),
  atmosphere: z.string().optional(),
  history: z.string().optional(),
  notableLandmarks: z.array(z.string()).default([]),
  keyPersonnel: z.array(z.string()).default([]),
});

// ============================================================================
// Zone Validators
// ============================================================================

/**
 * Zod schema for validating zone types
 */
export const zoneTypeSchema = z.enum([
  'perimeter',
  'threshold',
  'heart',
  'forge',
  'liminal',
  'sanctuary',
]);

/**
 * Zod schema for validating story significance levels
 */
export const storySignificanceSchema = z.enum(['high', 'medium', 'low']);

/**
 * Zod schema for validating connected zone relationships
 */
export const connectedZoneSchema = z.object({
  slug: z.string().min(1),
  relationship: z.string().min(1),
  description: z.string().optional(),
});

/**
 * Zod schema for validating light conditions
 */
export const lightConditionsSchema = z.object({
  natural: z.string().optional(),
  artificial: z.string().optional(),
});

/**
 * Zod schema for validating individual zone data
 */
export const parsedZoneSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Zone slug must be kebab-case'),
  name: z.string().min(1),
  zoneType: zoneTypeSchema.optional(),

  // Spatial
  locationWithin: z.string().optional(),
  parentZoneSlug: z.string().nullable().optional(),
  connectedZones: z.array(connectedZoneSchema).optional(),

  // Descriptions
  physicalDescription: z.string().optional(),
  narrativeFunction: z.string().optional(),
  emotionalRegister: z.string().optional(),

  // Details
  signatureDetails: z.array(z.string()).optional(),
  lightConditions: lightConditionsSchema.optional(),
  moodAffinity: z.array(z.string()).optional(),

  // Story integration
  characterAssociations: z.array(z.string()).optional(),
  firstAppearance: z.string().optional(),
  storySignificance: storySignificanceSchema.optional(),

  // Media
  imagerySlugs: z.array(z.string()).optional(),
});

/**
 * Zod schema for validating zones.yaml metadata section
 */
export const zonesMetadataSchema = z.object({
  locationSlug: z.string().min(1),
  locationName: z.string().min(1),
  zoneCount: z.number().int().optional(),
  lastUpdated: z.string().optional(),
});

/**
 * Zod schema for validating complete zones.yaml file
 */
export const parsedZonesFileSchema = z.object({
  metadata: zonesMetadataSchema,
  zones: z.array(parsedZoneSchema),
});

/**
 * Validation error type for zone validation
 */
export interface ZoneValidationError {
  zoneSlug?: string;
  field: string;
  message: string;
}

/**
 * Validate zones.yaml structure and content
 *
 * @param data - Parsed zones file data
 * @param locationSlug - Expected location slug for validation
 * @returns Array of validation errors (empty if valid)
 */
export function validateZonesYaml(
  data: unknown,
  locationSlug: string
): ZoneValidationError[] {
  const errors: ZoneValidationError[] = [];

  try {
    // Validate overall structure with Zod
    const result = parsedZonesFileSchema.safeParse(data);

    if (!result.success) {
      result.error.errors.forEach(err => {
        errors.push({
          field: err.path.join('.'),
          message: err.message,
        });
      });
      return errors;
    }

    const validData = result.data;

    // Check location slug matches
    if (validData.metadata.locationSlug !== locationSlug) {
      errors.push({
        field: 'metadata.locationSlug',
        message: `Location slug mismatch (expected: ${locationSlug}, got: ${validData.metadata.locationSlug})`,
      });
    }

    // Check zone_count matches actual zone count
    if (
      validData.metadata.zoneCount !== undefined &&
      validData.metadata.zoneCount !== validData.zones.length
    ) {
      errors.push({
        field: 'metadata.zoneCount',
        message: `Zone count mismatch (metadata: ${validData.metadata.zoneCount}, actual: ${validData.zones.length})`,
      });
    }

    // Check for duplicate zone slugs
    const slugs = new Set<string>();
    for (const zone of validData.zones) {
      if (slugs.has(zone.slug)) {
        errors.push({
          zoneSlug: zone.slug,
          field: 'slug',
          message: `Duplicate zone slug: ${zone.slug}`,
        });
      }
      slugs.add(zone.slug);
    }

    // Validate parent zone references exist
    for (const zone of validData.zones) {
      if (zone.parentZoneSlug && !slugs.has(zone.parentZoneSlug)) {
        errors.push({
          zoneSlug: zone.slug,
          field: 'parentZoneSlug',
          message: `Parent zone not found: ${zone.parentZoneSlug}`,
        });
      }
    }

    // Validate connected zone references exist
    for (const zone of validData.zones) {
      if (zone.connectedZones) {
        for (const connected of zone.connectedZones) {
          if (!slugs.has(connected.slug)) {
            errors.push({
              zoneSlug: zone.slug,
              field: 'connectedZones',
              message: `Connected zone not found: ${connected.slug}`,
            });
          }
        }
      }
    }
  } catch (error) {
    errors.push({
      field: 'root',
      message: `Unexpected validation error: ${error}`,
    });
  }

  return errors;
}

/**
 * Validate scene zone references against available zones
 *
 * @param primaryZone - Primary zone slug from scene marker
 * @param locationZones - Array of additional zone slugs from scene marker
 * @param availableZones - Set of valid zone slugs for the location
 * @returns Array of error messages (empty if valid)
 */
export function validateSceneZones(
  primaryZone: string | undefined,
  locationZones: string[] | undefined,
  availableZones: Set<string>
): string[] {
  const errors: string[] = [];

  if (primaryZone && !availableZones.has(primaryZone)) {
    errors.push(`Primary zone not found in location: ${primaryZone}`);
  }

  if (locationZones) {
    for (const zoneSlug of locationZones) {
      if (!availableZones.has(zoneSlug)) {
        errors.push(`Zone not found in location: ${zoneSlug}`);
      }
    }
  }

  return errors;
}

// ============================================================================
// Chapter Validators
// ============================================================================

/**
 * Zod schema for validating chapter frontmatter from YAML
 * Allows passthrough for additional custom fields
 */
export const chapterFrontmatterSchema = z
  .object({
    title: z.string().min(1),
    chapter_number: z.number().int().positive(),
    chapter_type: z.string().optional(),
    word_count: z.number().int().optional(),
    chapter_slug: z.string().optional(),
    status: z.string().optional(),
    pov_character: z.string().optional(),
    canon_level: z.string().optional(),
    key_characters: z.array(z.string()).optional().default([]),
    key_locations: z.array(z.string()).optional().default([]),
    timeline_anchor: z.string().optional(),
    major_events: z.array(z.string()).optional().default([]),
    motifs: z.array(z.string()).optional().default([]),
  })
  .passthrough();

/**
 * Zod schema for validating scene markers parsed from HTML comments
 * Format: <!-- SCENE-START id:xxx title:"xxx" ... -->
 */
export const sceneMarkerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  when: z.string().optional(),
  location: z.string().optional(),
  characters: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  images: z.array(z.string()).default([]),
  content: z.string().default(''),
  wordCount: z.number().int().default(0),
});

/**
 * Zod schema for validating complete parsed chapter data
 * Used to validate chapters after parsing from markdown
 */
export const parsedChapterSchema = z.object({
  slug: z.string().min(1),
  frontmatter: chapterFrontmatterSchema,
  title: z.string().min(1),
  chapterNumber: z.number().int().positive(),
  status: z.string().default('draft'),
  povCharacter: z.string().optional(),
  keyCharacters: z.array(z.string()).default([]),
  keyLocations: z.array(z.string()).default([]),
  timelineAnchor: z.string().optional(),
  majorEvents: z.array(z.string()).default([]),
  motifs: z.array(z.string()).default([]),
  canonLevel: z.string().optional(),
  scenes: z.array(sceneMarkerSchema).default([]),
  fullContent: z.string().default(''),
  wordCount: z.number().int().default(0),
});

// ============================================================================
// Helper Types
// ============================================================================

/**
 * TypeScript type for character frontmatter, inferred from Zod schema
 */
export type CharacterFrontmatter = z.infer<typeof characterFrontmatterSchema>;

/**
 * TypeScript type for parsed character data, inferred from Zod schema
 */
export type ParsedCharacter = z.infer<typeof parsedCharacterSchema>;

/**
 * TypeScript type for character relationships, inferred from Zod schema
 */
export type ParsedRelationship = z.infer<typeof parsedRelationshipSchema>;

/**
 * TypeScript type for location frontmatter, inferred from Zod schema
 */
export type LocationFrontmatter = z.infer<typeof locationFrontmatterSchema>;

/**
 * TypeScript type for parsed location data, inferred from Zod schema
 */
export type ParsedLocation = z.infer<typeof parsedLocationSchema>;

/**
 * TypeScript type for chapter frontmatter, inferred from Zod schema
 */
export type ChapterFrontmatter = z.infer<typeof chapterFrontmatterSchema>;

/**
 * TypeScript type for scene markers, inferred from Zod schema
 */
export type SceneMarker = z.infer<typeof sceneMarkerSchema>;

/**
 * TypeScript type for parsed chapter data, inferred from Zod schema
 */
export type ParsedChapter = z.infer<typeof parsedChapterSchema>;
