/**
 * Shared utility for fuzzy slug filtering
 */

/**
 * Filter entities by slug using substring matching (case-insensitive)
 *
 * @param entities - Array of entities with slug property
 * @param filters - Array of filter strings (e.g., ["aldwin", "workshop"])
 * @returns Filtered entities where slug contains any filter term
 *
 * @example
 * filterEntitiesBySlug(characters, ["aldwin"])
 * // Matches: "aldwin-gentleheart", "aldwin", "sister-aldwin"
 *
 * filterEntitiesBySlug(locations, ["workshop"])
 * // Matches: "cids-workshop", "workshop-zone", "the-workshop"
 */
export function filterEntitiesBySlug<T extends { slug: string }>(
  entities: T[],
  filters: string[] | undefined
): T[] {
  // No filter → return all entities
  if (!filters || filters.length === 0) {
    return entities;
  }

  // Normalize filters: lowercase, trim, remove empty
  const normalizedFilters = filters.map((f) => f.toLowerCase().trim()).filter(Boolean);

  if (normalizedFilters.length === 0) {
    return entities;
  }

  // Return entities where slug contains ANY filter term (case-insensitive)
  return entities.filter((entity) => {
    const slugLower = entity.slug.toLowerCase();
    return normalizedFilters.some((filter) => slugLower.includes(filter));
  });
}
