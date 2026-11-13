import { error, fail, redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { auth } from '#lib/server/auth.ts';
import { db } from '#lib/server/db/index.ts';
import { feeds } from '#lib/server/db/schema.ts';
import {
	FeedNotFoundError,
	getUserPrefs,
	SettingsValidationError,
	updateFeedSettings,
	updateReaderPrefs,
	updateRetentionDays
} from '#lib/server/settings.ts';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** Settings forms are a handful of short fields; anything larger is not a real submission. */
const MAX_FORM_BYTES = 4096;

function userId(event: RequestEvent) {
	if (!event.locals.user) redirect(303, '/login');
	return event.locals.user.id;
}

async function readForm(event: RequestEvent) {
	const declared = Number(event.request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_FORM_BYTES) error(413, 'Request too large.');
	const data = await event.request.formData();
	let size = 0;
	for (const [key, value] of data)
		size += key.length + (typeof value === 'string' ? value.length : value.size);
	if (size > MAX_FORM_BYTES) error(413, 'Request too large.');
	return data;
}

/** Runs a settings mutation, turning validation failures into a 400 and foreign ids into a 404. */
function mutation(section: string, run: (id: string, data: FormData) => void, message: string) {
	return async (event: RequestEvent) => {
		const id = userId(event);
		const data = await readForm(event);
		try {
			run(id, data);
			return { section, success: true, message };
		} catch (caught) {
			if (caught instanceof FeedNotFoundError) error(404, caught.message);
			if (caught instanceof SettingsValidationError)
				return fail(400, { section, success: false, message: caught.message });
			throw caught;
		}
	};
}

export const load: PageServerLoad = async (event) => {
	const id = userId(event);
	const passkeys = await auth.api.listPasskeys({ headers: event.request.headers });
	return {
		prefs: getUserPrefs(db, id),
		feeds: db
			.select({
				id: feeds.id,
				title: feeds.title,
				url: feeds.url,
				refreshIntervalMinutes: feeds.refreshIntervalMinutes,
				extractFullText: feeds.extractFullText
			})
			.from(feeds)
			.where(eq(feeds.userId, id))
			.orderBy(asc(feeds.title))
			.all(),
		passkeys: passkeys
			.map((passkey) => ({
				id: passkey.id,
				name: passkey.name ?? null,
				createdAt: passkey.createdAt ? new Date(passkey.createdAt).getTime() : null
			}))
			.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
	};
};

const text = (data: FormData, name: string) => data.get(name);

export const actions: Actions = {
	reader: mutation(
		'reader',
		(id, data) =>
			updateReaderPrefs(db, id, { fontSize: text(data, 'fontSize'), width: text(data, 'width') }),
		'Reader preferences saved.'
	),
	retention: mutation(
		'retention',
		(id, data) => updateRetentionDays(db, id, text(data, 'retentionDays')),
		'Retention saved.'
	),
	feed: mutation(
		'feed',
		(id, data) =>
			updateFeedSettings(db, id, String(text(data, 'feedId') ?? ''), {
				title: text(data, 'title'),
				refreshIntervalMinutes: text(data, 'refreshIntervalMinutes'),
				extractFullText: text(data, 'extractFullText') === 'on'
			}),
		'Feed settings saved.'
	)
};
