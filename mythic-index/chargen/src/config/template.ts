/**
 * Template Variable Substitution
 *
 * Simple {{variable}} replacement engine for prompt templates.
 */

/**
 * Variables that can be substituted in templates
 */
export interface TemplateVariables {
  /** Character name */
  characterName?: string;
  /** Entity slug */
  slug?: string;
  /** Character appearance description */
  appearance?: string;
  /** Image filename */
  filename?: string;
  /** Descriptor derived from filename */
  descriptor?: string;
  /** Current date (YYYY-MM-DD) */
  date?: string;
  /** Scenario description */
  scenario?: string;
  /** Allow additional string variables */
  [key: string]: string | undefined;
}

/**
 * Replace {{variable}} placeholders with actual values
 *
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Object with variable values
 * @returns Template with variables substituted
 *
 * @example
 * ```ts
 * const result = renderTemplate(
 *   "Hello {{characterName}}!",
 *   { characterName: "Cidrella" }
 * );
 * // Returns: "Hello Cidrella!"
 * ```
 */
export function renderTemplate(template: string, variables: TemplateVariables): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    return value !== undefined ? value : match;
  });
}

/**
 * Get the current date in YYYY-MM-DD format
 */
export function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate a descriptor from a filename
 * Converts "my_image_file.png" to "my-image-file"
 */
export function filenameToDescriptor(filename: string): string {
  // Remove extension
  const withoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
  // Convert to lowercase and replace non-alphanumeric with hyphens
  return withoutExt.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/**
 * Build common template variables for character analysis
 */
export function buildAnalysisVariables(opts: {
  characterName: string;
  slug: string;
  appearance: string;
  filename: string;
}): TemplateVariables {
  return {
    characterName: opts.characterName,
    slug: opts.slug,
    appearance: opts.appearance,
    filename: opts.filename,
    descriptor: filenameToDescriptor(opts.filename),
    date: getCurrentDate(),
  };
}
