import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, items, user } from './db/schema';
import { createScheduler } from './scheduler';
import { FeedFetchError, safeFetch, type SafeFetchResult } from './feeds/fetch';
import { FeedParseError } from './feeds/parse';

vi.mock('./feeds/fetch', async (importOriginal) => ({
	...(await importOriginal<typeof import('./feeds/fetch')>()),
	safeFetch: vi.fn()
}));
let connection: ReturnType<typeof connectDatabase>;
let scheduler: ReturnType<typeof createScheduler>;
const now = new Date('2026-11-13T10:00:00Z');
const body = readFileSync(new URL('./feeds/fixtures/rss.xml', import.meta.url), 'utf8');
const response = (status = 200, headers: HeadersInit = { etag: 'v2' }): SafeFetchResult => ({
	url: 'https://example.com/rss',
	status,
	headers: new Headers(headers),
	body: status === 304 ? '' : body
});
function add(id: string, values: Partial<typeof feeds.$inferInsert> = {}) {
	connection.db
		.insert(feeds)
		.values({ id, userId: 'owner', title: 'My title', url: `https://example.com/${id}`, ...values })
		.run();
}
const get = (id: string) => connection.db.select().from(feeds).where(eq(feeds.id, id)).get()!;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(now);
	vi.resetAllMocks();
	vi.spyOn(Math, 'random').mockReturnValue(0);
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	connection.db
		.insert(user)
		.values([
			{ id: 'owner', email: 'owner@example.com', name: 'Owner' },
			{ id: 'other', email: 'other@example.com', name: 'Other' }
		])
		.run();
	scheduler = createScheduler(connection.db);
	vi.mocked(safeFetch).mockResolvedValue(response());
});
afterEach(async () => {
	await scheduler.stop();
	connection.client.close();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('refresh scheduler', () => {
	it('selects null and due timestamps across users, not future feeds', async () => {
		add('null');
		add('due', { userId: 'other', nextFetchAt: now });
		add('future', { nextFetchAt: new Date(now.getTime() + 1) });
		await scheduler.tick();
		expect(safeFetch).toHaveBeenCalledTimes(2);
		expect(get('null').lastFetchedAt).toEqual(now);
		expect(get('due').lastFetchedAt).toEqual(now);
		expect(get('future').lastFetchedAt).toBeNull();
	});
	it('starts once, ticks every minute and stops', async () => {
		add('one');
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		scheduler.start();
		scheduler.start();
		await scheduler.tick();
		expect(vi.getTimerCount()).toBe(1);
		expect(info).toHaveBeenCalledExactlyOnceWith('Feed scheduler started (60-second interval).');
		expect(safeFetch).toHaveBeenCalledTimes(1);
		connection.db.update(feeds).set({ nextFetchAt: null }).run();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(safeFetch).toHaveBeenCalledTimes(2);
		await scheduler.stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(safeFetch).toHaveBeenCalledTimes(2);
	});
	it('uses validators and accepts 304 without parsing or dropping cached validators/items', async () => {
		add('one', {
			etag: 'v1',
			lastModified: 'Mon, 09 Nov 2026 00:00:00 GMT',
			refreshIntervalMinutes: 15
		});
		await scheduler.refreshFeed('one');
		const count = connection.db.select().from(items).all().length;
		connection.db.update(feeds).set({ errorCount: 3, lastError: 'Old error' }).run();
		vi.mocked(safeFetch).mockResolvedValue(response(304, { etag: 'v3' }));
		await scheduler.refreshFeed('one');
		expect(safeFetch).toHaveBeenLastCalledWith('https://example.com/one', {
			headers: { 'If-None-Match': 'v2' }
		});
		expect(vi.mocked(safeFetch).mock.calls[0][1]?.headers).toEqual({
			'If-None-Match': 'v1',
			'If-Modified-Since': 'Mon, 09 Nov 2026 00:00:00 GMT'
		});
		expect(get('one')).toMatchObject({
			etag: 'v3',
			errorCount: 0,
			lastError: null,
			lastFetchedAt: now,
			nextFetchAt: new Date(now.getTime() + 15 * 60_000)
		});
		expect(connection.db.select().from(items).all()).toHaveLength(count);
		vi.mocked(safeFetch).mockResolvedValue(response(304, {}));
		await scheduler.refreshFeed('one');
		expect(get('one').etag).toBe('v3');
	});
	it('ingests with deduplication and fills only empty metadata, clearing obsolete validators', async () => {
		add('empty', { title: '', etag: 'old', siteUrl: null, refreshIntervalMinutes: 0 });
		vi.mocked(safeFetch).mockResolvedValue(response(200, {}));
		await scheduler.refreshFeed('empty');
		expect(get('empty').title).not.toBe('');
		expect(get('empty').siteUrl).toBeTruthy();
		expect(get('empty').etag).toBeNull();
		expect(get('empty').nextFetchAt).toEqual(new Date(now.getTime() + 30 * 60_000));
		const count = connection.db.select().from(items).all().length;
		connection.db.update(feeds).set({ title: 'Custom', siteUrl: 'https://custom.example' }).run();
		await scheduler.refreshFeed('empty');
		expect(get('empty')).toMatchObject({ title: 'Custom', siteUrl: 'https://custom.example' });
		expect(connection.db.select().from(items).all()).toHaveLength(count);
	});
	it('backs off exponentially up to four hours and records a bounded error without changing last success', async () => {
		add('bad', { lastFetchedAt: now });
		vi.mocked(safeFetch).mockRejectedValue(new FeedFetchError('Unavailable\n' + 'x'.repeat(400)));
		for (const minutes of [5, 10, 20, 40, 80, 160, 240, 240]) {
			await scheduler.refreshFeed('bad');
			expect(get('bad').nextFetchAt).toEqual(new Date(Date.now() + minutes * 60_000));
		}
		expect(get('bad')).toMatchObject({ errorCount: 8, lastFetchedAt: now });
		expect(get('bad').lastError).toHaveLength(300);
		expect(get('bad').lastError).not.toContain('\n');
		await scheduler.tick();
		expect(safeFetch).toHaveBeenCalledTimes(8);
	});
	it('backs off on invalid feed bodies too', async () => {
		add('bad');
		vi.mocked(safeFetch).mockResolvedValue({ ...response(), body: 'not a feed' });
		await scheduler.tick();
		expect(get('bad').errorCount).toBe(1);
	});
	it('logs unexpected errors server-side without storing their internal details', async () => {
		add('bad');
		const internal = new Error('SQLITE_ERROR: /private/database/users.db secret query details');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(safeFetch).mockRejectedValue(internal);
		expect(await scheduler.refreshFeed('bad', 'owner')).toEqual({ status: 'failed' });
		expect(get('bad').lastError).toBe('Feed refresh failed.');
		expect(log).toHaveBeenCalledExactlyOnceWith('Feed refresh failed', internal);
	});
	it('stores only bounded, single-line messages for known parse errors', async () => {
		add('bad');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(safeFetch).mockRejectedValue(new FeedParseError('Invalid\r\n\t' + 'x'.repeat(400)));
		await scheduler.refreshFeed('bad');
		expect(get('bad').lastError).toBe('Invalid ' + 'x'.repeat(292));
		expect(log).not.toHaveBeenCalled();
	});
	it('keeps both validators on 304 and adds at most five percent interval jitter', async () => {
		add('cached', {
			etag: 'cached-etag',
			lastModified: 'Mon, 09 Nov 2026 00:00:00 GMT',
			refreshIntervalMinutes: 30
		});
		vi.mocked(Math.random).mockReturnValue(0.5);
		vi.mocked(safeFetch).mockResolvedValue(response(304, {}));
		await scheduler.refreshFeed('cached');
		expect(get('cached')).toMatchObject({
			etag: 'cached-etag',
			lastModified: 'Mon, 09 Nov 2026 00:00:00 GMT',
			nextFetchAt: new Date(now.getTime() + 30 * 60_000 * 1.025)
		});
	});
	it('shares a global four-worker queue and feed locks across overlapping ticks and manual batches', async () => {
		for (let i = 0; i < 9; i++) add(String(i));
		let active = 0;
		let peak = 0;
		vi.mocked(safeFetch).mockImplementation(async () => {
			active++;
			peak = Math.max(active, peak);
			await new Promise((resolve) => setTimeout(resolve, 100));
			active--;
			return response(304);
		});
		const first = scheduler.tick();
		const second = scheduler.tick();
		const all = scheduler.refreshAll('owner');
		const duplicate = scheduler.refreshAll('owner');
		const one = scheduler.refreshFeed('0', 'owner');
		await vi.runAllTimersAsync();
		await Promise.all([first, second, all, duplicate, one]);
		expect(peak).toBe(4);
		expect(safeFetch).toHaveBeenCalledTimes(9);
	});
	it('scopes manual batches, checks ownership even while running, and rate limits repeat requests', async () => {
		add('mine');
		add('theirs', { userId: 'other' });
		const work = scheduler.refreshFeed('mine', 'owner');
		await expect(scheduler.refreshFeed('mine', 'other')).rejects.toThrow('Feed not found');
		await expect(scheduler.refreshFeed('missing', 'owner')).rejects.toThrow('Feed not found');
		await work;
		expect(await scheduler.refreshFeed('mine', 'owner')).toEqual({
			status: 'skipped',
			reason: 'recent'
		});
		expect(await scheduler.refreshAll('owner')).toEqual({ refreshed: 0, skipped: 1, failed: 0 });
		expect(safeFetch).toHaveBeenCalledTimes(1);
		expect(get('theirs').lastFetchedAt).toBeNull();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(await scheduler.refreshAll('owner')).toEqual({ refreshed: 1, skipped: 0, failed: 0 });
		expect(safeFetch).toHaveBeenCalledTimes(2);
	});
	it('summarizes refreshed, failed, and recently skipped feeds separately', async () => {
		add('recent');
		add('fresh');
		add('bad');
		await scheduler.refreshFeed('recent', 'owner');
		vi.mocked(safeFetch).mockImplementation(async (url) => {
			if (url.toString().endsWith('/bad')) throw new FeedFetchError('Unavailable');
			return response(304);
		});
		expect(await scheduler.refreshAll('owner')).toEqual({ refreshed: 1, skipped: 1, failed: 1 });
		expect(await scheduler.refreshAll('owner')).toEqual({ refreshed: 0, skipped: 3, failed: 0 });
	});
	it('prunes expired manual attempts on ticks even after the subscription is removed', async () => {
		add('expired-feed');
		await scheduler.refreshFeed('expired-feed', 'owner');
		connection.db.delete(feeds).where(eq(feeds.id, 'expired-feed')).run();
		const deleted = vi.spyOn(Map.prototype, 'delete');
		await scheduler.tick();
		expect(deleted).not.toHaveBeenCalledWith('expired-feed');
		await vi.advanceTimersByTimeAsync(30_000);
		await scheduler.tick();
		expect(deleted).toHaveBeenCalledWith('expired-feed');
	});
	it('does not recreate feeds deleted while fetch is in progress', async () => {
		add('removed');
		vi.mocked(safeFetch).mockImplementation(async () => {
			connection.db.delete(feeds).where(eq(feeds.id, 'removed')).run();
			return response();
		});
		await scheduler.refreshFeed('removed');
		expect(connection.db.select().from(items).all()).toHaveLength(0);
	});
});
