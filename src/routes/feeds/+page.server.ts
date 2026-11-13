import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { createFeedService, FeedValidationError } from '#lib/server/feeds/subscribe.ts';
import { FeedFetchError } from '#lib/server/feeds/fetch.ts';
import { FeedParseError } from '#lib/server/feeds/parse.ts';
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

function mutation(run: (id: string, data: FormData) => unknown, message: string) {
	return async (event: RequestEvent) => {
		const id = userId(event);
		try {
			await run(id, await event.request.formData());
			return { success: true, message };
		} catch (error) {
			if (error instanceof FeedValidationError)
				return fail(400, { success: false, message: error.message });
			throw error;
		}
	};
}

export const actions: Actions = {
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
