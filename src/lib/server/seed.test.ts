import { describe, expect, it, vi } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, folders, itemState, items, user } from './db/schema';
import { assertSafeToSeed } from '../../../scripts/seed-guard';
import { refreshSeededFeeds, seedDatabase } from '../../../scripts/seed-lib';
import { FeedFetchError, safeFetch } from './feeds/fetch';

vi.mock('./feeds/fetch', async (importOriginal) => ({
	...(await importOriginal<typeof import('./feeds/fetch')>()),
	safeFetch: vi.fn()
}));
import { DEV_USER, SEED_FEEDS, SEED_FOLDERS } from '../../../scripts/seed-data';

describe('seed guard', () => {
	it('allows localhost origins', () => {
		expect(() => assertSafeToSeed({ ORIGIN: 'http://localhost:5173' })).not.toThrow();
		expect(() =>
			assertSafeToSeed({ ORIGIN: 'http://127.0.0.1:5307', NODE_ENV: 'development' })
		).not.toThrow();
	});
	it('refuses production', () => {
		expect(() =>
			assertSafeToSeed({ NODE_ENV: 'production', ORIGIN: 'http://localhost:5173' })
		).toThrow(/production/);
	});
	it('refuses production in any casing or padding', () => {
		for (const value of [
			'Production',
			'PRODUCTION',
			' production',
			'production ',
			'production\n'
		]) {
			expect(() => assertSafeToSeed({ NODE_ENV: value, ORIGIN: 'http://localhost:5173' })).toThrow(
				/production/
			);
		}
	});
	it('handles tricky origins', () => {
		for (const origin of [
			'http://localhost@evil.com',
			'http://user:pw@localhost',
			'http://localhost.:5173',
			'http://localhost.evil.com'
		]) {
			expect(() => assertSafeToSeed({ ORIGIN: origin })).toThrow(/ORIGIN/);
		}
		for (const origin of ['http://LOCALHOST:8080', 'http://localhost:5173', 'http://[::1]:3000']) {
			expect(() => assertSafeToSeed({ ORIGIN: origin })).not.toThrow();
		}
	});
	it('restricts DATABASE_URL to the project directory', () => {
		const base = { ORIGIN: 'http://localhost:5173' };
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: '/data/app.db' }, '/proj')).toThrow(
			/DATABASE_URL/
		);
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: '../x.db' }, '/proj')).toThrow(
			/DATABASE_URL/
		);
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: 'local.db' }, '/proj')).not.toThrow();
		expect(() =>
			assertSafeToSeed({ ...base, DATABASE_URL: '/proj/local.db' }, '/proj')
		).not.toThrow();
	});
	it('refuses non-local or missing origins', () => {
		expect(() => assertSafeToSeed({ ORIGIN: 'https://reader.example.org' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({ ORIGIN: 'https://localhost.evil.example' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({ ORIGIN: 'not a url' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({})).toThrow(/ORIGIN/);
	});
});

describe('seedDatabase', () => {
	function snapshot(db: ReturnType<typeof connectDatabase>['db']) {
		const n = (rows: { n: number }[]) => rows[0].n;
		return {
			users: n(db.select({ n: count() }).from(user).all()),
			folders: n(db.select({ n: count() }).from(folders).all()),
			feeds: n(db.select({ n: count() }).from(feeds).all()),
			items: n(db.select({ n: count() }).from(items).all()),
			state: n(db.select({ n: count() }).from(itemState).all())
		};
	}

	it('queues real feeds only, without items or state', async () => {
		const { client, db } = connectDatabase(':memory:');
		migrateDatabase(db);
		const summary = await seedDatabase(db);
		expect(summary.feeds).toBe(SEED_FEEDS.length);
		expect(summary.folders).toBe(SEED_FOLDERS.length);
		expect(snapshot(db)).toMatchObject({ users: 1, items: 0, state: 0 });
		const all = db.select().from(feeds).all();
		expect(all).toHaveLength(SEED_FEEDS.length);
		for (const feed of all) {
			expect(feed.url).toMatch(/^https:\/\//);
			expect(feed.url).not.toMatch(/example\.(com|org|net)/);
			expect(feed.lastFetchedAt).toBeNull();
			expect(feed.errorCount).toBe(0);
			expect(feed.nextFetchAt!.getTime()).toBeLessThanOrEqual(Date.now());
		}
		const byUrl = new Map(all.map((f) => [f.url, f]));
		expect(byUrl.get('https://news.ycombinator.com/rss')!.refreshIntervalMinutes).toBe(15);
		expect(byUrl.get('https://lobste.rs/rss')!.refreshIntervalMinutes).toBe(30);
		for (const url of [
			'https://techcrunch.com/feed/',
			'https://www.wired.com/feed/rss',
			'https://feeds.bbci.co.uk/news/rss.xml'
		]) {
			expect(byUrl.get(url)!.extractFullText).toBe(true);
		}
		expect(all.filter((f) => f.extractFullText)).toHaveLength(3);
		expect(byUrl.get('https://kottke.org/feed')).toBeDefined();
		expect(all.some((f) => f.folderId === null)).toBe(true);
		const folderRows = db.select().from(folders).all();
		const nature = byUrl.get('https://www.nature.com/nature.rss')!;
		expect(folderRows.find((f) => f.id === nature.folderId)?.name).toBe('Science');
		client.close();
	});

	it('is idempotent and recreates the dev user', async () => {
		const { client, db } = connectDatabase(':memory:');
		migrateDatabase(db);
		const first = await seedDatabase(db);
		const before = snapshot(db);
		const second = await seedDatabase(db);
		expect(snapshot(db)).toEqual(before);
		expect(second.userId).not.toBe(first.userId);
		expect(db.select().from(user).where(eq(user.email, DEV_USER.email)).all()).toHaveLength(1);
		client.close();
	});

	it('has unique, valid feed URLs and known folders', () => {
		const urls = SEED_FEEDS.map((f) => new URL(f.url).href);
		expect(new Set(urls).size).toBe(urls.length);
		for (const feed of SEED_FEEDS) {
			if (feed.folder) expect(SEED_FOLDERS).toContain(feed.folder);
		}
	});

	it('--refresh reports failed feeds with their safe error', async () => {
		vi.mocked(safeFetch).mockRejectedValue(new FeedFetchError('Remote server returned HTTP 404.'));
		const { client, db } = connectDatabase(':memory:');
		migrateDatabase(db);
		const seeded = await seedDatabase(db);
		const result = await refreshSeededFeeds(db, seeded.userId);
		expect(result.failed).toBe(SEED_FEEDS.length);
		expect(result.failures).toHaveLength(SEED_FEEDS.length);
		expect(result.failures[0].error).toBe('Remote server returned HTTP 404.');
		client.close();
	});
});
