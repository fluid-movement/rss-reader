import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { feeds, items, user } from '#lib/server/db/schema.ts';
import { resetExtractionCooldowns } from '#lib/server/feeds/extract.ts';
import { FeedFetchError, safeFetch } from '#lib/server/feeds/fetch.ts';
import { POST } from './+server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});
vi.mock('#lib/server/feeds/fetch.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/feeds/fetch.ts')>()),
	safeFetch: vi.fn()
}));
const article = `<html><body><article><h1>T</h1>${'<p>Plenty of words, commas, and clauses to make this the main content of the page.</p>'.repeat(6)}</article></body></html>`;

beforeEach(() => {
	vi.resetAllMocks();
	resetExtractionCooldowns();
	db.delete(items).run();
	db.delete(feeds).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'a', name: 'A', email: 'a@example.com' },
			{ id: 'b', name: 'B', email: 'b@example.com' }
		])
		.run();
	db.insert(feeds)
		.values([
			{ id: 'fa', userId: 'a', title: 'A', url: 'https://a.example/rss' },
			{ id: 'fb', userId: 'b', title: 'B', url: 'https://b.example/rss' }
		])
		.run();
	db.insert(items)
		.values([
			{ id: 'ia', feedId: 'fa', guid: '1', title: 'Mine', link: 'https://a.example/1' },
			{ id: 'nolink', feedId: 'fa', guid: '3', title: 'No link' },
			{ id: 'ib', feedId: 'fb', guid: '2', title: 'Theirs', link: 'https://b.example/2' }
		])
		.run();
	vi.mocked(safeFetch).mockResolvedValue({
		url: 'https://a.example/1',
		status: 200,
		headers: new Headers({ 'content-type': 'text/html' }),
		body: article
	});
});

async function call(body: unknown, userId: string | null = 'a', headers: HeadersInit = {}) {
	const request = new Request('https://reader.example/api/extract', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: typeof body === 'string' ? body : JSON.stringify(body)
	});
	try {
		const response = await POST({
			locals: userId ? { user: { id: userId } } : {},
			request,
			url: new URL(request.url)
		} as Parameters<typeof POST>[0]);
		return { status: response.status, body: (await response.json()) as { content?: string } };
	} catch (thrown) {
		return { status: (thrown as { status: number }).status, body: {} };
	}
}

describe('extract endpoint', () => {
	it('requires a session, same origin and JSON', async () => {
		expect((await call({ itemId: 'ia' }, null)).status).toBe(401);
		expect((await call({ itemId: 'ia' }, 'a', { origin: 'https://evil.example' })).status).toBe(
			403
		);
		expect((await call({ itemId: 'ia' }, 'a', { 'content-type': 'text/plain' })).status).toBe(415);
		expect((await call('nope')).status).toBe(400);
		expect((await call({ itemId: 5 })).status).toBe(400);
	});
	it('returns 404 for another user’s item without fetching', async () => {
		expect((await call({ itemId: 'ib' })).status).toBe(404);
		expect((await call({ itemId: 'missing' })).status).toBe(404);
		expect(safeFetch).not.toHaveBeenCalled();
	});
	it('rejects items without a link', async () => {
		expect((await call({ itemId: 'nolink' })).status).toBe(422);
	});
	it('extracts, stores and returns sanitized content', async () => {
		const result = await call({ itemId: 'ia' });
		expect(result.status).toBe(200);
		expect(result.body.content).toContain('Plenty of words');
		const stored = db
			.select()
			.from(items)
			.all()
			.find((item) => item.id === 'ia')!;
		expect(stored.fullContent).toBe(result.body.content);
	});
	it('applies a cooldown per user and item', async () => {
		expect((await call({ itemId: 'ia' })).status).toBe(200);
		expect((await call({ itemId: 'ia' })).status).toBe(429);
	});
	it('reports failures with a safe message and keeps feed content', async () => {
		vi.mocked(safeFetch).mockRejectedValue(new FeedFetchError('Remote server returned HTTP 500.'));
		expect((await call({ itemId: 'ia' })).status).toBe(502);
		vi.mocked(safeFetch).mockRejectedValue(new Error('internal path /etc'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		resetExtractionCooldowns();
		expect((await call({ itemId: 'ia' })).status).toBe(502);
		expect(
			db
				.select()
				.from(items)
				.all()
				.every((item) => item.fullContent === null)
		).toBe(true);
	});
});
