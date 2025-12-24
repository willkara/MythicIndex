/**
 * Image analysis service for chargen CLI
 * Uses Gemini vision API to analyze images and generate structured metadata
 */

import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { GoogleGenAI } from '@google/genai';
import { getConfig } from './config.js';
import { getPrompt, getModel } from '../config/index.js';
import { getMimeType, sleep } from './images/utils.js';
import type { CharacterImagery, ImageInventoryEntry } from './imagery-yaml.js';

// Re-export types for convenience
export type { ImageInventoryEntry };

interface AnalysisOptions {
  imagePath: string;
  characterName: string;
  slug: string;
  appearance: string;
  filename: string;
  /** Use enhanced analysis with rich metadata (default: true) */
  enhanced?: boolean;
}

/** Enhanced analysis result with full metadata */
export interface EnhancedAnalysisResult {
  success: boolean;
  entry?: ImageInventoryEntry;
  error?: string;
  rawResponse?: string;
}

// ============================================================================
// Prompt Templates - now loaded from config/prompts.yaml
// Use getPrompt('archivist_enhanced'), getPrompt('archivist_basic'), etc.
// ============================================================================

// ============================================================================
// Rate Limiting & Retry Logic
// ============================================================================

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2; // seconds

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('429') || msg.includes('rate') || msg.includes('quota');
  }
  return false;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, _context: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!isRateLimitError(error)) {
        throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(RETRY_DELAY_BASE, attempt + 1);
        console.log(`  ⏳ Rate limit hit. Retrying in ${delay}s...`);
        await sleep(delay * 1000);
      }
    }
  }

  throw lastError;
}

// ============================================================================
// YAML Parsing Helpers
// ============================================================================

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();

  // Check for markdown code fence
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const lines = trimmed.split('\n');
  // Remove first line (opening fence) and last line (closing fence)
  const filtered = lines
    .slice(1, -1)
    .filter((l) => !l.trim().startsWith('```'))
    .join('\n')
    .trim();

  return filtered;
}

function parseYamlResponse(responseText: string): ImageInventoryEntry | null {
  try {
    const cleaned = stripMarkdownFences(responseText);

    // Gemini may return YAML array or object
    const parsed = parseYaml(cleaned);

    // If array, take first item
    if (Array.isArray(parsed)) {
      return parsed.length > 0 ? (parsed[0] as ImageInventoryEntry) : null;
    }

    // If object, return directly
    if (parsed && typeof parsed === 'object') {
      return parsed as ImageInventoryEntry;
    }

    return null;
  } catch (error) {
    console.error(`  ✗ Failed to parse YAML response: ${error}`);
    return null;
  }
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Analyze a single image using Gemini vision API
 *
 * @param opts Analysis options including image path, character context, and enhanced mode
 * @returns ImageInventoryEntry with metadata, or null if analysis failed
 */
export async function analyzeImage(opts: AnalysisOptions): Promise<ImageInventoryEntry | null> {
  const { imagePath, characterName, slug, appearance, filename, enhanced = true } = opts;

  try {
    // Read image file as base64
    const imageBuffer = await readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    // Build prompt with character context using config templates
    const currentDate = new Date().toISOString().split('T')[0];
    const filenameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const descriptor = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Choose template based on enhanced mode and render with variables
    const promptKey = enhanced ? 'archivist_enhanced' : 'archivist_basic';
    const archivistPrompt = getPrompt(promptKey, {
      characterName,
      slug,
      appearance,
      date: currentDate,
      filename,
      descriptor,
    });

    // Call Gemini vision API with retry
    const responseText = await retryWithBackoff(async () => {
      const config = getConfig();
      const googleConfig = config.imageGeneration.providers.google;

      if (!googleConfig?.apiKey) {
        throw new Error('Google GenAI not configured. Add API key to config.');
      }

      const client = new GoogleGenAI({ apiKey: googleConfig.apiKey });
      const analysisModel = getModel('image_analysis');

      const response = await client.models.generateContent({
        model: analysisModel,
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: base64Image } }, { text: archivistPrompt }],
          },
        ],
        // NOTE: NO responseModalities - defaults to TEXT
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }, `analyze image ${filename}`);

    // Parse YAML response
    const result = parseYamlResponse(responseText);

    if (!result) {
      console.error(`  ✗ Could not parse analysis for ${filename}`);
      return null;
    }

    // Ensure required fields and add analysis metadata
    const analysisModel = getModel('image_analysis');
    result.provenance = result.provenance || {};
    result.provenance.original_filename = filename;
    result.provenance.analysis_model = analysisModel;
    result.provenance.analysis_timestamp = new Date().toISOString();

    return result;
  } catch (error) {
    console.error(`  ✗ Analysis failed for ${filename}: ${error}`);
    return null;
  }
}

/**
 * Analyze a single image with enhanced result structure
 *
 * This version returns a result object with success/error details
 * for better error handling in batch operations.
 */
export async function analyzeImageEnhanced(opts: AnalysisOptions): Promise<EnhancedAnalysisResult> {
  const { imagePath, characterName, slug, appearance, filename, enhanced = true } = opts;

  try {
    // Read image file as base64
    const imageBuffer = await readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imagePath);

    // Build prompt with character context using config templates
    const currentDate = new Date().toISOString().split('T')[0];
    const filenameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const descriptor = filenameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    // Choose template based on enhanced mode and render with variables
    const promptKey = enhanced ? 'archivist_enhanced' : 'archivist_basic';
    const archivistPrompt = getPrompt(promptKey, {
      characterName,
      slug,
      appearance,
      date: currentDate,
      filename,
      descriptor,
    });

    // Call Gemini vision API with retry
    const responseText = await retryWithBackoff(async () => {
      const config = getConfig();
      const googleConfig = config.imageGeneration.providers.google;

      if (!googleConfig?.apiKey) {
        throw new Error('Google GenAI not configured. Add API key to config.');
      }

      const client = new GoogleGenAI({ apiKey: googleConfig.apiKey });
      const analysisModel = getModel('image_analysis');

      const response = await client.models.generateContent({
        model: analysisModel,
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType, data: base64Image } }, { text: archivistPrompt }],
          },
        ],
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }, `analyze image ${filename}`);

    // Parse YAML response
    const result = parseYamlResponse(responseText);

    if (!result) {
      return {
        success: false,
        error: `Could not parse YAML response for ${filename}`,
        rawResponse: responseText,
      };
    }

    // Ensure required fields and add analysis metadata
    const analysisModel = getModel('image_analysis');
    result.provenance = result.provenance || {};
    result.provenance.original_filename = filename;
    result.provenance.analysis_model = analysisModel;
    result.provenance.analysis_timestamp = new Date().toISOString();

    return {
      success: true,
      entry: result,
    };
  } catch (error) {
    return {
      success: false,
      error: `Analysis failed for ${filename}: ${error}`,
    };
  }
}

/**
 * Generate appearance description from profile.md + portrait image (multimodal)
 *
 * The portrait image is treated as the "gospel truth" for visual appearance.
 * Profile text provides context but the image takes priority for visual details.
 */
export async function generateAppearanceFromProfile(opts: {
  profilePath: string;
  portraitImagePath?: string;
  slug: string;
}): Promise<string | null> {
  const { profilePath, portraitImagePath, slug } = opts;

  try {
    // Read profile.md
    let profileContent = '';
    if (existsSync(profilePath)) {
      profileContent = await readFile(profilePath, 'utf-8');
    } else {
      console.error(`  ✗ Profile not found: ${profilePath}`);
      return null;
    }

    // Choose prompt based on whether portrait exists
    const hasPortrait = portraitImagePath && existsSync(portraitImagePath);
    const appearancePrompt = hasPortrait
      ? getPrompt('appearance_multimodal')
      : getPrompt('appearance_generator');

    // Build multimodal content parts
    type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };
    const contentParts: ContentPart[] = [];

    // Add portrait image FIRST if available (the "gospel truth")
    if (hasPortrait && portraitImagePath) {
      const imageBuffer = await readFile(portraitImagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = getMimeType(portraitImagePath);
      contentParts.push({ inlineData: { mimeType, data: base64Image } });
    }

    // Add profile text with prompt
    contentParts.push({
      text: `Profile Content:\n${profileContent}\n\n${appearancePrompt}`,
    });

    // Call Gemini API (multimodal if portrait exists)
    const responseText = await retryWithBackoff(async () => {
      const config = getConfig();
      const googleConfig = config.imageGeneration.providers.google;

      if (!googleConfig?.apiKey) {
        throw new Error('Google GenAI not configured. Add API key to config.');
      }

      const client = new GoogleGenAI({ apiKey: googleConfig.apiKey });
      const analysisModel = getModel('image_analysis');

      const response = await client.models.generateContent({
        model: analysisModel,
        contents: [
          {
            role: 'user',
            parts: contentParts,
          },
        ],
      });

      return response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }, `generate appearance for ${slug}`);

    return responseText.trim();
  } catch (error) {
    console.error(`  ✗ Appearance generation failed: ${error}`);
    return null;
  }
}

/**
 * Auto-generate imagery.yaml structure if missing
 */
export async function generateImageryYaml(opts: {
  characterDir: string;
  slug: string;
}): Promise<CharacterImagery | null> {
  const { characterDir, slug } = opts;

  try {
    const profilePath = join(characterDir, 'profile.md');
    const portraitPath = join(characterDir, 'images', 'portrait.png');

    // Generate appearance from profile
    const appearance = await generateAppearanceFromProfile({
      profilePath,
      portraitImagePath: existsSync(portraitPath) ? portraitPath : undefined,
      slug,
    });

    if (!appearance) {
      console.error(`  ✗ Failed to generate appearance for ${slug}`);
      return null;
    }

    // Create initial imagery.yaml structure
    const imagery: CharacterImagery = {
      entity_type: 'character',
      slug,
      appearance,
      custom_style_override: undefined,
      prompts: [],
      image_inventory: [],
    };

    return imagery;
  } catch (error) {
    console.error(`  ✗ Failed to auto-generate imagery.yaml: ${error}`);
    return null;
  }
}

// ============================================================================
// Helper Functions for Character Actions
// ============================================================================

/**
 * Discover image files in a directory
 */
export async function discoverImageFiles(imagesDir: string): Promise<string[]> {
  if (!existsSync(imagesDir)) {
    return [];
  }

  try {
    const dirContents = await readdir(imagesDir);

    const SUPPORTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

    return dirContents
      .filter((f) => {
        const ext = f.substring(f.lastIndexOf('.')).toLowerCase();
        return SUPPORTED_EXTENSIONS.includes(ext);
      })
      .map((f) => join(imagesDir, f))
      .sort();
  } catch {
    return [];
  }
}
