/**
 * Core types for MemoryQuill canon entities
 * Mirrors the D1 database schema for local caching
 */

export interface Character {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  aliases?: string[];

  // Physical description
  appearance?: {
    age?: string;
    height?: string;
    build?: string;
    hair?: string;
    eyes?: string;
    distinguishingFeatures?: string[];
    clothing?: string;
  };

  // Personality & background
  personality?: string;
  background?: string;
  motivations?: string[];
  fears?: string[];
  secrets?: string[];

  // Voice & speech patterns
  speechPatterns?: {
    vocabulary?: string; // e.g., "formal", "crude", "archaic"
    quirks?: string[];
    catchphrases?: string[];
  };

  // Story role
  role?: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  faction?: string;
  occupation?: string;
  status?: 'alive' | 'deceased' | 'unknown';

  // Relationships (references to other character IDs)
  relationships?: Relationship[];

  // Media
  portraitUrl?: string;
  galleryUrls?: string[];

  // Metadata
  firstAppearance?: string; // chapter slug
  createdAt: string;
  updatedAt: string;
}

export interface Relationship {
  targetId: string;
  targetName: string;
  type: 'ally' | 'rival' | 'mentor' | 'student' | 'family' | 'romantic' | 'enemy' | 'neutral';
  description?: string;
  since?: string; // chapter slug where relationship started
}

export interface Location {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  aliases?: string[];

  // Geography
  type?: 'city' | 'town' | 'village' | 'building' | 'room' | 'region' | 'landmark' | 'natural';
  parentLocationId?: string;
  parentLocationName?: string;
  region?: string;

  // Description
  description?: string;
  atmosphere?: string;
  history?: string;

  // Notable features
  features?: string[];
  inhabitants?: string[]; // character names or factions

  // Media
  imageUrl?: string;
  mapUrl?: string;

  // Metadata
  firstAppearance?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  subtitle?: string;

  // Position in story
  number?: number;
  arc?: string;
  volume?: string;

  // Content
  summary?: string;
  content?: string; // Full markdown content
  wordCount?: number;

  // Scene breakdown
  scenes?: Scene[];

  // Characters & locations in this chapter
  featuredCharacters?: string[];
  featuredLocations?: string[];

  // POV
  povCharacter?: string;
  povType?: 'first' | 'third-limited' | 'third-omniscient';

  // Status
  status: 'outline' | 'draft' | 'revision' | 'final' | 'published';

  // Media
  headerImageUrl?: string;

  // Metadata
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface Scene {
  id: string;
  chapterId: string;
  sequence: number;

  // Content
  title?: string;
  summary?: string;
  content?: string;

  // Context
  location?: string;
  timeOfDay?: string;
  povCharacter?: string;
  charactersPresent?: string[];

  // Narrative
  mood?: string;
  tension?: 'low' | 'medium' | 'high' | 'climax';
  purpose?: string; // What this scene accomplishes
}

export interface TimelineEvent {
  id: string;
  workspaceId: string;

  // Timing
  date?: string; // In-world date
  sequence: number; // For ordering
  era?: string;

  // Event details
  title: string;
  description?: string;

  // Connections
  characters?: string[];
  locations?: string[];
  chapterRef?: string;

  // Categorization
  type?: 'plot' | 'backstory' | 'world' | 'character';
  significance?: 'minor' | 'major' | 'pivotal';

  createdAt: string;
  updatedAt: string;
}

export interface LoreEntry {
  id: string;
  workspaceId: string;
  slug: string;

  // Categorization
  category: 'magic' | 'technology' | 'culture' | 'history' | 'religion' | 'politics' | 'species' | 'item' | 'other';

  // Content
  title: string;
  content: string;

  // Connections
  relatedCharacters?: string[];
  relatedLocations?: string[];

  createdAt: string;
  updatedAt: string;
}

// Draft system for local-first editing
export interface Draft {
  id: string;
  entityType: 'chapter' | 'character' | 'location' | 'lore';
  entityId?: string; // null if creating new

  content: string; // JSON or markdown depending on type

  // Sync status
  baseVersion?: string; // Hash of remote version when draft started
  localChanges: boolean;

  createdAt: string;
  updatedAt: string;
}

// Sync tracking
export interface SyncState {
  entityType: string;
  entityId: string;
  localHash: string;
  remoteHash?: string;
  status: 'synced' | 'local_ahead' | 'remote_ahead' | 'conflict';
  lastSyncAt?: string;
}
