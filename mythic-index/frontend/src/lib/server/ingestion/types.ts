/**
 * Type definitions for content ingestion
 */

// ============================================================================
// Character Types
// ============================================================================

/**
 * YAML frontmatter structure for character profile markdown files
 */
export interface CharacterFrontmatter {
  /** Full character name */
  name: string;
  /** Alternative names or nicknames */
  aliases?: string[];
  /** Character's species or race */
  race?: string;
  /** Character's class or profession */
  class?: string;
  /** Character's narrative role */
  role?: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | string;
}

/**
 * Physical appearance characteristics of a character
 */
export interface CharacterAppearance {
  /** Apparent age or age description */
  age?: string;
  /** Height description */
  height?: string;
  /** Body build or physique */
  build?: string;
  /** Hair color and style */
  hair?: string;
  /** Eye color and description */
  eyes?: string;
  /** Notable scars, tattoos, or unique features */
  distinguishingFeatures?: string[];
  /** Typical clothing style */
  clothing?: string;
}

/**
 * Personality and psychological traits of a character
 */
export interface CharacterPersonality {
  /** Character archetype (e.g., "The Mentor", "The Hero") */
  archetype?: string;
  /** General temperament or disposition */
  temperament?: string;
  /** List of positive character traits */
  positiveTraits?: string[];
  /** List of negative character traits or flaws */
  negativeTraits?: string[];
  /** Moral alignment or ethical stance */
  moralAlignment?: string;
}

/**
 * Combat capabilities and fighting style
 */
export interface CharacterCombat {
  /** Primary weapons used in combat */
  primaryWeapons?: string;
  /** Overall fighting approach or style */
  fightingStyle?: string;
  /** Role in tactical/group combat situations */
  tacticalRole?: string;
}

/**
 * Voice and dialogue characteristics
 */
export interface CharacterVoice {
  /** How the character speaks (formal, casual, etc.) */
  speechStyle?: string;
  /** Memorable phrases or catchphrases */
  signaturePhrases?: string[];
}

/**
 * Complete parsed character profile data from markdown files
 */
export interface ParsedCharacter {
  /** URL-friendly identifier */
  slug: string;
  /** Parsed frontmatter data */
  frontmatter: CharacterFrontmatter;
  /** Character's full name */
  name: string;
  /** Alternative names */
  aliases: string[];
  /** Character's species or race */
  race?: string;
  /** Character's class or profession */
  characterClass?: string;
  /** Narrative role */
  role?: string;
  /** Current status (alive, dead, unknown) */
  status: string;
  /** Chapter/scene of first appearance */
  firstAppearance?: string;
  /** Physical appearance details */
  appearance: CharacterAppearance;
  /** Brief visual description for imagery */
  visualSummary?: string;
  /** Personality traits */
  personality: CharacterPersonality;
  /** Character's backstory */
  background?: string;
  /** What drives the character */
  motivations: string[];
  /** Character's fears */
  fears: string[];
  /** Hidden information about the character */
  secrets: string[];
  /** Combat-related information */
  combat: CharacterCombat;
  /** Voice and dialogue characteristics */
  voice: CharacterVoice;
  /** Faction or group affiliation */
  faction?: string;
  /** Current occupation or role */
  occupation?: string;
  /** Additional notes */
  notes?: string;
}

/**
 * Relationship between two characters
 */
export interface ParsedRelationship {
  /** Slug of the target character */
  targetSlug: string;
  /** Name of the target character */
  targetName: string;
  /** Type of relationship */
  relationshipType:
    | 'ally'
    | 'rival'
    | 'mentor'
    | 'student'
    | 'family'
    | 'romantic'
    | 'enemy'
    | 'neutral';
  /** Textual description of the relationship */
  description?: string;
  /** Relationship strength (1-10) */
  strength?: number;
}

// ============================================================================
// Location Types
// ============================================================================

/**
 * YAML frontmatter structure for location overview markdown files
 */
export interface LocationFrontmatter {
  /** Location name */
  name: string;
  /** Type of location */
  type?:
    | 'city'
    | 'town'
    | 'village'
    | 'building'
    | 'room'
    | 'region'
    | 'landmark'
    | 'natural'
    | string;
  /** Geographic region or area */
  region?: string;
  /** Narrative or historical significance */
  significance?: string;
  /** General mood or feeling of the location */
  atmosphere?: string;
}

/**
 * Complete parsed location data from markdown files
 */
export interface ParsedLocation {
  /** URL-friendly identifier */
  slug: string;
  /** Parsed frontmatter data */
  frontmatter: LocationFrontmatter;
  /** Location name */
  name: string;
  /** Classification of location (city, building, etc.) */
  locationType?: string;
  /** Geographic region */
  region?: string;
  /** Parent location (for nested locations) */
  parentLocation?: string;
  /** Brief overview description */
  quickDescription?: string;
  /** Visual description for imagery */
  visualSummary?: string;
  /** Mood and ambiance */
  atmosphere?: string;
  /** Historical background */
  history?: string;
  /** Notable features and landmarks */
  notableLandmarks: string[];
  /** Important people associated with the location */
  keyPersonnel: string[];
  /** Plot relevance and symbolic meaning */
  storyRole?: string;
  /** Environmental hazards and dangers */
  hazardsDangers: string[];
  /** Connected locations (slugs or names) */
  connections: string[];
  /** Access restrictions and hidden paths */
  accessibility?: string;
  /** Narrative importance level (High/Medium/Low) */
  significanceLevel?: string;
  /** Chapter slug where location first appears */
  firstAppearance?: string;
}

// ============================================================================
// Chapter Types
// ============================================================================

/**
 * YAML frontmatter structure for chapter content markdown files
 */
export interface ChapterFrontmatter {
  /** Chapter title */
  title: string;
  /** Sequential chapter number */
  chapter_number: number;
  /** Type of chapter (main, interlude, epilogue, etc.) */
  chapter_type?: string;
  /** Total word count */
  word_count?: number;
  /** URL slug override */
  chapter_slug?: string;
  /** Publication status (draft, published, etc.) */
  status?: string;
  /** POV character slug */
  pov_character?: string;
  /** Canon level (alpha, beta, etc.) */
  canon_level?: string;
  /** Characters appearing in this chapter */
  key_characters?: string[];
  /** Locations featured in this chapter */
  key_locations?: string[];
  /** Timeline reference point */
  timeline_anchor?: string;
  /** Major plot events in this chapter */
  major_events?: string[];
  /** Thematic motifs present */
  motifs?: string[];
}

/**
 * Scene marker parsed from HTML comments in chapter content
 * Format: <!-- SCENE-START id:xxx title:"xxx" ... -->
 */
export interface SceneMarker {
  /** Scene identifier (e.g., "sc01") */
  id: string;
  /** Scene title or description */
  title: string;
  /** Temporal setting */
  when?: string;
  /** Location slug */
  location?: string;
  /** Primary zone slug within the location */
  primaryZone?: string;
  /** Additional zone slugs referenced in this scene */
  locationZones?: string[];
  /** Character slugs present in scene */
  characters: string[];
  /** Scene tags (action, dialogue, etc.) */
  tags: string[];
  /** Image filenames for this scene */
  images: string[];
  /** Scene content (markdown between markers) */
  content: string;
  /** Word count for this scene */
  wordCount: number;
}

/**
 * Complete parsed chapter data from markdown files
 */
export interface ParsedChapter {
  /** URL-friendly identifier */
  slug: string;
  /** Parsed frontmatter data */
  frontmatter: ChapterFrontmatter;
  /** Chapter title */
  title: string;
  /** Sequential chapter number */
  chapterNumber: number;
  /** Publication status */
  status: string;
  /** POV character slug */
  povCharacter?: string;
  /** Characters appearing in chapter */
  keyCharacters: string[];
  /** Locations in chapter */
  keyLocations: string[];
  /** Timeline reference */
  timelineAnchor?: string;
  /** Major plot events */
  majorEvents: string[];
  /** Thematic motifs */
  motifs: string[];
  /** Canon level */
  canonLevel?: string;
  /** Parsed scene markers */
  scenes: SceneMarker[];
  /** Full markdown content */
  fullContent: string;
  /** Total word count */
  wordCount: number;
}

// ============================================================================
// Ingestion Options
// ============================================================================

/**
 * Configuration options for content ingestion process
 */
export interface IngestOptions {
  /** Target workspace ID */
  workspaceId: string;
  /** Path to content directory containing markdown files */
  contentDir: string;
  /** If true, parse but don't write to database */
  dryRun?: boolean;
  /** Optional callback for progress updates */
  onProgress?: (message: string) => void;
}

/**
 * Result of content ingestion operation
 */
export interface IngestResult {
  /** Whether ingestion completed without errors */
  success: boolean;
  /** List of error messages encountered */
  errors: string[];
  /** Statistics about processed content */
  stats: {
    /** Number of characters processed */
    charactersProcessed: number;
    /** Number of locations processed */
    locationsProcessed: number;
    /** Number of chapters processed */
    chaptersProcessed: number;
    /** Number of scenes processed */
    scenesProcessed: number;
    /** Number of relationships processed */
    relationshipsProcessed: number;
  };
}
