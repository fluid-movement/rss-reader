import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ReaderView } from '#lib/reader.ts';
import type { AppDatabase } from './db/connect';
import { feeds, items, itemState } from './db/schema';
import { assertViewOwned, viewScope } from './reader';

const CHUNK = 500;

export interface ItemStatePatch {
	read?: boolean;
	starred?: boolean;
}

/** Sets read/star state for one item. Returns false when the user does not own the item. */
export function setItemState(
	db: AppDatabase,
	userId: string,
	itemId: string,
	patch: ItemStatePatch
): boolean {
	const owned = db
		.select({ id: items.id })
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.where(and(eq(items.id, itemId), eq(feeds.userId, userId)))
		.get();
	if (!owned) return false;
	const now = new Date();
	const values: { readAt?: Date | null; starredAt?: Date | null } = {};
	if (patch.read !== undefined) values.readAt = patch.read ? now : null;
	if (patch.starred !== undefined) values.starredAt = patch.starred ? now : null;
	db.insert(itemState)
		.values({ userId, itemId, ...values })
		.onConflictDoUpdate({ target: [itemState.userId, itemState.itemId], set: values })
		.run();
	return true;
}

export interface MarkReadOptions {
	view: ReaderView;
	id?: string;
	/** Only items published (or fetched, when undated) more than this many days ago. */
	olderThanDays?: number;
	now?: Date;
}

/** Marks every unread item in the view as read; returns how many changed. */
export function markViewRead(db: AppDatabase, userId: string, options: MarkReadOptions): number {
	const { view, id, olderThanDays } = options;
	assertViewOwned(db, userId, view, id);
	const cutoff =
		olderThanDays === undefined
			? undefined
			: (options.now ?? new Date()).getTime() - olderThanDays * 86_400_000;
	const ids = db
		.select({ id: items.id })
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.leftJoin(itemState, and(eq(itemState.itemId, items.id), eq(itemState.userId, userId)))
		.where(
			and(
				viewScope(userId, view, id),
				isNull(itemState.readAt),
				cutoff === undefined
					? undefined
					: sql`coalesce(${items.publishedAt}, ${items.fetchedAt}) < ${cutoff}`
			)
		)
		.all()
		.map((row) => row.id);
	const readAt = new Date();
	db.transaction((tx) => {
		for (let i = 0; i < ids.length; i += CHUNK)
			tx.insert(itemState)
				.values(ids.slice(i, i + CHUNK).map((itemId) => ({ userId, itemId, readAt })))
				.onConflictDoUpdate({
					target: [itemState.userId, itemState.itemId],
					set: { readAt }
				})
				.run();
	});
	return ids.length;
}
