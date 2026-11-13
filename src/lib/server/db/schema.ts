import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth.schema';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const userId = () =>
	text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' });
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const folders = sqliteTable(
	'folders',
	{
		id: id(),
		userId: userId(),
		name: text('name').notNull()
	},
	(table) => [index('folders_user_idx').on(table.userId)]
);

export const feeds = sqliteTable(
	'feeds',
	{
		id: id(),
		userId: userId(),
		url: text('url').notNull(),
		siteUrl: text('site_url'),
		title: text('title').notNull(),
		folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
		refreshIntervalMinutes: integer('refresh_interval_minutes').notNull().default(60),
		extractFullText: integer('extract_full_text', { mode: 'boolean' }).notNull().default(false),
		etag: text('etag'),
		lastModified: text('last_modified'),
		lastFetchedAt: timestamp('last_fetched_at'),
		nextFetchAt: timestamp('next_fetch_at'),
		errorCount: integer('error_count').notNull().default(0),
		lastError: text('last_error')
	},
	(table) => [
		uniqueIndex('feeds_user_url_unique').on(table.userId, table.url),
		index('feeds_folder_idx').on(table.folderId),
		index('feeds_next_fetch_idx').on(table.nextFetchAt)
	]
);

// Items are user-scoped through their private feed, including cascading deletion.
export const items = sqliteTable(
	'items',
	{
		id: id(),
		feedId: text('feed_id')
			.notNull()
			.references(() => feeds.id, { onDelete: 'cascade' }),
		guid: text('guid').notNull(),
		link: text('link'),
		title: text('title').notNull(),
		content: text('content'),
		fullContent: text('full_content'),
		summary: text('summary'),
		author: text('author'),
		publishedAt: timestamp('published_at'),
		fetchedAt: timestamp('fetched_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [
		uniqueIndex('items_feed_guid_unique').on(table.feedId, table.guid),
		index('items_feed_published_idx').on(table.feedId, table.publishedAt)
	]
);

export const itemState = sqliteTable(
	'item_state',
	{
		id: id(),
		userId: userId(),
		itemId: text('item_id')
			.notNull()
			.references(() => items.id, { onDelete: 'cascade' }),
		readAt: timestamp('read_at'),
		starredAt: timestamp('starred_at')
	},
	(table) => [
		uniqueIndex('item_state_user_item_unique').on(table.userId, table.itemId),
		index('item_state_item_idx').on(table.itemId)
	]
);

export const userSettings = sqliteTable('user_settings', {
	userId: userId().primaryKey(),
	retentionDays: integer('retention_days').notNull().default(30),
	readerFontSize: integer('reader_font_size').notNull().default(18),
	readerWidth: integer('reader_width').notNull().default(720)
});

export * from './auth.schema';
