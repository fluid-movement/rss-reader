import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { user } from '#lib/server/db/schema.ts';
import { createFeedService } from '#lib/server/feeds/subscribe.ts';
import { MAX_OPML_BYTES } from '#lib/server/opml.ts';
import { GET, POST } from './+server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});

const xml = '<opml><body><outline xmlUrl="https://example.com/rss"/></body></opml>';
function event(
	body: BodyInit = xml,
	userId: string | null = 'owner',
	headers: Record<string, string> = {}
) {
	return {
		locals: { user: userId ? { id: userId } : undefined },
		url: new URL('https://reader.example/feeds/opml'),
		request: new Request('https://reader.example/feeds/opml', {
			method: 'POST',
			body,
			headers: { origin: 'https://reader.example', 'content-type': 'application/xml', ...headers }
		})
	} as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Owner', email: 'owner@example.com' },
			{ id: 'other', name: 'Other', email: 'other@example.com' }
		])
		.run();
});
afterAll(() => db.$client.close());

it('counts empty and text-only outlines as invalid instead of reporting a UTF-8 error', async () => {
	const response = await POST(
		event('<opml><body><outline/><outline></outline><outline>Text</outline></body></opml>')
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ added: 0, invalid: 3 });
});

it('reports invalid UTF-8 only for decoding failures', async () => {
	const response = await POST(event(new Uint8Array([0xc3, 0x28])));
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({ message: 'Invalid UTF-8 XML.' });
	const transaction = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
		throw new TypeError('Not a decoding error');
	});
	try {
		const invalid = await POST(event());
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toEqual({ message: 'Invalid OPML document.' });
	} finally {
		transaction.mockRestore();
	}
});

it('requires authentication on both endpoints', async () => {
	expect(() => GET(event(xml, null))).toThrow(expect.objectContaining({ status: 401 }));
	await expect(POST(event(xml, null))).rejects.toMatchObject({ status: 401 });
});

it('rejects cross-origin imports before changing subscriptions', async () => {
	await expect(
		POST(event(xml, 'owner', { origin: 'https://attacker.example' }))
	).rejects.toMatchObject({ status: 403 });
	expect(createFeedService(db).list('owner').feeds).toEqual([]);
});

it('returns the import summary and a private user-scoped XML attachment', async () => {
	const response = await POST(event());
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({
		added: 1,
		skippedDuplicates: 0,
		invalid: 0,
		foldersCreated: 0
	});
	createFeedService(db).queueFeed('other', 'https://private.example/rss', 'Private');
	const exported = await GET(event());
	expect(exported.headers.get('content-type')).toBe('application/xml; charset=utf-8');
	expect(exported.headers.get('content-disposition')).toBe('attachment; filename="feeds.opml"');
	expect(exported.headers.get('cache-control')).toBe('private, no-store');
	const body = await exported.text();
	expect(body).toContain('https://example.com/rss');
	expect(body).not.toContain('private.example');
});

it('rejects oversized uploads with and without content-length', async () => {
	for (const request of [
		event(xml, 'owner', { 'content-length': String(MAX_OPML_BYTES + 1) }),
		event('x'.repeat(MAX_OPML_BYTES + 1))
	]) {
		const response = await POST(request);
		expect(response.status).toBe(413);
	}
});

it('returns a useful error for malformed XML without persisting anything', async () => {
	const response = await POST(event('<rss/>'));
	expect(response.status).toBe(400);
	expect(await response.json()).toHaveProperty('message');
	expect(createFeedService(db).list('owner')).toEqual({ feeds: [], folders: [] });
});
