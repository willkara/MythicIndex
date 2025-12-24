/**
 * Logging utilities for verbose generation output
 * Provides structured, indented logging for compilation and generation steps
 */

import chalk from 'chalk';

/**
 * Log a main step (indented with arrow)
 * Example: "  → Resolving character: kael-ashford"
 *
 * @param text - The step text to display
 */
export function logStep(text: string): void {
  console.log(chalk.cyan('  →'), text);
}

/**
 * Log a detail under a step (double indented with bullet)
 * Example: "    • Canonical appearance: 247 chars"
 *
 * @param text - The detail text to display
 */
export function logDetail(text: string): void {
  console.log(chalk.dim('    •'), chalk.dim(text));
}

/**
 * Log a section header with decorative line
 * Example: "━━━━━ [1/15] ch01-ash-and-compass / ch01-img-01 ━━━━━"
 *
 * @param text - The section header text to display
 */
export function logBatchSection(text: string): void {
  const line = '━'.repeat(60);
  console.log(chalk.dim(line));
  console.log(chalk.bold(text));
  console.log(chalk.dim(line));
}

/**
 * Log a phase header (no decoration, just bold)
 * Example: "Loading chapter context..."
 *
 * @param text - The phase header text to display
 */
export function logPhase(text: string): void {
  console.log(chalk.bold(text));
}

/**
 * Log timing information
 * Example: "    • Response: 12.3s"
 *
 * @param label - The label for the timing measurement
 * @param ms - The duration in milliseconds
 */
export function logTiming(label: string, ms: number): void {
  const seconds = (ms / 1000).toFixed(1);
  logDetail(`${label}: ${seconds}s`);
}

/**
 * Log a prompt preview (truncated)
 * Shows first N characters with word-boundary truncation
 *
 * @param prompt - The full prompt text
 * @param maxLen - Maximum length before truncation (default: 150)
 */
export function logPromptPreview(prompt: string, maxLen = 150): void {
  let preview = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  if (preview.length > maxLen) {
    // Find last space before maxLen for clean truncation
    const cutoff = preview.lastIndexOf(' ', maxLen);
    if (cutoff > maxLen * 0.7) {
      preview = preview.slice(0, cutoff) + '...';
    } else {
      preview = preview.slice(0, maxLen - 3) + '...';
    }
  }

  logStep('Prompt preview:');
  // Wrap preview in quotes and indent
  console.log(chalk.dim(`    "${preview}"`));
}

/**
 * Format a path for display (show last N segments)
 * Example: ".../kael-ashford/images/portrait.png"
 *
 * @param path - The full file path
 * @param segments - Number of path segments to show (default: 3)
 * @returns The formatted short path
 */
export function formatShortPath(path: string, segments = 3): string {
  const parts = path.split('/');
  if (parts.length <= segments) {
    return path;
  }
  return '.../' + parts.slice(-segments).join('/');
}

/**
 * Log a reference image with existence indicator
 * Example: "    • [portrait] .../kael-ashford/images/portrait.png ✓"
 *
 * @param role - The role of the reference image
 * @param path - The file path to the image
 * @param exists - Whether the image file exists
 */
export function logReference(role: string, path: string, exists: boolean): void {
  const shortPath = formatShortPath(path);
  const indicator = exists ? chalk.green('✓') : chalk.red('✗');
  console.log(chalk.dim(`    • [${role}] ${shortPath} ${indicator}`));
}

/**
 * Log section breakdown from IR
 *
 * @param sections - The sections to display, categorized with weight and source
 */
export function logSectionBreakdown(
  sections: Record<string, { content: string; weight: number; source: string }[]>
): void {
  logStep('Sections:');

  // Flatten and sort by weight
  const allSections: { category: string; weight: number; content: string; source: string }[] = [];
  for (const [category, items] of Object.entries(sections)) {
    for (const item of items) {
      allSections.push({ category, ...item });
    }
  }
  allSections.sort((a, b) => a.weight - b.weight);

  // Group by category for display
  const byCategory = new Map<string, number>();
  for (const section of allSections) {
    const existing = byCategory.get(section.category) || 0;
    byCategory.set(section.category, existing + section.content.length);
  }

  for (const [category, chars] of byCategory) {
    const weight = allSections.find((s) => s.category === category)?.weight || 0;
    logDetail(`${category}: ${chars} chars (weight ${weight})`);
  }
}

/**
 * Log constraints summary
 *
 * @param constraints - The generation constraints to display
 */
export function logConstraints(constraints: {
  aspect_ratio: string;
  size: string;
  orientation: string;
}): void {
  logStep(
    `Constraints: ${constraints.aspect_ratio}, ${constraints.size}, ${constraints.orientation}`
  );
}

/**
 * Log compilation mode
 *
 * @param hasPromptUsed - Whether a pre-authored prompt is being used
 */
export function logCompilationMode(hasPromptUsed: boolean): void {
  if (hasPromptUsed) {
    logStep('Mode: author prompt (prompt_used present)');
  } else {
    logStep('Mode: compiled (building from components)');
  }
}

/**
 * Log character resolution summary
 *
 * @param slug - The character slug
 * @param data - Character resolution data including appearance and portraits
 */
export function logCharacterResolution(
  slug: string,
  data: {
    name?: string;
    appearanceLength: number;
    variationCount?: number;
    portraitPath?: string;
    portraitExists?: boolean;
  }
): void {
  logStep(`Resolving character: ${slug}`);
  if (data.name) {
    logDetail(`Name: ${data.name}`);
  }
  logDetail(`Canonical appearance: ${data.appearanceLength} chars`);
  if (data.variationCount && data.variationCount > 0) {
    logDetail(`Scene variations: ${data.variationCount} states defined`);
  }
  if (data.portraitPath) {
    const shortPath = formatShortPath(data.portraitPath);
    const indicator = data.portraitExists ? chalk.green('✓') : chalk.red('✗');
    logDetail(`Portrait: ${shortPath} ${indicator}`);
  }
}

/**
 * Log location resolution summary
 *
 * @param slug - The location slug
 * @param data - Location resolution data including visual anchors and zones
 */
export function logLocationResolution(
  slug: string,
  data: {
    name?: string;
    signatureElements?: number;
    materials?: string[];
    zoneCount?: number;
  }
): void {
  logStep(`Resolving location: ${slug}`);
  if (data.name) {
    logDetail(`Name: ${data.name}`);
  }
  if (data.signatureElements) {
    logDetail(`Visual anchor: ${data.signatureElements} signature elements`);
  }
  if (data.materials && data.materials.length > 0) {
    logDetail(`Materials: ${data.materials.slice(0, 5).join(', ')}`);
  }
  if (data.zoneCount) {
    logDetail(`Zones: ${data.zoneCount} defined`);
  }
}

/**
 * Log generation provider info
 *
 * @param provider - The AI provider name
 * @param model - The model name
 */
export function logProviderInfo(provider: string, model: string): void {
  logStep(`Provider: ${provider}`);
  logStep(`Model: ${model}`);
}

/**
 * Log batch progress line
 *
 * @param completed - Number of completed tasks
 * @param total - Total number of tasks
 * @param success - Number of successful tasks
 * @param errors - Number of failed tasks
 * @param skipped - Number of skipped tasks
 */
export function logBatchProgress(
  completed: number,
  total: number,
  success: number,
  errors: number,
  skipped: number
): void {
  const pct = Math.round((completed / total) * 100);
  console.log();
  console.log(
    chalk.dim(`Progress: ${completed}/${total} (${pct}%) | `) +
      chalk.green(`Success: ${success}`) +
      chalk.dim(' | ') +
      chalk.red(`Errors: ${errors}`) +
      chalk.dim(' | ') +
      chalk.yellow(`Skipped: ${skipped}`)
  );
}
