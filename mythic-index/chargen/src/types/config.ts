/**
 * Configuration types for chargen CLI
 */

/**
 * Main configuration interface for the chargen CLI application
 */
export interface Config {
  workspace: WorkspaceConfig;
  remote: RemoteConfig;
  imageGeneration: ImageGenerationConfig;
  artStyle: ArtStyleConfig;
  editor: EditorConfig;
  writing: WritingConfig;
  paths: PathConfig;
}

/**
 * Workspace configuration for identifying the current workspace
 */
export interface WorkspaceConfig {
  id: string;
  name: string;
  slug: string;
}

/**
 * Remote API configuration for syncing with backend services
 */
export interface RemoteConfig {
  apiUrl: string;
  apiKey: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
}

/**
 * Image generation configuration for AI provider settings
 */
export interface ImageGenerationConfig {
  defaultProvider: 'openai' | 'google';
  providers: {
    openai?: {
      apiKey: string;
      model: string;
      defaultSize: string;
      defaultQuality: 'standard' | 'hd';
    };
    google?: {
      apiKey: string;
      model: string;
      defaultAspectRatio?: string;
      defaultImageSize?: string;
      defaultResponseMimeType?: string;
      defaultTemperature?: number;
      defaultTopP?: number;
      defaultTopK?: number;
      defaultCandidateCount?: number;
      defaultSeed?: number;
      safetySettings?: Array<{
        category: string;
        threshold: string;
        method?: string;
      }>;
    };
  };
}

/**
 * Master style configuration for global art direction
 */
export interface MasterStyleConfig {
  universalSuffix: string;
  scenarios: {
    character?: string;
    location?: string;
    exterior?: string;
    scene?: string;
  };
  artistReferences?: string[];
  useArtistReferences?: boolean;
}

/**
 * Art style configuration for image generation styling
 */
export interface ArtStyleConfig {
  description: string;
  negativePrompts: string[];
  referenceImages: string[];
  masterStyle?: MasterStyleConfig;
}

/**
 * Editor configuration for opening files in external editors
 */
export interface EditorConfig {
  command: string;
  markdownPreview: boolean;
}

/**
 * Writing configuration for default narrative settings
 */
export interface WritingConfig {
  defaultPov: 'first' | 'third-limited' | 'third-omniscient';
  chapterWordTarget: number;
  sceneSeparator: string;
}

/**
 * Path configuration for file system locations
 */
export interface PathConfig {
  configDir: string;
  cacheDb: string;
  draftsDir: string;
  imagesDir: string;
}

/**
 * Default configuration values for the chargen CLI
 */
export const DEFAULT_CONFIG: Partial<Config> = {
  remote: {
    apiUrl: '',
    apiKey: '',
    autoSync: true,
    syncIntervalMinutes: 5,
  },
  imageGeneration: {
    defaultProvider: 'google',
    providers: {
      google: {
        apiKey: '',
        model: 'gemini-3-pro-image-preview',
        defaultAspectRatio: '1:1',
        defaultImageSize: '1K',
        defaultResponseMimeType: 'image/png',
        defaultTemperature: 1.0,
        defaultTopP: 0.95,
        defaultTopK: 64,
        defaultCandidateCount: 1,
      },
      openai: {
        apiKey: '',
        model: 'gpt-image-1.5',
        defaultSize: '1024x1024',
        defaultQuality: 'standard',
      },
    },
  },
  artStyle: {
    description: 'Fantasy illustration, detailed, dramatic lighting',
    negativePrompts: [
      'cartoon',
      'anime',
      '3d render',
      'glossy',
      'plastic',
      'bright neon colors',
      'sketch',
      'pencil',
      'blurred',
      'low resolution',
      'watermark',
      'text',
      'distorted',
    ],
    referenceImages: [],
  },
  editor: {
    command: 'code',
    markdownPreview: true,
  },
  writing: {
    defaultPov: 'third-limited',
    chapterWordTarget: 3000,
    sceneSeparator: '* * *',
  },
};
