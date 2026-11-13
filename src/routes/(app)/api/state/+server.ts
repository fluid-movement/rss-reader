import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { markViewRead, setItemState } from '#lib/server/item-state.ts';
import type { ReaderView } from '#lib/reader.ts';
import type { RequestHandler } from './$types';

const VIEWS: ReaderView[] = ['all', 'unread', 'starred', 'feed', 'folder'];

/**
 * JSON mutations for read/star state. Always scoped to locals.user; a same-origin
 * JSON content type is required so cross-site forms cannot trigger it.
 */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Cross-origin request rejected.');
	if (!request.headers.get('content-type')?.startsWith('application/json'))
		error(415, 'Expected JSON.');
	let body: Record<string, unknown>;
	try {
		const parsed: unknown = await request.json();
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
		body = parsed as Record<string, unknown>;
	} catch {
		error(400, 'Invalid request.');
	}
	if (body.action === 'item') {
		const { itemId, read, starred } = body;
		if (typeof itemId !== 'string' || !itemId) error(400, 'Missing item.');
		if (read !== undefined && typeof read !== 'boolean') error(400, 'Invalid read value.');
		if (starred !== undefined && typeof starred !== 'boolean') error(400, 'Invalid star value.');
		if (read === undefined && starred === undefined) error(400, 'Nothing to change.');
		if (!setItemState(db, locals.user.id, itemId, { read, starred }))
			error(404, 'Article not found.');
		return json({ ok: true });
	}
	if (body.action === 'markRead') {
		const { view, id, olderThanDays } = body;
		if (typeof view !== 'string' || !VIEWS.includes(view as ReaderView))
			error(400, 'Invalid view.');
		if ((view === 'feed' || view === 'folder') && (typeof id !== 'string' || !id))
			error(400, 'Missing view id.');
		if (
			olderThanDays !== undefined &&
			(typeof olderThanDays !== 'number' ||
				!Number.isFinite(olderThanDays) ||
				olderThanDays < 0 ||
				olderThanDays > 3650)
		)
			error(400, 'Invalid age.');
		const updated = markViewRead(db, locals.user.id, {
			view: view as ReaderView,
			id: typeof id === 'string' ? id : undefined,
			olderThanDays
		});
		return json({ ok: true, updated });
	}
	error(400, 'Unknown action.');
};
