import { resolve } from '$app/paths';
import type { ReaderData } from '#lib/reader.ts';

type ViewRef = Pick<ReaderData, 'view' | 'viewId'> & Partial<Pick<ReaderData, 'query'>>;

/** `?q=` suffix that keeps an open article inside its search results. */
function searchSuffix(query: string | null | undefined) {
	return query ? `?q=${encodeURIComponent(query)}` : '';
}

/** Resolved URL of a view's article list. */
export function listHref({ view, viewId, query }: ViewRef): string {
	const id = viewId ?? '';
	switch (view) {
		case 'unread':
			return resolve('/(app)/unread');
		case 'starred':
			return resolve('/(app)/starred');
		case 'search':
			return `${resolve('/(app)/search')}${searchSuffix(query)}`;
		case 'feed':
			return resolve('/(app)/feed/[id]', { id });
		case 'folder':
			return resolve('/(app)/folder/[id]', { id });
		default:
			return resolve('/(app)/(all)');
	}
}

/** Resolved URL of an article opened inside a view. */
export function itemHref({ view, viewId, query }: ViewRef, itemId: string): string {
	const id = viewId ?? '';
	switch (view) {
		case 'unread':
			return resolve('/(app)/unread/item/[itemId]', { itemId });
		case 'starred':
			return resolve('/(app)/starred/item/[itemId]', { itemId });
		case 'search':
			return `${resolve('/(app)/search/item/[itemId]', { itemId })}${searchSuffix(query)}`;
		case 'feed':
			return resolve('/(app)/feed/[id]/item/[itemId]', { id, itemId });
		case 'folder':
			return resolve('/(app)/folder/[id]/item/[itemId]', { id, itemId });
		default:
			return resolve('/(app)/(all)/item/[itemId]', { itemId });
	}
}
