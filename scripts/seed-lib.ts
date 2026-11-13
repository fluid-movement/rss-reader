import { and, eq, gt } from 'drizzle-orm';
import type { AppDatabase } from '../src/lib/server/db/connect';
import { createConsoleUser } from '../src/lib/server/create-user';
import { feeds, folders, user } from '../src/lib/server/db/schema';
import { createFeedService } from '../src/lib/server/feeds';
import { createScheduler } from '../src/lib/server/scheduler';
import { DEV_USER, SEED_FEEDS, SEED_FOLDERS } from './seed-data';

export interface SeedSummary {
	userId: string;
	folders: number;
	feeds: number;
}

/**
 * Deletes the dev user (cascading all owned rows) and queues the real feeds without any
 * network access: they are due immediately and the app's scheduler pulls them.
 */
export async function seedDatabase(db: AppDatabase): Promise<SeedSummary> {
	// Password hashing is async, so user creation cannot sit inside a synchronous SQLite
	// transaction. Delete and create are each atomic and a rerun always converges.
	db.delete(user).where(eq(user.email, DEV_USER.email)).run();
	const dev = await createConsoleUser(db, DEV_USER);

	return db.transaction((tx) => {
		const service = createFeedService(tx as unknown as AppDatabase);
		const folderIds = new Map<string, string>();
		for (const name of SEED_FOLDERS) {
			const row = tx.insert(folders).values({ userId: dev.id, name }).returning().get();
			folderIds.set(name, row.id);
		}
		let queued = 0;
		for (const feed of SEED_FEEDS) {
			queued += service.queueFeed(
				dev.id,
				feed.url,
				feed.title,
				feed.folder ? folderIds.get(feed.folder) : undefined,
				{
					refreshIntervalMinutes: feed.refreshIntervalMinutes,
					extractFullText: feed.extractFullText
				}
			);
		}
		return { userId: dev.id, folders: folderIds.size, feeds: queued };
	});
}

/** Optional `--refresh`: one refresh pass through a scheduler on this connection (uses the network). */
export async function refreshSeededFeeds(db: AppDatabase, userId: string) {
	const scheduler = createScheduler(db);
	const summary = await scheduler.refreshAll(userId);
	await scheduler.extractionsSettled();
	await scheduler.stop();
	const failures = db
		.select({ title: feeds.title, error: feeds.lastError })
		.from(feeds)
		.where(and(eq(feeds.userId, userId), gt(feeds.errorCount, 0)))
		.all()
		.map((feed) => ({ title: feed.title, error: feed.error ?? 'Unknown error.' }));
	return { ...summary, failures };
}
