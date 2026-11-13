import { and, eq, isNull, lte, or } from 'drizzle-orm';
import type { AppDatabase } from './db/connect';
import { feeds } from './db/schema';
import { extractNewItems } from './feeds/extract';
import { FeedFetchError, safeFetch } from './feeds/fetch';
import { FeedParseError, parseFeed } from './feeds/parse';
import { createFeedService, FeedValidationError } from './feeds/subscribe';

const MINUTE = 60_000;
const MAX_BACKOFF = 4 * 60 * MINUTE;
const MANUAL_COOLDOWN = 30_000;

export type RefreshResult =
	{ status: 'refreshed' | 'failed' } | { status: 'skipped'; reason: 'recent' };
export interface RefreshSummary {
	refreshed: number;
	skipped: number;
	failed: number;
}

/** One shared queue bounds automatic AND manual requests, including queued work. */
export function createScheduler(db: AppDatabase) {
	const service = createFeedService(db);
	const running = new Map<string, Promise<RefreshResult>>();
	const manualAttempts = new Map<string, number>();
	let stopping = new AbortController();
	const extractions = new Set<Promise<void>>();
	const batches = new Map<string, Promise<RefreshSummary>>();
	const queue: Array<() => void> = [];
	let active = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let ticking: Promise<void> | undefined;
	function drain() {
		while (active < 4 && queue.length) queue.shift()!();
	}
	function pruneManualAttempts() {
		const cutoff = Date.now() - MANUAL_COOLDOWN;
		for (const [feedId, attemptedAt] of manualAttempts) {
			if (attemptedAt <= cutoff) manualAttempts.delete(feedId);
		}
	}

	async function fetchFeed(feedId: string): Promise<RefreshResult> {
		// Re-read after queueing: a subscription may have been removed or edited.
		const feed = db.select().from(feeds).where(eq(feeds.id, feedId)).get();
		if (!feed) return { status: 'refreshed' };
		try {
			const response = await safeFetch(feed.url, {
				headers: {
					...(feed.etag ? { 'If-None-Match': feed.etag } : {}),
					...(feed.lastModified ? { 'If-Modified-Since': feed.lastModified } : {})
				}
			});
			const parsed =
				response.status === 304 ? undefined : await parseFeed(response.body, response.url);
			let newItemIds: string[] = [];
			const now = new Date();
			const interval = feed.refreshIntervalMinutes > 0 ? feed.refreshIntervalMinutes : 30;
			db.transaction(() => {
				// Do not insert orphaned items if the user unsubscribed during the fetch.
				const current = db.select().from(feeds).where(eq(feeds.id, feedId)).get();
				if (!current) return;
				if (parsed) newItemIds = service.ingestItemIds(feedId, parsed.items);
				db.update(feeds)
					.set({
						errorCount: 0,
						lastError: null,
						lastFetchedAt: now,
						nextFetchAt: new Date(now.getTime() + interval * MINUTE * (1 + Math.random() * 0.05)),
						etag: response.headers.get('etag') ?? (response.status === 304 ? feed.etag : null),
						lastModified:
							response.headers.get('last-modified') ??
							(response.status === 304 ? feed.lastModified : null),
						...(parsed && !current.title ? { title: parsed.title } : {}),
						...(parsed && !current.siteUrl ? { siteUrl: parsed.siteUrl } : {})
					})
					.where(eq(feeds.id, feedId))
					.run();
			});
			if (feed.extractFullText && newItemIds.length) {
				// Never fails the refresh; bounded concurrency and per-refresh cap.
				const job = extractNewItems(db, newItemIds, {
					signal: stopping.signal
				}).finally(() => extractions.delete(job));
				extractions.add(job);
			}
			return { status: 'refreshed' };
		} catch (error) {
			const safeError = error instanceof FeedFetchError || error instanceof FeedParseError;
			if (!safeError) console.error('Feed refresh failed', error);
			const errorCount = feed.errorCount + 1;
			const delay = Math.min(MAX_BACKOFF, 5 * MINUTE * 2 ** Math.min(errorCount - 1, 10));
			db.update(feeds)
				.set({
					errorCount,
					lastError: (safeError ? error.message : 'Feed refresh failed.')
						.replace(/[\r\n\t]+/g, ' ')
						.slice(0, 300),
					nextFetchAt: new Date(Date.now() + delay)
				})
				.where(eq(feeds.id, feedId))
				.run();
			return { status: 'failed' };
		}
	}

	function refreshFeed(feedId: string, userId?: string): Promise<RefreshResult> {
		// Check ownership BEFORE joining another caller's in-flight refresh.
		const feed = db
			.select()
			.from(feeds)
			.where(and(eq(feeds.id, feedId), userId === undefined ? undefined : eq(feeds.userId, userId)))
			.get();
		if (!feed) return Promise.reject(new FeedValidationError('Feed not found.'));
		const existing = running.get(feedId);
		if (existing) return existing;
		if (userId !== undefined) {
			pruneManualAttempts();
			const last = manualAttempts.get(feedId);
			if (last !== undefined) return Promise.resolve({ status: 'skipped', reason: 'recent' });
			manualAttempts.set(feedId, Date.now());
		}
		// Reserve before draining so overlapping batches cannot enqueue the same feed.
		const work = new Promise<RefreshResult>((resolve, reject) => {
			queue.push(() => {
				active++;
				void fetchFeed(feedId)
					.finally(() => {
						active--;
						running.delete(feedId);
						drain();
					})
					.then(resolve, reject);
			});
		});
		running.set(feedId, work);
		drain();
		return work;
	}

	function refreshAll(userId: string): Promise<RefreshSummary> {
		const existing = batches.get(userId);
		if (existing) return existing;
		const work = Promise.all(
			db
				.select({ id: feeds.id })
				.from(feeds)
				.where(eq(feeds.userId, userId))
				.all()
				.map((feed) => refreshFeed(feed.id, userId))
		)
			.then((results) => ({
				refreshed: results.filter((result) => result.status === 'refreshed').length,
				skipped: results.filter((result) => result.status === 'skipped').length,
				failed: results.filter((result) => result.status === 'failed').length
			}))
			.finally(() => batches.delete(userId));
		batches.set(userId, work);
		return work;
	}

	function tick(): Promise<void> {
		pruneManualAttempts();
		// Wait for the whole batch: slow batches delay subsequent ticks (acceptable for v1).
		if (ticking) return ticking;
		ticking = Promise.all(
			db
				.select({ id: feeds.id })
				.from(feeds)
				.where(or(isNull(feeds.nextFetchAt), lte(feeds.nextFetchAt, new Date())))
				.all()
				.map((feed) => refreshFeed(feed.id))
		)
			.then(() => undefined)
			.finally(() => {
				ticking = undefined;
			});
		return ticking;
	}

	function start() {
		if (timer) return;
		console.info('Feed scheduler started (60-second interval).');
		const run = () => {
			void tick().catch((error: unknown) => console.error('Feed scheduler tick failed', error));
		};
		timer = setInterval(run, MINUTE);
		timer.unref?.();
		run();
	}

	/** Stop new ticks and wait for already queued/running refreshes. */
	async function stop() {
		clearInterval(timer);
		timer = undefined;
		// Extraction is best effort: cancel it and never let it delay shutdown.
		stopping.abort();
		await Promise.allSettled([...running.values(), ...extractions, ...(ticking ? [ticking] : [])]);
		stopping = new AbortController();
	}
	/** Resolves when background full-text extraction has finished (used by tests). */
	async function extractionsSettled() {
		await Promise.allSettled([...extractions]);
	}
	return { refreshFeed, refreshAll, tick, start, stop, extractionsSettled };
}

// Keep both the timer and its overlap locks across development module reloads.
const state = globalThis as typeof globalThis & {
	__rssScheduler?: ReturnType<typeof createScheduler>;
};
export function startScheduler(db: AppDatabase) {
	state.__rssScheduler ??= createScheduler(db);
	state.__rssScheduler.start();
}
async function scheduler() {
	if (!state.__rssScheduler) {
		const { db } = await import('./db');
		state.__rssScheduler ??= createScheduler(db);
	}
	return state.__rssScheduler;
}
export async function refreshFeed(feedId: string, userId?: string) {
	return (await scheduler()).refreshFeed(feedId, userId);
}
export async function refreshAll(userId: string) {
	return (await scheduler()).refreshAll(userId);
}
export async function stopScheduler() {
	await state.__rssScheduler?.stop();
}
