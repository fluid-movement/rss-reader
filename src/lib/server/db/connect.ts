import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export function connectDatabase(url: string) {
	const client = new Database(url);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	return { client, db: drizzle(client, { schema }) };
}

export type AppDatabase = ReturnType<typeof connectDatabase>['db'];
