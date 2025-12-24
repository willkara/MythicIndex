import { getDb } from '$lib/server/db';
import { contentItem, character, location } from '$lib/server/db/schema';
import { asc, eq, sql } from 'drizzle-orm';
import type { LayoutServerLoad } from './$types';

/**
 * Search item for command palette
 */
interface SearchItem {
	id: string;
	title: string;
	slug: string;
	kind: 'chapter' | 'character' | 'location';
	summary: string | null;
}

/**
 * Layout data available to all pages
 */
export interface LayoutData {
	searchItems: SearchItem[];
}

/**
 * Root layout server load - provides global data like search items
 */
export const load: LayoutServerLoad<LayoutData> = async ({ platform }) => {
	// Handle missing DB gracefully
	if (!platform?.env?.DB) {
		return {
			searchItems: [],
		};
	}

	const db = getDb(platform.env.DB);

	try {
		// Fetch all searchable content in parallel
		const [characters, locations, chapters] = await Promise.all([
			db
				.select({
					id: character.id,
					name: character.name,
					slug: character.slug,
					summary: character.visualSummary,
				})
				.from(character)
				.orderBy(asc(character.name)),
			db
				.select({
					id: location.id,
					name: location.name,
					slug: location.slug,
					summary: location.quickDescription,
				})
				.from(location)
				.orderBy(asc(location.name)),
			db
				.select({
					id: contentItem.id,
					title: contentItem.title,
					slug: contentItem.slug,
					summary: contentItem.summary,
				})
				.from(contentItem)
				.where(eq(contentItem.kind, 'chapter'))
				.orderBy(
					asc(
						sql`CAST(SUBSTR(${contentItem.slug}, 3, CASE WHEN INSTR(SUBSTR(${contentItem.slug}, 3), '-') > 0 THEN INSTR(SUBSTR(${contentItem.slug}, 3), '-') - 1 ELSE LENGTH(${contentItem.slug}) END) AS REAL)`
					)
				),
		]);

		const searchItems: SearchItem[] = [
			...chapters.map(c => ({
				id: c.id,
				title: c.title,
				slug: c.slug,
				kind: 'chapter' as const,
				summary: c.summary,
			})),
			...characters.map(c => ({
				id: c.id,
				title: c.name,
				slug: c.slug,
				kind: 'character' as const,
				summary: c.summary,
			})),
			...locations.map(l => ({
				id: l.id,
				title: l.name,
				slug: l.slug,
				kind: 'location' as const,
				summary: l.summary,
			})),
		];

		return {
			searchItems,
		};
	} catch {
		return {
			searchItems: [],
		};
	}
};
