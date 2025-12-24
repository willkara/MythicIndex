import { drizzle } from 'drizzle-orm/d1';
import type { D1Database } from '@cloudflare/workers-types';
import * as schema from './schema';

/**
 * Creates a Drizzle ORM database instance configured for Cloudflare D1.
 *
 * This function initializes the Drizzle ORM with the provided D1 database
 * connection and includes the application's schema definitions for type-safe
 * database queries.
 *
 * @param d1 - The Cloudflare D1 database instance from the platform binding
 * @returns A configured Drizzle database instance with schema types
 *
 * @example
 * ```typescript
 * const db = getDb(platform.env.DB);
 * const items = await db.select().from(schema.contentItem);
 * ```
 */
export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/**
 * Type representing a configured Drizzle database instance.
 *
 * This type provides full TypeScript type safety for database operations,
 * including all tables defined in the schema and their relationships.
 */
export type Database = ReturnType<typeof getDb>;
