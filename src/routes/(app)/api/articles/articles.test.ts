import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '#lib/server/db/index.ts';
import { feeds, items, user } from '#lib/server/db/schema.ts';
import { GET } from './+server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});

beforeEach(() => {
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
			...[1, 2, 3, 4, 5].map((n) => ({
				id: `a${n}`,
				feedId: 'fa',
				guid: `a${n}`,
				title: `Mine ${n}`,
				publishedAt: new Date(Date.UTC(2026, 0, n))
			})),
			{
				id: 'b1',
				feedId: 'fb',
				guid: 'b1',
				title: 'Theirs',
				publishedAt: new Date(Date.UTC(2026, 0, 1))
			}
		])
		.run();
});

async function call(query: string, userId: string | null = 'a') {
	const url = new URL(`https://reader.example/api/articles?${query}`);
	try {
		const response = await GET({
			locals: userId ? { user: { id: userId } } : {},
			url
		} as Parameters<typeof GET>[0]);
		return { status: response.status, body: await response.json() };
	} catch (thrown) {
		return { status: (thrown as { status: number }).status, body: null };
	}
}

const cursor = (day: number, id: string) => `afterSortAt=${Date.UTC(2026, 0, day)}&afterId=${id}`;

describe('articles page endpoint', () => {
	it('requires a session and validates parameters', async () => {
		expect((await call(`view=all&${cursor(5, 'a5')}`, null)).status).toBe(401);
		expect((await call(`view=nope&${cursor(5, 'a5')}`)).status).toBe(400);
		expect((await call('view=all')).status).toBe(400);
		expect((await call('view=all&afterSortAt=&afterId=a5')).status).toBe(400);
		expect((await call(`view=feed&${cursor(5, 'a5')}`)).status).toBe(400);
		expect((await call(`view=all&${cursor(5, 'a5')}&limit=0`)).status).toBe(400);
	});
	it('returns the next page after the cursor with epoch-millisecond dates', async () => {
		const { status, body } = await call(`view=all&${cursor(5, 'a5')}&limit=2`);
		expect(status).toBe(200);
		expect(body.articles.map((article: { id: string }) => article.id)).toEqual(['a4', 'a3']);
		expect(body.hasMore).toBe(true);
		expect(body.articles[0].sortAt).toBe(Date.UTC(2026, 0, 4));
	});
	it('stays scoped to the signed-in user and their own feeds', async () => {
		const mine = await call(`view=all&${cursor(5, 'a5')}&limit=50`);
		expect(mine.body.articles.map((article: { id: string }) => article.id)).toEqual([
			'a4',
			'a3',
			'a2',
			'a1'
		]);
		expect(mine.body.hasMore).toBe(false);
		expect((await call(`view=feed&id=fb&${cursor(5, 'a5')}`)).status).toBe(404);
	});
});
