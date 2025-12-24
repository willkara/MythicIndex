/**
 * Type definitions for content ingestion
 */

// ============================================================================
// Character Types
// ============================================================================

export interface CharacterFrontmatter {
  name: string;
  aliases?: string[];
  race?: string;
  class?: string;
  role?: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | string;
}

export interface CharacterAppearance {
  age?: string;
  height?: string;
  build?: string;
  hair?: string;
  eyes?: string;
  distinguishingFeatures?: string[];
  clothing?: string;
}

export interface CharacterPersonality {
  archetype?: string;
  temperament?: string;
  positiveTraits?: string[];
  negativeTraits?: string[];
  moralAlignment?: string;
}

export interface CharacterCombat {
  primaryWeapons?: string;
  fightingStyle?: string;
  tacticalRole?: string;
}

export interface CharacterVoice {
  speechStyle?: string;
  signaturePhrases?: string[];
}

export interface ParsedCharacter {
  slug: string;
  frontmatter: CharacterFrontmatter;
  name: string;
  aliases: string[];
  race?: string;
  characterClass?: string;
  role?: string;
  status: string;
  firstAppearance?: string;
  appearance: CharacterAppearance;
  visualSummary?: string;
  personality: CharacterPersonality;
  background?: string;
  motivations: string[];
  fears: string[];
  secrets: string[];
  combat: CharacterCombat;
  voice: CharacterVoice;
  faction?: string;
  occupation?: string;
  notes?: string;
}

export interface ParsedRelationship {
  targetSlug: string;
  targetName: string;
  relationshipType:
    | 'ally'
    | 'rival'
    | 'mentor'
    | 'student'
    | 'family'
    | 'romantic'
    | 'enemy'
    | 'neutral';
  description?: string;
  strength?: number;
}

// ============================================================================
// Location Types
// ============================================================================

export interface LocationFrontmatter {
  name: string;
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
  region?: string;
  significance?: string;
  atmosphere?: string;
}

export interface ParsedLocation {
  slug: string;
  frontmatter: LocationFrontmatter;
  name: string;
  locationType?: string;
  region?: string;
  parentLocation?: string;
  quickDescription?: string;
  visualSummary?: string;
  atmosphere?: string;
  history?: string;
  notableLandmarks: string[];
  keyPersonnel: string[];
  // Extended fields for rich location content
  storyRole?: string; // Plot relevance, symbolic meaning - prose
  hazardsDangers: string[]; // Array of hazards
  connections: string[]; // Array of connected location slugs/names
  accessibility?: string; // Access restrictions, hidden paths - prose
  significanceLevel?: string; // High/Medium/Low
  firstAppearance?: string; // Chapter slug reference
}

// ============================================================================
// Chapter Types
// ============================================================================

export interface ChapterFrontmatter {
  title: string;
  chapter_number: number;
  chapter_type?: string;
  word_count?: number;
  chapter_slug?: string;
  status?: string;
  pov_character?: string;
  canon_level?: string;
  key_characters?: string[];
  key_locations?: string[];
  timeline_anchor?: string;
  major_events?: string[];
  motifs?: string[];
}

export interface SceneMarker {
  id: string;
  title: string;
  when?: string;
  location?: string;
  characters: string[];
  tags: string[];
  images: string[];
  content: string;
  wordCount: number;
}

export interface ParsedChapter {
  slug: string;
  frontmatter: ChapterFrontmatter;
  title: string;
  chapterNumber: number;
  status: string;
  povCharacter?: string;
  keyCharacters: string[];
  keyLocations: string[];
  timelineAnchor?: string;
  majorEvents: string[];
  motifs: string[];
  canonLevel?: string;
  scenes: SceneMarker[];
  fullContent: string;
  wordCount: number;
}

// ============================================================================
// Ingestion Options
// ============================================================================

export interface IngestOptions {
  workspaceId: string;
  contentDir: string;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

export interface IngestResult {
  success: boolean;
  errors: string[];
  stats: {
    charactersProcessed: number;
    locationsProcessed: number;
    chaptersProcessed: number;
    scenesProcessed: number;
    relationshipsProcessed: number;
  };
}
