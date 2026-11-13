import { redirect, type RequestEvent } from '@sveltejs/kit';
import { db } from './db';
import { getReaderData } from './reader';
import type { ReaderView } from '#lib/reader.ts';

/** Shared by concrete nested routes; no catch-all can swallow /feeds or /settings. */
export function loadReaderPage({ locals, params, route }: RequestEvent) {
	if (!locals.user) redirect(303, '/login');
	const view: ReaderView = route.id?.includes('/feed/')
		? 'feed'
		: route.id?.includes('/folder/')
			? 'folder'
			: route.id?.includes('/starred')
				? 'starred'
				: route.id?.includes('/unread')
					? 'unread'
					: 'all';
	return getReaderData(db, locals.user.id, { view, id: params.id, itemId: params.itemId });
}
