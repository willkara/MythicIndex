/**
 * Configuration types for MemoryQuill MCP Server
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

export interface WorkspaceConfig {
  id: string;
  name: string;
  slug: string;
}

export interface RemoteConfig {
  apiUrl: string;
  apiKey: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
}

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
      /** Preferred aspect ratio for Gemini image generation (e.g., "4:5", "16:9"). */
      defaultAspectRatio?: string;
      /** Preferred image size for Gemini ("1K" | "2K" | "4K"). */
      defaultImageSize?: string;
      /** Default response MIME type for Gemini image output. */
      defaultResponseMimeType?: string;
      /** Default temperature for Gemini image generation. */
      defaultTemperature?: number;
      /** Default topP for Gemini image generation. */
      defaultTopP?: number;
      /** Default topK for Gemini image generation. */
      defaultTopK?: number;
      /** Default candidate count (Gemini image generation only supports 1). */
      defaultCandidateCount?: number;
      /** Optional default seed for deterministic Gemini outputs. */
      defaultSeed?: number;
      /** Optional safety settings to apply to every Gemini request. */
      safetySettings?: Array<{
        category: string;
        threshold: string;
        method?: string;
      }>;
    };
  };
}

export interface MasterStyleConfig {
  /** Universal style token applied to ALL prompts */
  universalSuffix: string;
  /** Scenario-specific style tokens */
  scenarios: {
    character?: string;   // Portrait-focused
    location?: string;    // Interior-focused
    exterior?: string;    // Environment-focused
    scene?: string;       // Action/narrative-focused
  };
  /** Artist references for style anchoring */
  artistReferences?: string[];
  /** Whether to include artist references in prompts */
  useArtistReferences?: boolean;
}

export interface ArtStyleConfig {
  description: string;
  negativePrompts: string[];
  referenceImages: string[];
  /** Master style system for consistent art direction */
  masterStyle?: MasterStyleConfig;
}

export interface EditorConfig {
  command: string;
  markdownPreview: boolean;
}

export interface WritingConfig {
  defaultPov: 'first' | 'third-limited' | 'third-omniscient';
  chapterWordTarget: number;
  sceneSeparator: string;
}

export interface PathConfig {
  configDir: string;
  cacheDb: string;
  draftsDir: string;
  imagesDir: string;
}

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
      'cartoon', 'anime', '3d render', 'glossy', 'plastic',
      'bright neon colors', 'sketch', 'pencil', 'blurred',
      'low resolution', 'watermark', 'text', 'distorted'
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
