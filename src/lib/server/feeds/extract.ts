import { and, eq, isNotNull } from 'drizzle-orm';
import type { AppDatabase } from '../db/connect';
import { items } from '../db/schema';
import { sanitizeArticle, webUrl } from '../reader-content';
import { DomParseError, parseArticleInWorker } from './dom-worker';
import { FeedFetchError, safeFetch } from './fetch';

/** Article pages are capped well below the feed limit; extraction is best effort. */
export const MAX_ARTICLE_BYTES = 2 * 1024 * 1024;
const MAX_STORED_CHARS = 500_000;
const HTML_TYPE = /^(text\/html|application\/xhtml\+xml)\b/i;

/** Messages of this error are safe to show to users; anything else is logged only. */
export class ExtractError extends Error {}

/** Fetch, parse with Readability and sanitize. Throws ExtractError (safe message). */
export async function extractArticleHtml(link: string, signal?: AbortSignal): Promise<string> {
	const url = webUrl(link);
	if (!url) throw new ExtractError('This article has no valid link.');
	let page;
	try {
		page = await safeFetch(url, { maxBytes: MAX_ARTICLE_BYTES, timeoutMs: 10_000 });
	} catch (error) {
		if (error instanceof FeedFetchError) throw new ExtractError(error.message);
		throw error;
	}
	if (!HTML_TYPE.test(page.headers.get('content-type') ?? ''))
		throw new ExtractError('The article page is not HTML.');
	if (Buffer.byteLength(page.body) > MAX_ARTICLE_BYTES)
		throw new ExtractError('The article page is too large.');
	let parsed;
	try {
		parsed = await parseArticleInWorker(page.body, signal);
	} catch (error) {
		if (error instanceof DomParseError) throw new ExtractError(error.message);
		throw error;
	}
	const html = sanitizeArticle(parsed?.content ?? '', page.url).trim();
	if (!parsed || !html || !parsed.text.trim())
		throw new ExtractError('No article content was found on the page.');
	return html.slice(0, MAX_STORED_CHARS);
}

/** Extracts and stores full content for an item; returns the sanitized HTML. */
export async function extractItem(
	db: AppDatabase,
	itemId: string,
	signal?: AbortSignal
): Promise<string> {
	const item = db
		.select({ link: items.link })
		.from(items)
		.where(and(eq(items.id, itemId), isNotNull(items.link)))
		.get();
	if (!item?.link) throw new ExtractError('This article has no link to load.');
	const html = await extractArticleHtml(item.link, signal);
	// A stopped scheduler may already be closing the database.
	signal?.throwIfAborted();
	db.update(items).set({ fullContent: html }).where(eq(items.id, itemId)).run();
	return html;
}

/**
 * Best-effort extraction for freshly ingested items. Only the FIRST `cap` (10) ids of a
 * refresh are extracted and at most `concurrency` (2) run at once, so a large first fetch
 * cannot hammer a site; the remaining items can be loaded on demand from the reader.
 * Failures are logged and never thrown. Aborting skips queued items, terminates parse
 * workers and settles promptly (in-flight fetches finish on their own, bounded by their
 * timeout, and their result is discarded).
 */
export async function extractNewItems(
	db: AppDatabase,
	itemIds: string[],
	{
		cap = 10,
		concurrency = 2,
		signal
	}: { cap?: number; concurrency?: number; signal?: AbortSignal } = {}
): Promise<void> {
	const queue = itemIds.slice(0, cap);
	const cancelled = new Promise<'cancelled'>((resolve) =>
		signal?.addEventListener('abort', () => resolve('cancelled'), { once: true })
	);
	async function worker() {
		for (let id = queue.shift(); id && !signal?.aborted; id = queue.shift()) {
			try {
				const result = await Promise.race([extractItem(db, id, signal), cancelled]);
				if (result === 'cancelled') return;
			} catch (error) {
				if (signal?.aborted) return;
				if (!(error instanceof ExtractError)) console.error('Full-text extraction failed', error);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}

const COOLDOWN_MS = 30_000;
const attempts = new Map<string, number>();
/** True when this user may extract this item now; records the attempt. */
export function claimExtractionSlot(userId: string, itemId: string, now = Date.now()): boolean {
	for (const [key, at] of attempts) if (at <= now - COOLDOWN_MS) attempts.delete(key);
	const key = `${userId}:${itemId}`;
	if (attempts.has(key)) return false;
	attempts.set(key, now);
	return true;
}
export function resetExtractionCooldowns() {
	attempts.clear();
}
