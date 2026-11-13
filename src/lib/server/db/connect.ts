import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { htmlToSearchText, stripControlChars } from './search-text';
import * as schema from './schema';

export function connectDatabase(url: string) {
	const client = new Database(url);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	// Used by the items_fts triggers (see drizzle/0002_items_fts.sql); must exist on every
	// connection that writes items, including the one that runs migrations.
	client.function(
		'item_search_text',
		{ deterministic: true, varargs: true },
		(...parts: unknown[]) =>
			parts.map((part) => (typeof part === 'string' ? htmlToSearchText(part) : '')).join(' ')
	);
	client.function('item_clean_title', { deterministic: true }, (title: unknown) =>
		typeof title === 'string' ? stripControlChars(title) : ''
	);
	return { client, db: drizzle(client, { schema }) };
}

export type AppDatabase = ReturnType<typeof connectDatabase>['db'];
