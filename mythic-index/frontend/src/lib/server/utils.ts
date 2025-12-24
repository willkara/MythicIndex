/**
 * Valid content type identifiers used throughout the application.
 *
 * Defines the allowed kinds of content that can be stored and retrieved.
 * Used for type safety and validation of content operations.
 */
export const VALID_KINDS = [
  'chapter',
  'character',
  'location',
  'lore',
  'worldbuilding',
  'update',
  'timeline_event',
] as const;

/**
 * Type representing valid content kinds.
 *
 * Derived from VALID_KINDS constant to ensure type safety when working
 * with content types.
 */
export type ContentKind = (typeof VALID_KINDS)[number];

/**
 * Type guard to check if a string is a valid content kind.
 *
 * Validates that a given string matches one of the defined content kinds,
 * providing type narrowing for TypeScript.
 *
 * @param kind - The string to validate
 * @returns True if the string is a valid ContentKind, false otherwise
 *
 * @example
 * ```typescript
 * const userInput = 'chapter';
 * if (isValidKind(userInput)) {
 *   // userInput is now typed as ContentKind
 *   loadContent(db, userInput);
 * }
 * ```
 */
export function isValidKind(kind: string): kind is ContentKind {
  return VALID_KINDS.includes(kind as ContentKind);
}

/**
 * Resolves the base URL for image delivery based on environment.
 *
 * Returns the Cloudflare Images delivery URL if the account hash is
 * configured in the platform environment, otherwise falls back to
 * local image serving.
 *
 * @param platform - Optional SvelteKit platform object with environment bindings
 * @returns The base URL for image delivery
 *
 * @example
 * ```typescript
 * const baseUrl = resolveDeliveryBaseUrl(platform);
 * // Returns: 'https://imagedelivery.net/abc123' or '/images'
 * ```
 */
export function resolveDeliveryBaseUrl(platform?: App.Platform): string {
  // Use Cloudflare Images delivery URL if available
  const accountHash = platform?.env?.CLOUDFLARE_ACCOUNT_HASH;
  if (accountHash) {
    return `https://imagedelivery.net/${accountHash}`;
  }
  // Fallback to local images
  return '/images';
}
