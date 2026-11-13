import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { feeds, items } from '#lib/server/db/schema.ts';
import { claimExtractionSlot, ExtractError, extractItem } from '#lib/server/feeds/extract.ts';
import type { RequestHandler } from './$types';

const MAX_BODY_BYTES = 1024;
const MAX_ID_LENGTH = 128;
class BodyTooLarge extends Error {}

/** Reads at most MAX_BODY_BYTES: rejects on Content-Length and while streaming. */
async function readBody(request: Request): Promise<string> {
	const declared = request.headers.get('content-length');
	if (declared !== null && Number(declared) > MAX_BODY_BYTES) throw new BodyTooLarge();
	if (!request.body) return '';
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		received += value.byteLength;
		if (received > MAX_BODY_BYTES) {
			void reader.cancel().catch(() => {});
			throw new BodyTooLarge();
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString('utf8');
}

/**
 * On-demand full-article extraction for one item. Session, same-origin and JSON
 * content type are required; items of other users are indistinguishable from missing.
 */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'Sign in to continue.');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Cross-origin request rejected.');
	if (!request.headers.get('content-type')?.startsWith('application/json'))
		error(415, 'Expected JSON.');
	let itemId: unknown;
	try {
		const parsed: unknown = JSON.parse(await readBody(request));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
		itemId = (parsed as Record<string, unknown>).itemId;
	} catch (thrown) {
		if (thrown instanceof BodyTooLarge) error(413, 'Request too large.');
		error(400, 'Invalid request.');
	}
	if (typeof itemId !== 'string' || !itemId || itemId.length > MAX_ID_LENGTH)
		error(400, 'Missing item.');
	const owned = db
		.select({ id: items.id, link: items.link })
		.from(items)
		.innerJoin(feeds, eq(items.feedId, feeds.id))
		.where(and(eq(items.id, itemId), eq(feeds.userId, locals.user.id)))
		.get();
	if (!owned) error(404, 'Article not found.');
	if (!owned.link) error(422, 'This article has no link to load.');
	if (!claimExtractionSlot(locals.user.id, owned.id))
		error(429, 'Please wait a moment before trying this article again.');
	try {
		return json({ ok: true, content: await extractItem(db, owned.id) });
	} catch (thrown) {
		if (thrown instanceof ExtractError) error(502, thrown.message);
		console.error('Full-text extraction failed', thrown);
		error(502, 'Could not load the full article.');
	}
};
