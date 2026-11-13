import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { markViewRead, setItemState } from '#lib/server/item-state.ts';
import type { ReaderView } from '#lib/reader.ts';
import type { RequestHandler } from './$types';

const VIEWS: ReaderView[] = ['all', 'unread', 'starred', 'feed', 'folder'];
/** Real bodies are a few hundred bytes; anything bigger is rejected before parsing. */
const MAX_BODY_BYTES = 4096;
const MAX_OLDER_THAN_DAYS = 3650;

/** Reads the body as text, stopping as soon as it exceeds the cap (also without a content-length). */
async function readCappedBody(request: Request): Promise<string> {
	const declared = Number(request.headers.get('content-length'));
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) error(413, 'Request too large.');
	const reader = request.body?.getReader();
	if (!reader) return '';
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_BODY_BYTES) {
			void reader.cancel();
			error(413, 'Request too large.');
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

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
	const text = await readCappedBody(request);
	let body: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(text);
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
				!Number.isInteger(olderThanDays) ||
				olderThanDays < 1 ||
				olderThanDays > MAX_OLDER_THAN_DAYS)
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
