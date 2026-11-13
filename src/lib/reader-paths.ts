import { resolve } from '$app/paths';
import type { ReaderData } from '#lib/reader.ts';

type ViewRef = Pick<ReaderData, 'view' | 'viewId'>;

/** Resolved URL of a view's article list. */
export function listHref({ view, viewId }: ViewRef): string {
	const id = viewId ?? '';
	switch (view) {
		case 'unread':
			return resolve('/(app)/unread');
		case 'starred':
			return resolve('/(app)/starred');
		case 'feed':
			return resolve('/(app)/feed/[id]', { id });
		case 'folder':
			return resolve('/(app)/folder/[id]', { id });
		default:
			return resolve('/(app)/(all)');
	}
}

/** Resolved URL of an article opened inside a view. */
export function itemHref({ view, viewId }: ViewRef, itemId: string): string {
	const id = viewId ?? '';
	switch (view) {
		case 'unread':
			return resolve('/(app)/unread/item/[itemId]', { itemId });
		case 'starred':
			return resolve('/(app)/starred/item/[itemId]', { itemId });
		case 'feed':
			return resolve('/(app)/feed/[id]/item/[itemId]', { id, itemId });
		case 'folder':
			return resolve('/(app)/folder/[id]/item/[itemId]', { id, itemId });
		default:
			return resolve('/(app)/(all)/item/[itemId]', { itemId });
	}
}
