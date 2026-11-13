import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { AppDatabase } from './connect';

/** Deploy the generated drizzle/ directory alongside the server; run from the app root. */
export function migrateDatabase(db: AppDatabase) {
	migrate(db, { migrationsFolder: resolve('drizzle') });
}
