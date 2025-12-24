/**
 * Weighted Prompt Renderer
 *
 * Renders a CompiledPromptIR into a final text prompt, applying:
 * - Weight-based ordering (priority 1 first)
 * - Length-based trimming (remove lowest priority sections if too long)
 * - Master style suffix injection (with art direction mood→style mapping)
 * - Negative prompt merging and deduplication
 * - Hash generation for caching
 */

import { createHash } from 'crypto';
import type {
  CompiledPromptIR,
  PromptSection,
  RenderedPrompt,
  RenderOptions,
  SectionWeight,
} from '../types/prompt-ir.js';
import { MASTER_STYLE } from './images/constants.js';
import {
  buildMoodStyleSuffix,
  getAestheticPhilosophy,
  artDirectionExists,
} from '../config/index.js';

// Default render options
const DEFAULT_OPTIONS: Required<RenderOptions> = {
  maxLength: 4000,
  includeMasterStyle: true,
  sectionSeparator: ', ',
};

/**
 * Render a CompiledPromptIR into a final prompt string
 */
export function renderPrompt(ir: CompiledPromptIR, options: RenderOptions = {}): RenderedPrompt {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Collect all sections with their weights
  const allSections = collectAllSections(ir);

  // Sort by weight (1 = highest priority, comes first)
  allSections.sort((a, b) => a.weight - b.weight);

  // Build the prompt with trimming, passing scene_mood for art direction integration
  const { prompt, trimmed } = buildPromptWithTrimming(
    allSections,
    opts.maxLength,
    opts.sectionSeparator,
    opts.includeMasterStyle,
    ir.scene_mood // Pass scene_mood for mood→style mapping
  );

  // Build negative prompt
  const negativePrompt = ir.negative.join(', ');

  // Generate hash for caching
  const irHash = generateIRHash(ir);

  // Filter references to only those that exist
  const references = ir.references
    .filter((r) => r.exists)
    .map((r) => ({ path: r.path, role: r.role }));

  return {
    prompt,
    negative_prompt: negativePrompt,
    references,
    constraints: ir.constraints,
    ir_hash: irHash,
    char_count: prompt.length,
    trimmed,
  };
}

/**
 * Collect all sections from the positive IR into a flat array
 */
function collectAllSections(ir: CompiledPromptIR): PromptSection[] {
  const sections: PromptSection[] = [];

  for (const category of Object.values(ir.positive)) {
    sections.push(...category);
  }

  return sections;
}

/**
 * Build the prompt string with trimming if necessary
 *
 * @param sections - All prompt sections sorted by weight
 * @param maxLength - Maximum prompt length
 * @param separator - Separator between sections
 * @param includeMasterStyle - Whether to include master style suffix
 * @param sceneMood - Optional scene mood for art direction integration
 */
function buildPromptWithTrimming(
  sections: PromptSection[],
  maxLength: number,
  separator: string,
  includeMasterStyle: boolean,
  sceneMood?: string
): { prompt: string; trimmed: boolean } {
  // Calculate master style length (now mood-aware)
  const masterStyle = includeMasterStyle ? getMasterStyleForLocation(sceneMood) : '';
  const masterStyleLength = masterStyle.length + separator.length;

  // Available length for content
  const availableLength = maxLength - masterStyleLength;

  // Group sections by weight
  const byWeight = new Map<SectionWeight, PromptSection[]>();
  for (const section of sections) {
    if (!byWeight.has(section.weight)) {
      byWeight.set(section.weight, []);
    }
    byWeight.get(section.weight)!.push(section);
  }

  // Build prompt starting with highest priority (weight 1)
  const weights: SectionWeight[] = [1, 2, 3, 4, 5];
  const includedContent: string[] = [];
  let currentLength = 0;
  let trimmed = false;

  for (const weight of weights) {
    const weightSections = byWeight.get(weight) || [];

    for (const section of weightSections) {
      const contentLength = section.content.length + separator.length;

      if (currentLength + contentLength <= availableLength) {
        includedContent.push(section.content);
        currentLength += contentLength;
      } else {
        // Try to fit as much as possible
        const remaining = availableLength - currentLength;
        if (remaining > 50 && section.content.length > 50) {
          // Truncate this section
          const truncated = section.content.slice(0, remaining - 3) + '...';
          includedContent.push(truncated);
          trimmed = true;
        } else {
          trimmed = true;
        }
        break;
      }
    }

    if (currentLength >= availableLength) {
      break;
    }
  }

  // Join content and add master style
  let prompt = includedContent.join(separator);
  if (masterStyle) {
    prompt = prompt + separator + masterStyle;
  }

  return { prompt, trimmed };
}

/**
 * Get the master style string for images
 *
 * When art direction is enabled and a scene mood is provided,
 * the mood→style mapping is used to inject artist references and style notes.
 *
 * @param sceneMood - Optional mood for mood→style mapping (e.g., "somber", "pastoral")
 */
function getMasterStyleForLocation(sceneMood?: string): string {
  const parts: string[] = [];
  const useArtDirection = artDirectionExists();

  // For chapter scenes with a mood, inject mood-specific style from art direction
  if (useArtDirection && sceneMood) {
    const moodStyleSuffix = buildMoodStyleSuffix(sceneMood);
    if (moodStyleSuffix) {
      parts.push(moodStyleSuffix);
    }
  }

  // Add scenario-specific tokens (scene or location)
  if (sceneMood) {
    // Chapter scene - use scene scenario
    parts.push(MASTER_STYLE.scenarios.scene || MASTER_STYLE.scenarios.location);
  } else {
    // Location or other - use location scenario
    parts.push(MASTER_STYLE.scenarios.location);
  }

  // Add universal suffix - prefer art direction's aesthetic philosophy
  if (useArtDirection) {
    try {
      const aestheticPhilosophy = getAestheticPhilosophy();
      if (aestheticPhilosophy) {
        parts.push(aestheticPhilosophy);
      }
    } catch {
      // Fall back to master style universal suffix
      if (MASTER_STYLE.universalSuffix) {
        parts.push(MASTER_STYLE.universalSuffix);
      }
    }
  } else if (MASTER_STYLE.universalSuffix) {
    parts.push(MASTER_STYLE.universalSuffix);
  }

  // Add legacy artist references only when not using mood-based art direction
  if (!useArtDirection || !sceneMood) {
    if (MASTER_STYLE.useArtistReferences && MASTER_STYLE.artistReferences?.length) {
      parts.push(`in the style of ${MASTER_STYLE.artistReferences.join(', ')}`);
    }
  }

  return parts.join(', ');
}

/**
 * Generate a hash of the IR for caching
 */
function generateIRHash(ir: CompiledPromptIR): string {
  // Create a normalized representation for hashing
  const normalized = {
    target_id: ir.target_id,
    entity_type: ir.entity_type,
    entity_slug: ir.entity_slug,
    positive: ir.positive,
    negative: ir.negative,
    constraints: ir.constraints,
  };

  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

// ============================================================================
// Preview and Debug Functions
// ============================================================================

/**
 * Generate a preview of the prompt without rendering
 */
export function previewPrompt(ir: CompiledPromptIR): {
  sections: { weight: number; source: string; preview: string }[];
  totalLength: number;
  estimatedFinalLength: number;
} {
  const sections = collectAllSections(ir)
    .sort((a, b) => a.weight - b.weight)
    .map((s) => ({
      weight: s.weight,
      source: s.source,
      preview: s.content.length > 100 ? s.content.slice(0, 100) + '...' : s.content,
    }));

  const totalLength = sections.reduce((sum, s) => sum + s.preview.length, 0);

  const masterStyleLength = getMasterStyleForLocation().length;
  const estimatedFinalLength = totalLength + masterStyleLength + sections.length * 2;

  return { sections, totalLength, estimatedFinalLength };
}

/**
 * Format a rendered prompt for display
 */
export function formatPromptForDisplay(rendered: RenderedPrompt): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    'RENDERED PROMPT',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Characters: ${rendered.char_count}${rendered.trimmed ? ' (TRIMMED)' : ''}`,
    `Hash: ${rendered.ir_hash}`,
    `Constraints: ${rendered.constraints.aspect_ratio} @ ${rendered.constraints.size}`,
    `References: ${rendered.references.length} image(s)`,
    '',
    '───────────────────────────────────────────────────────────────',
    'POSITIVE PROMPT:',
    '───────────────────────────────────────────────────────────────',
    '',
    wordWrap(rendered.prompt, 80),
    '',
    '───────────────────────────────────────────────────────────────',
    'NEGATIVE PROMPT:',
    '───────────────────────────────────────────────────────────────',
    '',
    wordWrap(rendered.negative_prompt, 80),
    '',
    '═══════════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}

/**
 * Word wrap a string to a maximum width
 */
function wordWrap(text: string, width: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines.join('\n');
}
