import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { connectDatabase } from '../db/connect';
import { migrateDatabase } from '../db/migrate';
import { feeds, items, user } from '../db/schema';
import { createFeedService } from './subscribe';
import { parseFeed } from './parse';
import { safeFetch } from './fetch';

vi.mock('./fetch', () => ({ safeFetch: vi.fn() }));
let connection: ReturnType<typeof connectDatabase>;
let service: ReturnType<typeof createFeedService>;
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

beforeEach(() => {
	vi.resetAllMocks();
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	connection.db
		.insert(user)
		.values([
			{ id: 'owner', email: 'owner@example.com', name: 'Owner' },
			{ id: 'other', email: 'other@example.com', name: 'Other' }
		])
		.run();
	service = createFeedService(connection.db);
	vi.mocked(safeFetch).mockImplementation(async (input) => {
		const url = input.toString();
		return {
			url,
			status: 200,
			headers: new Headers({ etag: 'v1' }),
			body: fixture(url.endsWith('/') ? 'site.html' : 'rss.xml')
		};
	});
});
afterEach(() => connection.client.close());

describe('subscription and immediate ingestion', () => {
	it('stores the same 30-minute refresh default for discovered and OPML-queued feeds', async () => {
		const subscribed = await service.subscribeToFeed('owner', 'https://example.com/rss');
		vi.mocked(safeFetch).mockClear();
		expect(service.queueFeed('owner', 'https://example.com/imported', 'Imported')).toBe(1);
		const queued = service
			.list('owner')
			.feeds.find((feed) => feed.url === 'https://example.com/imported');
		expect(subscribed.refreshIntervalMinutes).toBe(30);
		expect(queued?.refreshIntervalMinutes).toBe(30);
		expect(safeFetch).not.toHaveBeenCalled();
	});
	it('discovers a website feed, ingests immediately and deduplicates repeat subscriptions', async () => {
		const folder = service.createFolder('owner', 'News');
		const feed = await service.subscribeToFeed('owner', 'https://example.com/', folder.id);
		expect(feed).toMatchObject({
			folderId: folder.id,
			url: 'https://example.com/blog/feed.xml?one=1&two=2',
			etag: 'v1'
		});
		expect(feed.lastFetchedAt).toBeInstanceOf(Date);
		expect(feed.refreshIntervalMinutes).toBe(30);
		expect(feed.nextFetchAt!.getTime() - feed.lastFetchedAt!.getTime()).toBe(30 * 60_000);
		expect(connection.db.select().from(items).all()).toHaveLength(3);
		expect((await service.subscribeToFeed('owner', 'https://example.com/')).id).toBe(feed.id);
		expect(service.list('owner').feeds).toHaveLength(1);
		expect(connection.db.select().from(items).all()).toHaveLength(3);
	});
	it('deduplicates by GUID but preserves distinct GUIDs sharing a link, keeps user copies independent', async () => {
		const feed = await service.subscribeToFeed('owner', 'https://example.com/rss');
		const parsed = await parseFeed(fixture('rss.xml'), feed.url);
		expect(
			service.ingestItems(feed.id, [parsed.items[0], { ...parsed.items[0], guid: 'new-guid' }])
		).toBe(1);
		expect(
			connection.db.select().from(items).where(eq(items.link, parsed.items[0].link!)).all()
		).toHaveLength(2);
		// Link-fallback GUIDs still deduplicate without conflating explicit IDs.
		expect(service.ingestItems(feed.id, [parsed.items[1], parsed.items[1]])).toBe(0);
		const item = {
			...parsed.items[0],
			guid: 'new',
			link: 'https://example.com/new',
			content: '<p onclick="bad()">Safe</p><script>bad()</script>'
		};
		expect(service.ingestItems(feed.id, [item, item])).toBe(1);
		expect(connection.db.select().from(items).where(eq(items.guid, 'new')).get()?.content).toBe(
			'<p>Safe</p>'
		);
		await service.subscribeToFeed('other', feed.url);
		expect(connection.db.select().from(items).all()).toHaveLength(8);
	});
	it('resolves relative content again at the ingest boundary before storage', async () => {
		const feed = await service.subscribeToFeed('owner', 'https://example.com/rss');
		const parsed = await parseFeed(fixture('rss.xml'), feed.url);
		const item = {
			...parsed.items[0],
			guid: 'relative',
			link: 'https://articles.example/posts/one',
			content: '<img src="image.png">',
			summary: '<a href="../next">Next</a>'
		};
		expect(service.ingestItems(feed.id, [item])).toBe(1);
		expect(connection.db.select().from(items).where(eq(items.guid, item.guid)).get()).toMatchObject(
			{
				content: '<img src="https://articles.example/posts/image.png" />',
				summary:
					'<a href="https://articles.example/next" rel="noopener noreferrer nofollow">Next</a>'
			}
		);
	});
	it('does not persist a subscription if fetch/parse fails', async () => {
		vi.mocked(safeFetch).mockRejectedValue(new Error('Unavailable'));
		await expect(service.subscribeToFeed('owner', 'https://example.com/')).rejects.toThrow();
		expect(service.list('owner').feeds).toHaveLength(0);
	});
});

describe('user-scoped management', () => {
	it('creates, renames, assigns, unassigns and deletes folders without deleting articles', async () => {
		const folder = service.createFolder('owner', ' News ');
		expect(folder.name).toBe('News');
		service.renameFolder('owner', folder.id, 'Reading');
		const feed = await service.subscribeToFeed('owner', 'https://example.com/rss');
		service.moveFeed('owner', feed.id, folder.id);
		expect(service.list('owner').feeds[0].folderId).toBe(folder.id);
		service.moveFeed('owner', feed.id);
		expect(service.list('owner').feeds[0].folderId).toBeNull();
		service.moveFeed('owner', feed.id, folder.id);
		service.deleteFolder('owner', folder.id);
		expect(service.list('owner').folders).toHaveLength(0);
		expect(service.list('owner').feeds[0].folderId).toBeNull();
		expect(connection.db.select().from(items).all()).toHaveLength(3);
		service.removeFeed('owner', feed.id);
		expect(connection.db.select().from(items).all()).toHaveLength(0);
	});
	it('rejects foreign feed/folder IDs and invalid folder names', async () => {
		const folder = service.createFolder('owner', 'Private');
		const feed = await service.subscribeToFeed('owner', 'https://example.com/rss', folder.id);
		expect(service.list('other')).toEqual({ feeds: [], folders: [] });
		for (const action of [
			() => service.removeFeed('other', feed.id),
			() => service.moveFeed('other', feed.id),
			() => service.renameFolder('other', folder.id, 'Stolen'),
			() => service.deleteFolder('other', folder.id),
			() => service.createFolder('owner', '  '),
			() => service.createFolder('owner', 'x'.repeat(201))
		])
			expect(action).toThrow();
		await expect(service.subscribeToFeed('other', feed.url, folder.id)).rejects.toThrow(
			'Folder not found'
		);
		const otherFeed = await service.subscribeToFeed('other', feed.url);
		expect(() => service.moveFeed('other', otherFeed.id, folder.id)).toThrow('Folder not found');
		expect(connection.db.select().from(feeds).all()).toHaveLength(2);
	});
});
