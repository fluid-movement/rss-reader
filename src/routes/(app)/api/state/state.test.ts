import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { feeds, items, itemState, user } from '#lib/server/db/schema.ts';
import { POST } from './+server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});

beforeEach(() => {
	db.delete(itemState).run();
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
			{ id: 'ia', feedId: 'fa', guid: '1', title: 'Mine' },
			{ id: 'ib', feedId: 'fb', guid: '2', title: 'Theirs' }
		])
		.run();
});

async function call(body: unknown, userId: string | null = 'a', headers: HeadersInit = {}) {
	const request = new Request('https://reader.example/api/state', {
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
		return response.status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe('state endpoint', () => {
	it('requires a session', async () => {
		expect(await call({ action: 'item', itemId: 'ia', read: true }, null)).toBe(401);
	});
	it('rejects cross-origin and non-JSON requests', async () => {
		expect(
			await call({ action: 'item', itemId: 'ia', read: true }, 'a', {
				origin: 'https://evil.example'
			})
		).toBe(403);
		expect(
			await call({ action: 'item', itemId: 'ia', read: true }, 'a', {
				'content-type': 'text/plain'
			})
		).toBe(415);
		expect(await call('not json')).toBe(400);
	});
	it('mutates the signed-in user’s item and 404s on someone else’s', async () => {
		expect(await call({ action: 'item', itemId: 'ia', read: true, starred: true })).toBe(200);
		expect(db.select().from(itemState).all()).toHaveLength(1);
		expect(await call({ action: 'item', itemId: 'ib', read: true })).toBe(404);
		expect(db.select().from(itemState).all()).toHaveLength(1);
	});
	it('validates payloads', async () => {
		expect(await call({ action: 'item', itemId: 'ia' })).toBe(400);
		expect(await call({ action: 'item', itemId: 'ia', read: 'yes' })).toBe(400);
		expect(await call({ action: 'markRead', view: 'nope' })).toBe(400);
		expect(await call({ action: 'markRead', view: 'feed' })).toBe(400);
		expect(await call({ action: 'markRead', view: 'all', olderThanDays: -1 })).toBe(400);
		expect(await call({ action: 'other' })).toBe(400);
	});
	it('marks a view read but not another user’s feed', async () => {
		expect(await call({ action: 'markRead', view: 'feed', id: 'fb' })).toBe(404);
		expect(await call({ action: 'markRead', view: 'all', olderThanDays: 7 })).toBe(200);
		expect(await call({ action: 'markRead', view: 'feed', id: 'fa' })).toBe(200);
		expect(db.select().from(itemState).all()).toHaveLength(1);
	});
});
