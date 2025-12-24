/**
 * Drizzle ORM configuration for Cloudflare D1.
 *
 * Configures Drizzle Kit for:
 * - Schema location and migration output directory
 * - SQLite dialect for D1 compatibility
 * - D1 HTTP driver for remote database access
 * - Cloudflare API credentials from environment variables
 *
 * Used by Drizzle Kit commands like:
 * - `drizzle-kit generate` - Generate SQL migrations from schema
 * - `drizzle-kit push` - Push schema changes to database
 * - `drizzle-kit studio` - Open Drizzle Studio GUI
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	driver: 'd1-http',
	dbCredentials: {
		accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
		databaseId: process.env.CLOUDFLARE_DATABASE_ID,
		token: process.env.CLOUDFLARE_API_TOKEN,
	},
});
