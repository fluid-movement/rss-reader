import { sql } from 'drizzle-orm';
import type { AppDatabase } from './db/connect';
import { items, prunedItems } from './db/schema';

/** Used for users without a user_settings row; matches the column default. */
export const DEFAULT_RETENTION_DAYS = 30;
export const PRUNE_BATCH_SIZE = 200;
const DAY = 86_400_000;

export interface PruneOptions {
	now?: Date;
	batchSize?: number;
	/** Called between batches so the event loop can run; defaults to a macrotask yield. */
	yieldToLoop?: () => Promise<void>;
}

const defaultYield = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Retention pruning: deletes items that are READ and NOT starred by their feed's owner and whose
 * published date (fetched date when undated) is older than that owner's `retention_days`.
 * Unread and starred items are never touched; a retention of 0 or less keeps everything.
 *
 * Resurrection: a pruned item that is still listed in its feed would be re-ingested on the next
 * refresh as a brand new unread item (an undated one even gets a fresh fetched_at, so a date
 * cutoff in ingest could not catch it). Each deletion therefore leaves a tombstone
 * (feed id + guid, in pruned_items) in the same transaction, and ingestItems treats tombstoned
 * guids as already seen. Tombstones are tiny and cascade away with their feed.
 *
 * item_state rows cascade with the item and items_fts rows go through the delete trigger.
 * better-sqlite3 is synchronous, so deletion runs in small transactions with a yield between
 * them. Returns the number of deleted items.
 */
export async function pruneExpiredItems(
	db: AppDatabase,
	options: PruneOptions = {}
): Promise<number> {
	const now = (options.now ?? new Date()).getTime();
	const batchSize = Math.max(1, Math.floor(options.batchSize ?? PRUNE_BATCH_SIZE));
	const yieldToLoop = options.yieldToLoop ?? defaultYield;
	let total = 0;
	for (;;) {
		const deleted = db.transaction((tx) => {
			const rows = tx.all<{ id: string; feedId: string; guid: string }>(sql`
				select i.id as id, i.feed_id as feedId, i.guid as guid
				from items i
				join feeds f on f.id = i.feed_id
				left join user_settings s on s.user_id = f.user_id
				join item_state st on st.item_id = i.id and st.user_id = f.user_id
				where st.read_at is not null
					and st.starred_at is null
					and coalesce(s.retention_days, ${DEFAULT_RETENTION_DAYS}) > 0
					and coalesce(i.published_at, i.fetched_at)
						< ${now} - coalesce(s.retention_days, ${DEFAULT_RETENTION_DAYS}) * ${DAY}
				limit ${batchSize}`);
			if (!rows.length) return 0;
			tx.insert(prunedItems)
				.values(
					rows.map((row) => ({ feedId: row.feedId, guid: row.guid, prunedAt: new Date(now) }))
				)
				.onConflictDoNothing()
				.run();
			tx.delete(items)
				.where(
					sql`${items.id} in (${sql.join(
						rows.map((row) => sql`${row.id}`),
						sql`, `
					)})`
				)
				.run();
			return rows.length;
		});
		total += deleted;
		if (deleted < batchSize) break;
		await yieldToLoop();
	}
	return total;
}

/** Runs the prune and never throws; used by the scheduler timer. */
export async function runRetentionJob(db: AppDatabase, options: PruneOptions = {}) {
	try {
		const count = await pruneExpiredItems(db, options);
		console.info(`Retention pruning removed ${count} item${count === 1 ? '' : 's'}.`);
		return count;
	} catch (error) {
		console.error('Retention pruning failed', error);
		return 0;
	}
}
