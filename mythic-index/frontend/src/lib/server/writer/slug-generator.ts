/**
 * Slug generation utilities for content writer module
 */

/**
 * Converts a string to a URL-friendly slug
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Removes consecutive hyphens
 * - Trims hyphens from start/end
 *
 * @param text - The text to convert to a slug
 * @returns URL-friendly slug
 *
 * @example
 * generateSlug("The Dragon's Lair") => "the-dragons-lair"
 * generateSlug("Character Name!!!") => "character-name"
 * generateSlug("  Multiple   Spaces  ") => "multiple-spaces"
 */
export function generateSlug(text: string): string {
	return text
		.toLowerCase()
		.trim()
		// Replace apostrophes and quotes with nothing
		.replace(/['"`]/g, '')
		// Replace spaces and special characters with hyphens
		.replace(/[^a-z0-9]+/g, '-')
		// Remove consecutive hyphens
		.replace(/-+/g, '-')
		// Remove leading/trailing hyphens
		.replace(/^-|-$/g, '');
}

/**
 * Generates a unique slug by appending a number if needed
 * This is a helper for ensuring slug uniqueness at the database level
 *
 * @param baseSlug - The base slug to make unique
 * @param existingSlugs - Array of slugs that already exist
 * @returns Unique slug
 *
 * @example
 * makeSlugUnique("aragorn", ["aragorn"]) => "aragorn-2"
 * makeSlugUnique("aragorn", ["aragorn", "aragorn-2"]) => "aragorn-3"
 */
export function makeSlugUnique(baseSlug: string, existingSlugs: string[]): string {
	if (!existingSlugs.includes(baseSlug)) {
		return baseSlug;
	}

	let counter = 2;
	let uniqueSlug = `${baseSlug}-${counter}`;

	while (existingSlugs.includes(uniqueSlug)) {
		counter++;
		uniqueSlug = `${baseSlug}-${counter}`;
	}

	return uniqueSlug;
}

/**
 * Validates that a slug meets the required format
 * - Only lowercase letters, numbers, and hyphens
 * - No leading/trailing hyphens
 * - No consecutive hyphens
 * - Minimum length of 1
 *
 * @param slug - The slug to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * isValidSlug("valid-slug") => true
 * isValidSlug("Invalid-Slug") => false
 * isValidSlug("-invalid") => false
 * isValidSlug("invalid--slug") => false
 */
export function isValidSlug(slug: string): boolean {
	// Regex: starts with alphanumeric, contains alphanumeric and hyphens, ends with alphanumeric
	const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
	return slugRegex.test(slug);
}

/**
 * Truncates a slug to a maximum length while preserving word boundaries
 * Useful for very long entity names
 *
 * @param slug - The slug to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated slug
 *
 * @example
 * truncateSlug("this-is-a-very-long-slug-that-needs-truncation", 20)
 *   => "this-is-a-very-long"
 */
export function truncateSlug(slug: string, maxLength: number = 100): string {
	if (slug.length <= maxLength) {
		return slug;
	}

	// Truncate and find last hyphen
	const truncated = slug.substring(0, maxLength);
	const lastHyphen = truncated.lastIndexOf('-');

	// If we found a hyphen, cut there for cleaner truncation
	if (lastHyphen > 0) {
		return truncated.substring(0, lastHyphen);
	}

	return truncated;
}
