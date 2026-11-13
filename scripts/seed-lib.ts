import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../src/lib/server/db/connect';
import { createConsoleUser } from '../src/lib/server/create-user';
import { feeds, folders, itemState, items, user } from '../src/lib/server/db/schema';
import { createFeedService, sanitizeContent, type ParsedItem } from '../src/lib/server/feeds';
import {
	DEV_USER,
	SEED_FEEDS,
	SEED_FOLDERS,
	createRng,
	fullTextArticle,
	hostileArticle,
	longArticle,
	shortArticle
} from './seed-data';

const HOUR = 3_600_000;
const MINUTE = 60_000;

export interface SeedSummary {
	folders: number;
	feeds: number;
	items: number;
	read: number;
	starred: number;
}

/** Deletes the dev user (cascading all owned rows) and rebuilds the dataset. */
export async function seedDatabase(db: AppDatabase, now = new Date()): Promise<SeedSummary> {
	// Password hashing is async, so user creation cannot sit inside a synchronous SQLite
	// transaction. Delete and create are each atomic and a rerun always converges.
	db.delete(user).where(eq(user.email, DEV_USER.email)).run();
	const dev = await createConsoleUser(db, DEV_USER);
	const rng = createRng(20240601);
	const nowMs = now.getTime();

	return db.transaction((tx) => {
		const service = createFeedService(tx as unknown as AppDatabase);
		const folderIds = new Map<string, string>();
		for (const name of SEED_FOLDERS) {
			const row = tx.insert(folders).values({ userId: dev.id, name }).returning().get();
			folderIds.set(name, row.id);
		}
		const summary: SeedSummary = {
			folders: folderIds.size,
			feeds: 0,
			items: 0,
			read: 0,
			starred: 0
		};

		for (const fixture of SEED_FEEDS) {
			const fetchedAt =
				fixture.fetchedMinutesAgo === null
					? null
					: new Date(nowMs - fixture.fetchedMinutesAgo * MINUTE);
			const interval = fixture.refreshIntervalMinutes ?? 60;
			const siteUrl = `https://${fixture.slug}.example.com/`;
			const feed = tx
				.insert(feeds)
				.values({
					userId: dev.id,
					url: `${siteUrl}feed.xml`,
					siteUrl,
					title: fixture.title,
					folderId: fixture.folder ? folderIds.get(fixture.folder) : null,
					refreshIntervalMinutes: interval,
					extractFullText: fixture.extractFullText ?? false,
					etag: fetchedAt ? `"seed-${fixture.slug}"` : null,
					lastModified: fetchedAt ? fetchedAt.toUTCString() : null,
					lastFetchedAt: fetchedAt,
					nextFetchAt: fetchedAt ? new Date(fetchedAt.getTime() + interval * MINUTE) : now,
					errorCount: fixture.errorCount ?? 0,
					lastError: fixture.lastError ?? null
				})
				.returning()
				.get();
			summary.feeds++;

			// Spread over about six weeks.
			const ages = Array.from({ length: fixture.itemCount }, () => rng() * 42 * 24 * HOUR).sort(
				(a, b) => a - b
			);
			const parsed: ParsedItem[] = ages.map((age, index) => {
				const title =
					fixture.titles[index] ?? `${fixture.title} digest #${fixture.itemCount - index}`;
				const isLong = index < fixture.titles.length ? rng() < 0.7 : rng() < 0.15;
				const hasContent = rng() > 0.08;
				return {
					guid: `${fixture.slug}-${index + 1}`,
					link: `https://${fixture.slug}.example.com/posts/${index + 1}`,
					title,
					content:
						index === fixture.hostileIndex
							? hostileArticle()
							: !hasContent
								? null
								: isLong
									? longArticle(title, fixture.slug, index + 1)
									: shortArticle(title, fixture.slug),
					summary: `${title}: a short summary of what this post covers.`,
					author: rng() < 0.9 ? fixture.authors[index % fixture.authors.length] : null,
					publishedAt: new Date(nowMs - age)
				};
			});
			// Same sanitizing pipeline as real fetches.
			service.ingestItems(feed.id, parsed);

			const fullGuid =
				fixture.fullContentIndex === undefined
					? null
					: `${fixture.slug}-${fixture.fullContentIndex + 1}`;
			const rows = tx.select().from(items).where(eq(items.feedId, feed.id)).all();
			for (const row of rows) {
				const published = row.publishedAt ?? now;
				tx.update(items)
					.set({
						fetchedAt: new Date(Math.min(nowMs, published.getTime() + 10 * MINUTE)),
						...(row.guid === fullGuid
							? {
									fullContent: sanitizeContent(
										fullTextArticle(row.title, fixture.slug),
										row.link ?? siteUrl
									)
								}
							: {})
					})
					.where(eq(items.id, row.id))
					.run();
				summary.items++;
				const roll = rng();
				const starred = rng() < 0.12;
				// About half are read; the last couple of days stay unread.
				const read = roll < 0.55 && published.getTime() < nowMs - 2 * 24 * HOUR;
				if (read || starred) {
					tx.insert(itemState)
						.values({
							userId: dev.id,
							itemId: row.id,
							readAt: read ? new Date(published.getTime() + HOUR) : null,
							starredAt: starred ? new Date(published.getTime() + 2 * HOUR) : null
						})
						.run();
					if (read) summary.read++;
					if (starred) summary.starred++;
				}
			}
		}
		return summary;
	});
}
