import { describe, expect, it } from 'vitest';
import { count, eq, isNotNull } from 'drizzle-orm';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, folders, itemState, items, user } from './db/schema';
import { assertSafeToSeed } from '../../../scripts/seed-guard';
import { seedDatabase } from '../../../scripts/seed-lib';

describe('seed guard', () => {
	it('allows localhost origins', () => {
		expect(() => assertSafeToSeed({ ORIGIN: 'http://localhost:5173' })).not.toThrow();
		expect(() =>
			assertSafeToSeed({ ORIGIN: 'http://127.0.0.1:5307', NODE_ENV: 'development' })
		).not.toThrow();
	});
	it('refuses production', () => {
		expect(() =>
			assertSafeToSeed({ NODE_ENV: 'production', ORIGIN: 'http://localhost:5173' })
		).toThrow(/production/);
	});
	it('refuses production in any casing or padding', () => {
		for (const value of [
			'Production',
			'PRODUCTION',
			' production',
			'production ',
			'production\n'
		]) {
			expect(() => assertSafeToSeed({ NODE_ENV: value, ORIGIN: 'http://localhost:5173' })).toThrow(
				/production/
			);
		}
	});
	it('handles tricky origins', () => {
		for (const origin of [
			'http://localhost@evil.com',
			'http://user:pw@localhost',
			'http://localhost.:5173',
			'http://localhost.evil.com'
		]) {
			expect(() => assertSafeToSeed({ ORIGIN: origin })).toThrow(/ORIGIN/);
		}
		for (const origin of ['http://LOCALHOST:8080', 'http://localhost:5173', 'http://[::1]:3000']) {
			expect(() => assertSafeToSeed({ ORIGIN: origin })).not.toThrow();
		}
	});
	it('restricts DATABASE_URL to the project directory', () => {
		const base = { ORIGIN: 'http://localhost:5173' };
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: '/data/app.db' }, '/proj')).toThrow(
			/DATABASE_URL/
		);
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: '../x.db' }, '/proj')).toThrow(
			/DATABASE_URL/
		);
		expect(() => assertSafeToSeed({ ...base, DATABASE_URL: 'local.db' }, '/proj')).not.toThrow();
		expect(() =>
			assertSafeToSeed({ ...base, DATABASE_URL: '/proj/local.db' }, '/proj')
		).not.toThrow();
	});
	it('refuses non-local or missing origins', () => {
		expect(() => assertSafeToSeed({ ORIGIN: 'https://reader.example.org' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({ ORIGIN: 'https://localhost.evil.example' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({ ORIGIN: 'not a url' })).toThrow(/ORIGIN/);
		expect(() => assertSafeToSeed({})).toThrow(/ORIGIN/);
	});
});

describe('seedDatabase', () => {
	async function snapshot(db: ReturnType<typeof connectDatabase>['db']) {
		const n = (rows: { n: number }[]) => rows[0].n;
		return {
			users: n(db.select({ n: count() }).from(user).all()),
			folders: n(db.select({ n: count() }).from(folders).all()),
			feeds: n(db.select({ n: count() }).from(feeds).all()),
			items: n(db.select({ n: count() }).from(items).all()),
			state: n(db.select({ n: count() }).from(itemState).all())
		};
	}

	it('is idempotent and covers every feed status', async () => {
		const { client, db } = connectDatabase(':memory:');
		migrateDatabase(db);
		const first = await seedDatabase(db);
		const before = await snapshot(db);
		await seedDatabase(db);
		expect(await snapshot(db)).toEqual(before);
		expect(before.users).toBe(1);
		expect(before.folders).toBe(3);
		expect(first.items).toBe(before.items);

		const all = db.select().from(feeds).all();
		expect(all.some((f) => f.errorCount >= 3 && f.lastError)).toBe(true);
		expect(all.some((f) => f.lastFetchedAt === null && f.nextFetchAt)).toBe(true);
		expect(all.some((f) => f.extractFullText)).toBe(true);
		expect(all.some((f) => f.refreshIntervalMinutes !== 60)).toBe(true);
		expect(all.some((f) => f.folderId === null)).toBe(true);
		expect(db.select().from(items).where(isNotNull(items.fullContent)).all()).toHaveLength(1);
		expect(
			db.select().from(itemState).where(isNotNull(itemState.starredAt)).all().length
		).toBeGreaterThan(0);
		expect(
			db.select().from(itemState).where(isNotNull(itemState.readAt)).all().length
		).toBeGreaterThan(0);
		expect(db.select().from(user).where(eq(user.email, 'test@example.com')).all()).toHaveLength(1);
		const hostile = db.select().from(items).where(eq(items.guid, 'cooking-slowly-2')).get()!;
		expect(hostile.content).toContain('Safe text remains');
		expect(hostile.content).not.toMatch(/<script|onerror|onclick|javascript:/i);
		client.close();
	});
});
