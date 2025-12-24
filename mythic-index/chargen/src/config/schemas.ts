/**
 * Configuration Schemas
 *
 * Zod validation schemas for all YAML configuration files.
 */

import { z } from 'zod';

// ============================================================================
// Provider Schemas
// ============================================================================

/**
 * Zod schema for Google provider configuration
 * Includes API key, models, generation defaults, and safety settings
 */
export const GoogleProviderSchema = z.object({
  api_key: z.string().default(''),
  enabled: z.boolean().default(true),
  models: z.object({
    image_analysis: z.string().default('gemini-3-pro-preview'),
    batch_analysis: z.string().default('gemini-2.0-flash'),
    batch_generation: z.string().default('gemini-3-pro-image-preview'),
    single_generation: z.string().default('gemini-3-pro-image-preview'),
  }),
  defaults: z.object({
    aspect_ratio: z.string().default('1:1'),
    image_size: z.string().default('1K'),
    response_mime_type: z.string().default('image/png'),
    temperature: z.number().default(1.0),
    top_p: z.number().default(0.95),
    top_k: z.number().default(64),
    candidate_count: z.number().default(1),
    seed: z.number().optional(),
  }),
  safety_settings: z
    .array(
      z.object({
        category: z.string(),
        threshold: z.string(),
        method: z.string().optional(),
      })
    )
    .default([]),
});

/**
 * Zod schema for OpenAI provider configuration
 * Includes API key, models, and generation defaults
 */
export const OpenAIProviderSchema = z.object({
  api_key: z.string().default(''),
  enabled: z.boolean().default(true),
  models: z.object({
    single_generation: z.string().default('gpt-image-1.5'),
  }),
  defaults: z.object({
    size: z.string().default('1024x1024'),
    quality: z.enum(['standard', 'hd']).default('standard'),
  }),
});

// ============================================================================
// Main Config Schema (chargen.yaml)
// ============================================================================

/**
 * Zod schema for the main chargen configuration file (chargen.yaml)
 * Includes workspace settings, API providers, batch configuration, and paths
 */
export const ChargenConfigSchema = z.object({
  workspace: z
    .object({
      id: z.string().default('default'),
      name: z.string().default('My Story'),
      slug: z.string().default('my-story'),
    })
    .default({}),

  remote: z
    .object({
      api_url: z.string().default(''),
      api_key: z.string().default(''),
      auto_sync: z.boolean().default(true),
      sync_interval_minutes: z.number().default(5),
    })
    .default({}),

  providers: z
    .object({
      google: GoogleProviderSchema.optional(),
      openai: OpenAIProviderSchema.optional(),
    })
    .default({}),

  default_provider: z.enum(['google', 'openai']).default('google'),

  batch: z
    .object({
      model: z.string().default('gemini-3-pro-image-preview'),
      poll_interval_ms: z.number().default(30000),
      max_tasks_per_job: z.number().default(500),
      upload_concurrency: z.number().default(5),
      max_retries: z.number().default(5),
      cleanup_after_success: z.boolean().default(true),
      artifact_dir: z.string().default('.chargen/batch'),
    })
    .default({}),

  paths: z
    .object({
      config_dir: z.string().default('~/.mythicindex'),
      cache_db: z.string().default('~/.mythicindex/cache.db'),
      drafts_dir: z.string().default('~/.mythicindex/drafts'),
      images_dir: z.string().default('~/.mythicindex/images'),
    })
    .default({}),

  editor: z
    .object({
      command: z.string().default('code'),
      markdown_preview: z.boolean().default(true),
    })
    .default({}),

  writing: z
    .object({
      default_pov: z.string().default('third-limited'),
      chapter_word_target: z.number().default(3000),
      scene_separator: z.string().default('* * *'),
    })
    .default({}),
});

// ============================================================================
// Prompts Schema (prompts.yaml)
// ============================================================================

/**
 * Zod schema for the prompts configuration file (prompts.yaml)
 * Contains prompt templates for analysis, generation, and negative prompts
 */
export const PromptsConfigSchema = z.object({
  analysis: z.object({
    archivist_enhanced: z.string(),
    archivist_basic: z.string(),
    appearance_generator: z.string(),
    appearance_multimodal: z.string(),
  }),

  generation: z.object({
    character_consistency: z.string(),
    location_consistency: z.string(),
    scene_consistency: z.string(),
  }),

  negatives: z.object({
    // When true, base negative comes from art direction file
    use_art_direction_base: z.boolean().default(true),
    // Fallback default negative (used when art direction unavailable)
    default: z.string(),
    // Scenario-specific additions
    character: z.string(),
  }),
});

// ============================================================================
// Styles Schema (styles.yaml)
// ============================================================================

/**
 * Zod schema for art direction integration settings
 * Controls how mood→style mapping from project art direction is applied
 */
export const ArtDirectionConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    use_mood_style_mapping: z.boolean().default(true),
    inject_artist_references: z.boolean().default(true),
  })
  .default({});

/**
 * Zod schema for master style configuration
 * Defines scenario-specific styling (fallback when art direction disabled)
 * Note: universal_suffix and artist_references now come from art direction file
 */
export const MasterStyleSchema = z.object({
  // Legacy fields - optional for backwards compatibility
  universal_suffix: z.string().optional(),
  artist_references: z.array(z.string()).optional(),
  use_artist_references: z.boolean().optional(),
  // Scenario-specific styles (still used)
  scenarios: z.record(z.string()),
});

/**
 * Zod schema for scenario-specific defaults
 * Defines aspect ratio and image size for different scenario types
 */
export const ScenarioDefaultSchema = z.object({
  aspect_ratio: z.string(),
  image_size: z.string().default('1K'),
});

/**
 * Zod schema for the styles configuration file (styles.yaml)
 * Includes art direction settings, master style, scenario defaults, keywords, and global settings
 */
export const StylesConfigSchema = z.object({
  art_direction: ArtDirectionConfigSchema,

  master_style: MasterStyleSchema,

  scenario_defaults: z.record(ScenarioDefaultSchema),

  keywords: z.object({
    exterior: z.array(z.string()),
    interior: z.array(z.string()),
  }),

  global_defaults: z.object({
    aspect_ratio: z.string().default('16:9'),
    size: z.string().default('1792x1024'),
    orientation: z.enum(['landscape', 'portrait']).default('landscape'),
    quality: z.enum(['standard', 'high']).default('high'),
    max_prompt_length: z.number().default(4000),
  }),

  rate_limiting: z.object({
    delay_ms: z.number().default(2200),
  }),
});

// ============================================================================
// Type Exports
// ============================================================================

/** Main chargen configuration type */
export type ChargenConfig = z.infer<typeof ChargenConfigSchema>;

/** Prompts configuration type */
export type PromptsConfig = z.infer<typeof PromptsConfigSchema>;

/** Styles configuration type */
export type StylesConfig = z.infer<typeof StylesConfigSchema>;

/** Google provider configuration type */
export type GoogleProvider = z.infer<typeof GoogleProviderSchema>;

/** OpenAI provider configuration type */
export type OpenAIProvider = z.infer<typeof OpenAIProviderSchema>;

/** Master style configuration type */
export type MasterStyle = z.infer<typeof MasterStyleSchema>;

/** Scenario-specific defaults type */
export type ScenarioDefault = z.infer<typeof ScenarioDefaultSchema>;

/** Art direction integration config type */
export type ArtDirectionConfig = z.infer<typeof ArtDirectionConfigSchema>;
