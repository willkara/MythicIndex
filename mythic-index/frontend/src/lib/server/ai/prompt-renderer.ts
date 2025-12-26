/**
 * Prompt Renderer - Converts CompiledPromptIR to final text prompts
 *
 * Renders a CompiledPromptIR into final text prompts for AI generation, applying:
 * - Weight-based ordering (priority 1 first)
 * - Length-based trimming (remove lowest priority sections if too long)
 * - Master style suffix injection
 * - Negative prompt merging and deduplication
 * - Hash generation for caching
 */

import { createHash } from 'crypto';
import type {
	CompiledPromptIR,
	PromptSection,
	RenderedPrompt,
	RenderOptions,
} from './types';

// Default render options
const DEFAULT_OPTIONS: Required<RenderOptions> = {
	maxLength: 4000,
	includeMasterStyle: true,
	sectionSeparator: ', ',
};

// Master style suffix for fantasy imagery
const MASTER_STYLE = {
	character: 'heroic fantasy portrait, expressive face with distinct features, ornate attire with rich textures, painterly style, dramatic composition',
	location: 'high-fantasy establishing shot, rich environmental detail, atmospheric depth, epic scale, painterly composition',
	scene: 'narrative storytelling moment, emotional lighting, character-environment interaction, cinematic composition',
	universal: 'professional digital art, highly detailed, concept art quality',
};

/**
 * Render a CompiledPromptIR into a final prompt string
 */
export function renderPrompt(
	ir: CompiledPromptIR,
	options: RenderOptions = {}
): RenderedPrompt {
	const opts = { ...DEFAULT_OPTIONS, ...options };

	// Collect all sections with their weights
	const allSections = collectAllSections(ir);

	// Sort by weight (1 = highest priority, comes first)
	allSections.sort((a, b) => a.weight - b.weight);

	// Build the prompt with trimming
	const { prompt, trimmed } = buildPromptWithTrimming(
		allSections,
		opts.maxLength,
		opts.sectionSeparator,
		opts.includeMasterStyle,
		ir.entity_type,
		ir.scene_mood
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
 */
function buildPromptWithTrimming(
	sections: PromptSection[],
	maxLength: number,
	separator: string,
	includeMasterStyle: boolean,
	entityType: 'character' | 'location' | 'chapter',
	sceneMood?: string
): { prompt: string; trimmed: boolean } {
	// Calculate master style length
	const masterStyle = includeMasterStyle
		? getMasterStyle(entityType, sceneMood)
		: '';
	const masterStyleLength = masterStyle.length + separator.length;

	// Available length for content
	const availableLength = maxLength - masterStyleLength;

	// Build prompt starting with highest priority (weight 1)
	const includedContent: string[] = [];
	let currentLength = 0;
	let trimmed = false;

	for (const section of sections) {
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

	// Join content and add master style
	let prompt = includedContent.join(separator);
	if (masterStyle) {
		prompt = prompt + separator + masterStyle;
	}

	return { prompt, trimmed };
}

/**
 * Get the master style string based on entity type and mood
 */
function getMasterStyle(
	entityType: 'character' | 'location' | 'chapter',
	sceneMood?: string
): string {
	const parts: string[] = [];

	// Add entity-specific style
	if (entityType === 'chapter') {
		parts.push(MASTER_STYLE.scene);
	} else if (entityType === 'character') {
		parts.push(MASTER_STYLE.character);
	} else {
		parts.push(MASTER_STYLE.location);
	}

	// Add universal suffix
	parts.push(MASTER_STYLE.universal);

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

/**
 * Preview a prompt without rendering (for debugging)
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

	const masterStyleLength = getMasterStyle(ir.entity_type, ir.scene_mood).length;
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
