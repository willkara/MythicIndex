/**
 * Core types for canon entities
 */

/**
 * Character entity representing a person or being in the narrative
 */
export interface Character {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  aliases?: string[];

  appearance?: {
    age?: string;
    height?: string;
    build?: string;
    hair?: string;
    eyes?: string;
    distinguishingFeatures?: string[];
    clothing?: string;
  };

  personality?: string;
  background?: string;
  motivations?: string[];
  fears?: string[];
  secrets?: string[];

  speechPatterns?: {
    vocabulary?: string;
    quirks?: string[];
    catchphrases?: string[];
  };

  role?: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  faction?: string;
  occupation?: string;
  status?: 'alive' | 'deceased' | 'unknown';

  relationships?: Relationship[];

  portraitUrl?: string;
  galleryUrls?: string[];

  firstAppearance?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Relationship between two characters
 */
export interface Relationship {
  targetId: string;
  targetName: string;
  type: 'ally' | 'rival' | 'mentor' | 'student' | 'family' | 'romantic' | 'enemy' | 'neutral';
  description?: string;
  since?: string;
}

/**
 * Location entity representing a place in the narrative world
 */
export interface Location {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  aliases?: string[];

  type?: 'city' | 'town' | 'village' | 'building' | 'room' | 'region' | 'landmark' | 'natural';
  parentLocationId?: string;
  parentLocationName?: string;
  region?: string;

  description?: string;
  atmosphere?: string;
  history?: string;

  features?: string[];
  inhabitants?: string[];

  imageUrl?: string;
  mapUrl?: string;

  firstAppearance?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Chapter entity representing a narrative chapter
 */
export interface Chapter {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  subtitle?: string;

  number?: number;
  arc?: string;
  volume?: string;

  summary?: string;
  content?: string;
  wordCount?: number;

  scenes?: Scene[];

  featuredCharacters?: string[];
  featuredLocations?: string[];

  povCharacter?: string;
  povType?: 'first' | 'third-limited' | 'third-omniscient';

  status: 'outline' | 'draft' | 'revision' | 'final' | 'published';

  headerImageUrl?: string;

  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * Scene entity representing a narrative scene within a chapter
 */
export interface Scene {
  id: string;
  chapterId: string;
  sequence: number;

  title?: string;
  summary?: string;
  content?: string;

  location?: string;
  timeOfDay?: string;
  povCharacter?: string;
  charactersPresent?: string[];

  mood?: string;
  tension?: 'low' | 'medium' | 'high' | 'climax';
  purpose?: string;
}
