/**
 * Prompt Compiler - Main Orchestrator
 *
 * Compiles imagery.yaml specifications into CompiledPromptIR structures
 * that can be rendered into final prompts for image generation.
 *
 * Supports:
 * - Location imagery (overview + zones)
 * - Chapter imagery (images with character/location resolution)
 *
 * Usage:
 *   const ir = await compilePromptIR('location', 'undershade-canyon', 'overview');
 *   const rendered = renderPrompt(ir);
 */

import type { CompiledPromptIR, CompilerOptions } from '../../types/prompt-ir.js';
import {
  compileLocationOverview,
  compileLocationZone,
  compileAllLocationTargets,
  listLocationTargets,
} from './location-compiler.js';
import {
  compileChapterImages,
  listChapterTargets,
  loadChapterContext,
  compileChapterImage,
} from './chapter-compiler.js';
import type { EntityType } from '../imagery-yaml.js';

// Re-export types and functions for convenience
export * from './location-compiler.js';
export * from './chapter-compiler.js';
export * from './precedence.js';

/**
 * Compile a specific target into a PromptIR
 *
 * @param entityType - 'location' or 'chapter'
 * @param entitySlug - The entity slug (e.g., 'undershade-canyon')
 * @param targetSlug - The specific target (e.g., 'overview' or a zone slug)
 * @param options - Compiler options
 */
export async function compilePromptIR(
  entityType: EntityType,
  entitySlug: string,
  targetSlug: string,
  options: CompilerOptions = {}
): Promise<CompiledPromptIR | null> {
  if (entityType === 'location') {
    // Check if this is the overview
    const targets = await listLocationTargets(entitySlug);

    if (targets.overview?.slug === targetSlug || targetSlug === 'overview') {
      return compileLocationOverview(entitySlug, options);
    }

    // Otherwise, compile a zone
    return compileLocationZone(entitySlug, targetSlug, options);
  }

  if (entityType === 'chapter') {
    // Compile a specific chapter image by its custom_id
    const context = await loadChapterContext(entitySlug);
    if (!context) {
      return null;
    }

    // Use context.imagery instead of re-reading
    const imageSpec = context.imagery.images?.find((img) => img.custom_id === targetSlug);
    if (!imageSpec) {
      return null;
    }

    return compileChapterImage(context, context.imagery, imageSpec, options);
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Compile all targets for an entity
 *
 * @param entityType - 'location' or 'chapter'
 * @param entitySlug - The entity slug
 * @param options - Compiler options
 */
export async function compileAllTargets(
  entityType: EntityType,
  entitySlug: string,
  options: CompilerOptions = {}
): Promise<CompiledPromptIR[]> {
  if (entityType === 'location') {
    return compileAllLocationTargets(entitySlug, options);
  }

  if (entityType === 'chapter') {
    return compileChapterImages(entitySlug, options);
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * List available compilation targets for an entity
 *
 * @param entityType - 'location' or 'chapter'
 * @param entitySlug - The entity slug
 */
export async function listTargets(
  entityType: EntityType,
  entitySlug: string
): Promise<{
  targets: { slug: string; name: string; type: string }[];
}> {
  if (entityType === 'location') {
    const { overview, zones } = await listLocationTargets(entitySlug);
    const targets: { slug: string; name: string; type: string }[] = [];

    if (overview) {
      targets.push({
        slug: overview.slug,
        name: overview.title,
        type: 'establishing',
      });
    }

    for (const zone of zones) {
      targets.push({
        slug: zone.slug,
        name: zone.title,
        type: zone.image_type || 'zone',
      });
    }

    return { targets };
  }

  if (entityType === 'chapter') {
    const chapter = await listChapterTargets(entitySlug);
    return {
      targets: chapter.images.map((img) => ({
        slug: img.custom_id,
        name: img.custom_id,
        type: img.image_type,
      })),
    };
  }

  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Validate a compiled IR for completeness
 */
export function validateIR(ir: CompiledPromptIR): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!ir.target_id) errors.push('Missing target_id');
  if (!ir.entity_type) errors.push('Missing entity_type');
  if (!ir.entity_slug) errors.push('Missing entity_slug');

  // Check that we have some positive content
  const hasSubject = ir.positive.subject.length > 0;
  const hasConstraints = ir.positive.constraints.length > 0;
  if (!hasSubject && !hasConstraints) {
    errors.push('No subject or constraints in positive sections');
  }

  // Check constraints
  if (!ir.constraints.aspect_ratio) warnings.push('Missing aspect_ratio, using default');
  if (!ir.constraints.size) warnings.push('Missing size, using default');

  // Check references
  const missingRefs = ir.references.filter((r) => !r.exists);
  if (missingRefs.length > 0) {
    warnings.push(`${missingRefs.length} reference image(s) not found`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get a summary of a compiled IR for display
 */
export function summarizeIR(ir: CompiledPromptIR): {
  target: string;
  type: string;
  mood: string | undefined;
  sectionCounts: Record<string, number>;
  constraintSummary: string;
  referenceCount: number;
  negativeSummary: string;
} {
  const sectionCounts: Record<string, number> = {};
  for (const [key, sections] of Object.entries(ir.positive)) {
    sectionCounts[key] = sections.length;
  }

  return {
    target: `${ir.entity_slug}/${ir.target_id}`,
    type: ir.image_type || 'unknown',
    mood: ir.scene_mood,
    sectionCounts,
    constraintSummary: `${ir.constraints.aspect_ratio} @ ${ir.constraints.size}`,
    referenceCount: ir.references.filter((r) => r.exists).length,
    negativeSummary: `${ir.negative.length} terms`,
  };
}
