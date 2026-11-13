import { invalidateAll } from '$app/navigation';
import { toast } from 'svelte-sonner';
import type { ArticlePreview, ReaderView } from '#lib/reader.ts';

interface Override {
	read?: boolean;
	starred?: boolean;
	feedId: string;
	/** Read state the server data had when the first optimistic change was made. */
	baseRead: boolean;
	seq: number;
}

/**
 * Optimistic overlay over server data. Entries live until the mutation settles and
 * fresh data has been loaded (success) or are restored immediately (failure).
 */
const overrides = $state<Record<string, Override>>({});
let seq = 0;

export function isRead(article: Pick<ArticlePreview, 'id' | 'read'>) {
	return overrides[article.id]?.read ?? article.read;
}

export function isStarred(article: Pick<ArticlePreview, 'id' | 'starred'>) {
	return overrides[article.id]?.starred ?? article.starred;
}

/** Net change to a feed's server unread count caused by pending optimistic changes. */
export function unreadDelta(feedId: string) {
	let delta = 0;
	for (const entry of Object.values(overrides)) {
		if (entry.feedId !== feedId || entry.read === undefined || entry.read === entry.baseRead)
			continue;
		delta += entry.read ? -1 : 1;
	}
	return delta;
}

async function post(body: unknown) {
	const response = await fetch('/api/state', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!response.ok) throw new Error(`Request failed (${response.status})`);
}

type Target = Pick<ArticlePreview, 'id' | 'feedId' | 'read' | 'starred'>;

function apply(article: Target, patch: { read?: boolean; starred?: boolean }) {
	const previous = overrides[article.id];
	const mine = ++seq;
	overrides[article.id] = {
		...previous,
		...patch,
		feedId: article.feedId,
		baseRead: previous?.baseRead ?? article.read,
		seq: mine
	};
	return { previous, mine };
}

function settle(ids: string[], mines: number[]) {
	ids.forEach((id, index) => {
		if (overrides[id]?.seq === mines[index]) delete overrides[id];
	});
}

/** Optimistically change one article's read or starred state; roll back with a toast on failure. */
export async function updateArticle(
	article: Target,
	patch: { read?: boolean; starred?: boolean },
	failure = 'Could not save your change. It has been undone.'
) {
	const { previous, mine } = apply(article, patch);
	try {
		await post({ action: 'item', itemId: article.id, ...patch });
	} catch {
		if (overrides[article.id]?.seq === mine) {
			if (previous) overrides[article.id] = previous;
			else delete overrides[article.id];
		}
		toast.error(failure);
		return false;
	}
	await invalidateAll();
	settle([article.id], [mine]);
	return true;
}

/** Mark everything in the view (optionally only items older than N days) read. */
export async function markViewRead(
	view: { view: ReaderView; viewId: string | null },
	articles: (Target & { sortAt: Date })[],
	olderThanDays?: number
) {
	const cutoff = olderThanDays === undefined ? undefined : Date.now() - olderThanDays * 86_400_000;
	const affected = articles.filter(
		(article) => !isRead(article) && (cutoff === undefined || article.sortAt.getTime() < cutoff)
	);
	const applied = affected.map((article) => ({ article, ...apply(article, { read: true }) }));
	try {
		await post({
			action: 'markRead',
			view: view.view,
			id: view.viewId ?? undefined,
			olderThanDays
		});
	} catch {
		for (const { article, previous, mine } of applied) {
			if (overrides[article.id]?.seq !== mine) continue;
			if (previous) overrides[article.id] = previous;
			else delete overrides[article.id];
		}
		toast.error('Could not mark articles as read. Nothing was changed.');
		return false;
	}
	await invalidateAll();
	settle(
		applied.map(({ article }) => article.id),
		applied.map(({ mine }) => mine)
	);
	return true;
}
