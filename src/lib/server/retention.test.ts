import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, items, itemState, prunedItems, user, userSettings } from './db/schema';
import { createFeedService } from './feeds/subscribe';
import { pruneExpiredItems, runRetentionJob } from './retention';

let connection: ReturnType<typeof connectDatabase>;
const now = new Date('2026-11-13T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const ftsCount = () =>
	connection.client.prepare('select count(*) as n from items_fts').get() as { n: number };

function add(
	id: string,
	options: {
		feed?: string;
		age?: number | null;
		fetchedAge?: number;
		read?: boolean;
		starred?: boolean;
		user?: string;
	} = {}
) {
	const { db } = connection;
	db.insert(items)
		.values({
			id,
			feedId: options.feed ?? 'feed',
			guid: id,
			title: `Title ${id}`,
			publishedAt: options.age === null ? null : daysAgo(options.age ?? 100),
			fetchedAt: daysAgo(options.fetchedAge ?? options.age ?? 100)
		})
		.run();
	if (options.read || options.starred)
		db.insert(itemState)
			.values({
				userId: options.user ?? 'owner',
				itemId: id,
				readAt: options.read ? daysAgo(1) : null,
				starredAt: options.starred ? daysAgo(1) : null
			})
			.run();
}
const ids = () =>
	connection.db
		.select({ id: items.id })
		.from(items)
		.all()
		.map((row) => row.id)
		.sort();

beforeEach(() => {
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	const { db } = connection;
	db.insert(user)
		.values([
			{ id: 'owner', email: 'owner@example.com', name: 'Owner' },
			{ id: 'other', email: 'other@example.com', name: 'Other' }
		])
		.run();
	db.insert(userSettings)
		.values([
			{ userId: 'owner', retentionDays: 30 },
			{ userId: 'other', retentionDays: 365 }
		])
		.run();
	db.insert(feeds)
		.values([
			{ id: 'feed', userId: 'owner', title: 'F', url: 'https://example.com/a' },
			{ id: 'other-feed', userId: 'other', title: 'O', url: 'https://example.com/b' }
		])
		.run();
});
afterEach(() => connection.client.close());

describe('retention pruning', () => {
	it('deletes only read, unstarred items older than the retention setting', async () => {
		add('old-read', { read: true });
		add('old-unread');
		add('old-starred', { starred: true });
		add('old-read-starred', { read: true, starred: true });
		add('new-read', { age: 5, read: true });
		add('new-unread', { age: 5 });
		expect(await pruneExpiredItems(connection.db, { now })).toBe(1);
		expect(ids()).toEqual([
			'new-read',
			'new-unread',
			'old-read-starred',
			'old-starred',
			'old-unread'
		]);
	});

	it('applies each owner’s own retention and ignores other users’ state', async () => {
		add('mine-60', { age: 60, read: true });
		add('theirs-60', { feed: 'other-feed', age: 60, read: true, user: 'other' });
		add('theirs-400', { feed: 'other-feed', age: 400, read: true, user: 'other' });
		// Read by someone else only: still unread for the owner of the feed.
		add('foreign-read', { age: 100, read: true, user: 'other' });
		await pruneExpiredItems(connection.db, { now });
		expect(ids()).toEqual(['foreign-read', 'theirs-60']);
	});

	it('falls back to the default without a settings row and keeps everything when disabled', async () => {
		connection.db.delete(userSettings).where(eq(userSettings.userId, 'owner')).run();
		add('a', { age: 40, read: true });
		add('b', { age: 20, read: true });
		await pruneExpiredItems(connection.db, { now });
		expect(ids()).toEqual(['b']);
		connection.db
			.update(userSettings)
			.set({ retentionDays: 0 })
			.where(eq(userSettings.userId, 'other'))
			.run();
		add('c', { feed: 'other-feed', age: 4000, read: true, user: 'other' });
		await pruneExpiredItems(connection.db, { now });
		expect(ids()).toEqual(['b', 'c']);
	});

	it('uses fetched_at for undated items', async () => {
		add('undated-old', { age: null, fetchedAge: 90, read: true });
		add('undated-new', { age: null, fetchedAge: 2, read: true });
		await pruneExpiredItems(connection.db, { now });
		expect(ids()).toEqual(['undated-new']);
	});

	it('cascades item state and search rows', async () => {
		add('gone', { read: true });
		add('kept', { age: 1 });
		expect(ftsCount().n).toBe(2);
		await pruneExpiredItems(connection.db, { now });
		expect(connection.db.select().from(itemState).all()).toHaveLength(0);
		expect(ftsCount().n).toBe(1);
	});

	it('deletes in bounded batches and yields between them', async () => {
		for (let i = 0; i < 7; i++) add(`n${i}`, { read: true });
		let yields = 0;
		const count = await pruneExpiredItems(connection.db, {
			now,
			batchSize: 3,
			yieldToLoop: async () => {
				yields++;
				// Every earlier batch is already committed when the loop gets control.
				expect(ids().length).toBe(7 - yields * 3);
			}
		});
		expect(count).toBe(7);
		expect(yields).toBe(2);
		expect(ids()).toEqual([]);
	});

	it('does not resurrect pruned items that are still in the feed', async () => {
		const service = createFeedService(connection.db);
		const entries = [
			{
				guid: 'dated',
				link: null,
				title: 'Dated',
				content: null,
				summary: null,
				author: null,
				publishedAt: daysAgo(100)
			},
			{
				guid: 'undated',
				link: null,
				title: 'Undated',
				content: null,
				summary: null,
				author: null,
				publishedAt: null
			}
		];
		expect(service.ingestItems('feed', entries)).toBe(2);
		connection.db
			.update(items)
			.set({ fetchedAt: daysAgo(100) })
			.run();
		connection.db
			.insert(itemState)
			.values(ids().map((itemId) => ({ userId: 'owner', itemId, readAt: now })))
			.run();
		expect(await pruneExpiredItems(connection.db, { now })).toBe(2);
		expect(connection.db.select().from(prunedItems).all()).toHaveLength(2);
		// The next refresh still lists both; neither may come back as a new unread item.
		expect(service.ingestItemIds('feed', entries)).toEqual([]); // nothing to extract either
		expect(ids()).toEqual([]);
		// Genuinely new entries are still ingested.
		expect(service.ingestItems('feed', [{ ...entries[0], guid: 'fresh', publishedAt: now }])).toBe(
			1
		);
		// Tombstones go away with their feed.
		connection.db.delete(feeds).where(eq(feeds.id, 'feed')).run();
		expect(connection.db.select().from(prunedItems).all()).toHaveLength(0);
	});

	it('runRetentionJob logs a count and never throws', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		add('x', { read: true });
		expect(await runRetentionJob(connection.db, { now })).toBe(1);
		connection.client.close();
		await expect(runRetentionJob(connection.db, { now })).resolves.toBe(0);
		connection = connectDatabase(':memory:');
	});
});
