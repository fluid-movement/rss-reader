import { and, asc, eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/connect';
import { feeds, folders, items } from '../db/schema';
import { discoverFeed } from './discover';
import { normalizeFeedUrl } from './normalize-url';
import { sanitizeContent, type ParsedItem } from './parse';

export class FeedValidationError extends Error {}

const DEFAULT_REFRESH_MINUTES = 30;

/** Injectable database boundary keeps tests isolated from the application database. */
export function createFeedService(db: AppDatabase) {
	function requireFolder(userId: string, folderId?: string | null) {
		if (
			folderId &&
			!db
				.select()
				.from(folders)
				.where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
				.get()
		) {
			throw new FeedValidationError('Folder not found.');
		}
	}
	function requireFeed(userId: string, feedId: string) {
		const feed = db
			.select()
			.from(feeds)
			.where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
			.get();
		if (!feed) throw new FeedValidationError('Feed not found.');
		return feed;
	}
	function folderName(value: string) {
		const name = value.trim();
		if (!name || name.length > 200)
			throw new FeedValidationError('Enter a folder name of 1–200 characters.');
		return name;
	}

	/** Inserts new items and returns their ids (in insertion order). */
	function ingestItemIds(feedId: string, parsedItems: ParsedItem[]): string[] {
		return db.transaction((tx) => {
			const feed = tx
				.select({ url: feeds.url, siteUrl: feeds.siteUrl })
				.from(feeds)
				.where(eq(feeds.id, feedId))
				.get();
			const existing = tx
				.select({ guid: items.guid })
				.from(items)
				.where(eq(items.feedId, feedId))
				.all();
			const guids = new Set(existing.map((item) => item.guid));
			const inserted: string[] = [];
			for (const item of parsedItems) {
				// The parser already uses the link as GUID only when no explicit ID exists.
				// Distinct explicit GUIDs may legitimately share the same article URL.
				if (guids.has(item.guid)) continue;
				const contentBase = item.link ?? feed?.siteUrl ?? feed?.url;
				const result = tx
					.insert(items)
					.values({
						...item,
						feedId,
						content: sanitizeContent(item.content, contentBase),
						summary: sanitizeContent(item.summary, contentBase)
					})
					.onConflictDoNothing({ target: [items.feedId, items.guid] })
					.returning({ id: items.id })
					.all();
				inserted.push(...result.map((row) => row.id));
				guids.add(item.guid);
			}
			return inserted;
		});
	}

	/** Number of newly inserted items. */
	function ingestItems(feedId: string, parsedItems: ParsedItem[]) {
		return ingestItemIds(feedId, parsedItems).length;
	}

	return {
		ingestItems,
		ingestItemIds,
		/** OPML subscriptions are queued without discovery or network access. */
		queueFeed(userId: string, url: string, title: string, folderId?: string) {
			requireFolder(userId, folderId);
			try {
				url = normalizeFeedUrl(url);
			} catch {
				throw new FeedValidationError('Enter a valid HTTP(S) feed URL.');
			}
			return db
				.insert(feeds)
				.values({
					userId,
					url,
					title: title || url,
					refreshIntervalMinutes: DEFAULT_REFRESH_MINUTES,
					folderId: folderId || null,
					nextFetchAt: new Date()
				})
				.onConflictDoNothing({ target: [feeds.userId, feeds.url] })
				.run().changes;
		},
		list(userId: string) {
			return {
				feeds: db
					.select()
					.from(feeds)
					.where(eq(feeds.userId, userId))
					.orderBy(asc(feeds.title))
					.all(),
				folders: db
					.select()
					.from(folders)
					.where(eq(folders.userId, userId))
					.orderBy(asc(folders.name))
					.all()
			};
		},
		async subscribeToFeed(userId: string, url: string, folderId?: string) {
			requireFolder(userId, folderId);
			const discovered = await discoverFeed(url);
			return db.transaction((tx) => {
				requireFolder(userId, folderId);
				const now = new Date();
				tx.insert(feeds)
					.values({
						userId,
						url: discovered.url,
						title: discovered.feed.title,
						refreshIntervalMinutes: DEFAULT_REFRESH_MINUTES,
						siteUrl: discovered.feed.siteUrl,
						folderId: folderId || null,
						etag: discovered.response.headers.get('etag'),
						lastModified: discovered.response.headers.get('last-modified'),
						lastFetchedAt: now,
						nextFetchAt: new Date(now.getTime() + DEFAULT_REFRESH_MINUTES * 60 * 1000)
					})
					.onConflictDoNothing({ target: [feeds.userId, feeds.url] })
					.run();
				const feed = tx
					.select()
					.from(feeds)
					.where(and(eq(feeds.userId, userId), eq(feeds.url, discovered.url)))
					.get()!;
				ingestItems(feed.id, discovered.feed.items);
				return feed;
			});
		},
		removeFeed(userId: string, feedId: string) {
			requireFeed(userId, feedId);
			db.delete(feeds)
				.where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
				.run();
		},
		setExtractFullText(userId: string, feedId: string, enabled: boolean) {
			requireFeed(userId, feedId);
			db.update(feeds)
				.set({ extractFullText: enabled })
				.where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
				.run();
		},
		moveFeed(userId: string, feedId: string, folderId?: string) {
			requireFeed(userId, feedId);
			requireFolder(userId, folderId);
			db.update(feeds)
				.set({ folderId: folderId || null })
				.where(and(eq(feeds.id, feedId), eq(feeds.userId, userId)))
				.run();
		},
		createFolder(userId: string, name: string) {
			return db
				.insert(folders)
				.values({ userId, name: folderName(name) })
				.returning()
				.get();
		},
		renameFolder(userId: string, folderId: string, name: string) {
			requireFolder(userId, folderId || 'missing');
			db.update(folders)
				.set({ name: folderName(name) })
				.where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
				.run();
		},
		deleteFolder(userId: string, folderId: string) {
			requireFolder(userId, folderId || 'missing');
			// FK SET NULL keeps subscriptions and articles when deleting a folder.
			db.delete(folders)
				.where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
				.run();
		}
	};
}

export async function subscribeToFeed(userId: string, url: string, folderId?: string) {
	const { db } = await import('../db');
	return createFeedService(db).subscribeToFeed(userId, url, folderId);
}

/** Internal trusted API for the refresh scheduler; ownership comes from its feed. */
export async function ingestItems(feedId: string, parsedItems: ParsedItem[]) {
	const { db } = await import('../db');
	return createFeedService(db).ingestItems(feedId, parsedItems);
}
