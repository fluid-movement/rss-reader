import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { createFeedService, FeedValidationError } from '#lib/server/feeds/subscribe.ts';
import { FeedFetchError } from '#lib/server/feeds/fetch.ts';
import { FeedParseError } from '#lib/server/feeds/parse.ts';
import { refreshFeed, refreshAll } from '#lib/server/scheduler.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const service = createFeedService(db);
function userId(event: RequestEvent) {
	if (!event.locals.user) redirect(303, '/login');
	return event.locals.user.id;
}
const field = (data: FormData, name: string) => {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
};

export const load: PageServerLoad = (event) => service.list(userId(event));

function mutation<T>(
	run: (id: string, data: FormData) => T | Promise<T>,
	message: string | ((result: T) => string)
) {
	return async (event: RequestEvent) => {
		const id = userId(event);
		try {
			const result = await run(id, await event.request.formData());
			return { success: true, message: typeof message === 'function' ? message(result) : message };
		} catch (error) {
			if (error instanceof FeedValidationError)
				return fail(400, { success: false, message: error.message });
			throw error;
		}
	};
}

export const actions: Actions = {
	refreshFeed: mutation(
		(id, data) => refreshFeed(field(data, 'feedId'), id),
		(result) =>
			result.status === 'skipped'
				? 'Refreshed recently, try again in a moment.'
				: result.status === 'failed'
					? 'Feed refresh failed. See the error below.'
					: 'Feed refreshed.'
	),
	refreshAll: mutation(
		(id) => refreshAll(id),
		({ refreshed, skipped, failed }) =>
			`Refreshed: ${refreshed}. Skipped: ${skipped}. Failed: ${failed}.` +
			(skipped ? ' Refreshed recently, try again in a moment.' : '') +
			(failed ? ' See refresh errors on Manage feeds.' : '')
	),
	subscribe: async (event) => {
		const id = userId(event);
		const data = await event.request.formData();
		const url = field(data, 'url');
		if (!url || url.length > 4096)
			return fail(400, { success: false, message: 'Enter a valid feed or website URL.' });
		try {
			await service.subscribeToFeed(id, url, field(data, 'folderId') || undefined);
			return { success: true, message: 'Feed subscribed and articles fetched.' };
		} catch (error) {
			return fail(400, {
				success: false,
				message:
					error instanceof FeedValidationError ||
					error instanceof FeedFetchError ||
					error instanceof FeedParseError
						? error.message
						: 'Could not subscribe to this feed. Check the URL and try again.'
			});
		}
	},
	removeFeed: mutation(
		(id, data) => service.removeFeed(id, field(data, 'feedId')),
		'Feed and its articles removed.'
	),
	moveFeed: mutation(
		(id, data) => service.moveFeed(id, field(data, 'feedId'), field(data, 'folderId') || undefined),
		'Feed moved.'
	),
	createFolder: mutation(
		(id, data) => service.createFolder(id, field(data, 'name')),
		'Folder created.'
	),
	renameFolder: mutation(
		(id, data) => service.renameFolder(id, field(data, 'folderId'), field(data, 'name')),
		'Folder renamed.'
	),
	deleteFolder: mutation(
		(id, data) => service.deleteFolder(id, field(data, 'folderId')),
		'Folder deleted. Its feeds are now unfiled.'
	)
};
