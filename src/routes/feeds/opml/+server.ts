import { error, json } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { createOpmlService, MAX_OPML_BYTES, OpmlError } from '#lib/server/opml.ts';
import type { RequestHandler } from './$types';

const service = createOpmlService(db);

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) error(401, 'Sign in to export feeds.');
	return new Response(service.export(locals.user.id), {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'content-disposition': 'attachment; filename="feeds.opml"',
			'cache-control': 'private, no-store'
		}
	});
};

export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) error(401, 'Sign in to import feeds.');
	// API POSTs need an explicit same-origin guard as well as session authentication.
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin.');
	if (Number(request.headers.get('content-length')) > MAX_OPML_BYTES)
		return json({ message: 'OPML files must be 2 MB or smaller.' }, { status: 413 });
	const reader = request.body?.getReader();
	if (!reader) return json({ message: 'Choose an OPML file.' }, { status: 400 });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_OPML_BYTES) {
				await reader.cancel();
				return json({ message: 'OPML files must be 2 MB or smaller.' }, { status: 413 });
			}
			chunks.push(value);
		}
		let xml: string;
		const bytes = Buffer.concat(chunks);
		const decoder = new TextDecoder('utf-8', { fatal: true });
		try {
			xml = decoder.decode(bytes);
		} catch (cause) {
			if (!(cause instanceof TypeError)) throw cause;
			return json({ message: 'Invalid UTF-8 XML.' }, { status: 400 });
		}
		return json(service.import(locals.user.id, xml));
	} catch (cause) {
		return json(
			{ message: cause instanceof OpmlError ? cause.message : 'Invalid OPML document.' },
			{ status: 400 }
		);
	} finally {
		reader.releaseLock();
	}
};
