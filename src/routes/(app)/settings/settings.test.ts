import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { feeds, user, userSettings } from '#lib/server/db/schema.ts';
import { actions, load } from './+page.server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});
vi.mock('#lib/server/auth.ts', () => ({
	auth: {
		api: {
			listPasskeys: vi.fn(async () => [
				{ id: 'p2', name: 'Phone', createdAt: new Date('2026-02-01') },
				{ id: 'p1', name: null, createdAt: new Date('2026-01-01') }
			])
		}
	}
}));

type Handler = (event: never) => Promise<unknown>;
function event(fields: Record<string, string>, authenticated = true) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	return {
		locals: authenticated ? { user: { id: 'a' } } : {},
		request: new Request('https://reader.example/settings', { method: 'POST', body })
	} as never;
}
const run = (name: 'reader' | 'retention' | 'feed', fields: Record<string, string>, auth = true) =>
	(actions[name] as Handler)(event(fields, auth));
const settings = (id = 'a') =>
	db.select().from(userSettings).where(eq(userSettings.userId, id)).get();
const feed = (id: string) => db.select().from(feeds).where(eq(feeds.id, id)).get()!;

beforeEach(() => {
	db.delete(feeds).run();
	db.delete(userSettings).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'a', name: 'A', email: 'a@example.com' },
			{ id: 'b', name: 'B', email: 'b@example.com' }
		])
		.run();
	db.insert(userSettings).values({ userId: 'b' }).run();
	db.insert(feeds)
		.values([
			{
				id: 'fa',
				userId: 'a',
				title: 'Mine',
				url: 'https://a.example/rss',
				lastFetchedAt: new Date('2026-11-13T10:00:00Z')
			},
			{ id: 'fb', userId: 'b', title: 'Theirs', url: 'https://b.example/rss' }
		])
		.run();
});

describe('settings actions', () => {
	it.each(['reader', 'retention', 'feed'] as const)('%s requires a session', async (name) => {
		try {
			await run(name, {}, false);
			throw new Error('expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
		}
	});

	it('saves reader preferences, creating the row when missing, for the signed-in user only', async () => {
		expect(settings()).toBeUndefined();
		expect(await run('reader', { fontSize: '20', width: '800', userId: 'b' })).toMatchObject({
			success: true
		});
		expect(settings()).toMatchObject({ readerFontSize: 20, readerWidth: 800, retentionDays: 30 });
		expect(settings('b')).toMatchObject({ readerFontSize: 18, readerWidth: 720 });
	});

	it.each([
		['13', '720'],
		['25', '720'],
		['18', '479'],
		['18', '1001'],
		['abc', '720'],
		['18.5', '720'],
		['', '720'],
		['1e1', '720'],
		['-5', '720']
	])('rejects reader values %s / %s', async (fontSize, width) => {
		expect(await run('reader', { fontSize, width })).toMatchObject({
			status: 400,
			data: { success: false }
		});
		expect(settings()).toBeUndefined();
	});

	it('validates the retention range and allows 0', async () => {
		expect(await run('retention', { retentionDays: '0' })).toMatchObject({ success: true });
		expect(settings()?.retentionDays).toBe(0);
		await run('retention', { retentionDays: '90' });
		expect(settings()?.retentionDays).toBe(90);
		for (const bad of ['-1', '3651', '', 'x', '1.5', '10 days'])
			expect(await run('retention', { retentionDays: bad })).toMatchObject({ status: 400 });
		expect(settings()?.retentionDays).toBe(90);
	});

	it('updates title, interval and full-text of an owned feed and re-times the next fetch', async () => {
		expect(
			await run('feed', {
				feedId: 'fa',
				title: '  Renamed  ',
				refreshIntervalMinutes: '15',
				extractFullText: 'on'
			})
		).toMatchObject({ success: true });
		expect(feed('fa')).toMatchObject({
			title: 'Renamed',
			refreshIntervalMinutes: 15,
			extractFullText: true
		});
		expect(feed('fa').nextFetchAt?.toISOString()).toBe('2026-11-13T10:15:00.000Z');
		await run('feed', { feedId: 'fa', title: 'Renamed', refreshIntervalMinutes: '15' });
		expect(feed('fa').extractFullText).toBe(false);
	});

	it('rejects invalid feed input with 400 and leaves the feed unchanged', async () => {
		const bad = [
			{ title: '', refreshIntervalMinutes: '15' },
			{ title: 'x'.repeat(201), refreshIntervalMinutes: '15' },
			{ title: 'ok', refreshIntervalMinutes: '7' },
			{ title: 'ok', refreshIntervalMinutes: 'soon' }
		];
		for (const fields of bad)
			expect(await run('feed', { feedId: 'fa', ...fields })).toMatchObject({ status: 400 });
		expect(feed('fa')).toMatchObject({ title: 'Mine', refreshIntervalMinutes: 60 });
	});

	it('answers 404 for another user’s or an unknown feed and does not modify it', async () => {
		for (const feedId of ['fb', 'missing', '']) {
			await expect(
				run('feed', { feedId, title: 'Hacked', refreshIntervalMinutes: '15' })
			).rejects.toSatisfy((error) => isHttpError(error, 404));
		}
		expect(feed('fb').title).toBe('Theirs');
	});

	it('caps the size of a submission', async () => {
		await expect(
			run('retention', { retentionDays: '5', junk: 'x'.repeat(5000) })
		).rejects.toSatisfy((error) => isHttpError(error, 413));
	});
});

describe('feed title cleaning', () => {
	it('strips control and bidi characters from custom titles', async () => {
		await run('feed', {
			feedId: 'fa',
			title: '<script>alert(1)</script> \u202eRTL\u0007ctrl',
			refreshIntervalMinutes: '60'
		});
		expect(feed('fa').title).toBe('<script>alert(1)</script> RTLctrl');
	});
	it('rejects a title that is only control characters', async () => {
		expect(
			await run('feed', { feedId: 'fa', title: '\u202e\u0007 ', refreshIntervalMinutes: '60' })
		).toMatchObject({ status: 400 });
	});
});

describe('settings load', () => {
	it('returns defaults, only the user’s feeds and passkeys oldest first', async () => {
		const result = (await (load as Handler)({
			locals: { user: { id: 'a' } },
			request: new Request('https://reader.example/settings')
		} as never)) as {
			prefs: unknown;
			feeds: { id: string }[];
			passkeys: { id: string; name: string | null }[];
		};
		expect(result.prefs).toEqual({ retentionDays: 30, readerFontSize: 18, readerWidth: 720 });
		expect(result.feeds.map((row) => row.id)).toEqual(['fa']);
		expect(result.passkeys.map((row) => row.id)).toEqual(['p1', 'p2']);
	});
});
