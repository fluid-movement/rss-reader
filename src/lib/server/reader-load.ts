import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { db } from './db';
import { getReaderData, getSelectedItem } from './reader';
import type { ReaderView } from '#lib/reader.ts';

/**
 * Layout load for one view's list. It reads no item param, so opening and switching articles
 * never re-runs it; mutations and sync refresh it through the `app:list` key.
 */
export function listLoader(view: ReaderView) {
	return ({ locals, params, depends }: ServerLoadEvent) => {
		if (!locals.user) redirect(303, '/login');
		depends('app:list');
		return getReaderData(db, locals.user.id, { view, id: params.id });
	};
}

/** Page load for an opened article; refreshed through `app:item`. */
export function itemLoader(view: ReaderView) {
	return ({ locals, params, depends }: ServerLoadEvent) => {
		if (!locals.user) redirect(303, '/login');
		depends('app:item');
		return {
			selectedItem: getSelectedItem(db, locals.user.id, {
				view,
				id: params.id,
				itemId: params.itemId ?? ''
			})
		};
	};
}
