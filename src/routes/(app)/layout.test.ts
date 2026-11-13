import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { folders, user } from '#lib/server/db/schema.ts';
import { sidebarPreferenceCookie } from '#lib/sidebar-preferences.ts';
import { load } from './+layout.server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});

beforeEach(() => {
	db.delete(folders).run();
	db.delete(user).run();
	db.insert(user)
		.values([
			{ id: 'alice', name: 'Alice', email: 'alice@example.com' },
			{ id: 'bob', name: 'Bob', email: 'bob@example.com' }
		])
		.run();
	db.insert(folders)
		.values([
			{ id: 'mine', userId: 'alice', name: 'Mine' },
			{ id: 'theirs', userId: 'bob', name: 'Theirs' }
		])
		.run();
});

function event(cookie?: string, authenticated = true) {
	return {
		locals: authenticated
			? { user: { id: 'alice', name: 'Alice', email: 'alice@example.com' } }
			: {},
		depends: vi.fn(),
		cookies: { get: vi.fn(() => cookie) }
	};
}
const run = (input: ReturnType<typeof event>) => load(input as never);

describe('sidebar layout preferences', () => {
	it('returns cookie preferences with the first server render, filtered by current user folders', async () => {
		const input = event('["mine","theirs","deleted","mine"]');
		expect(await run(input)).toMatchObject({
			user: { id: 'alice' },
			collapsedFolders: ['mine'],
			folders: [{ id: 'mine', name: 'Mine' }],
			readerPrefs: { fontSize: 18, width: 720 }
		});
		expect(input.cookies.get).toHaveBeenCalledWith(sidebarPreferenceCookie);
		expect(input.depends).toHaveBeenCalledWith('app:feeds');
	});

	it.each([undefined, 'garbage', '{}', '["mine",false]', 'x'.repeat(4000)])(
		'ignores absent/invalid/oversized cookie (%#)',
		async (cookie) => {
			expect(await run(event(cookie))).toHaveProperty('collapsedFolders', []);
		}
	);

	it('ignores a folder removed since the cookie was written', async () => {
		db.delete(folders).run();
		expect(await run(event('["mine"]'))).toHaveProperty('collapsedFolders', []);
	});

	it('redirects signed-out visitors before reading preferences', () => {
		const input = event('["mine"]', false);
		try {
			run(input);
			throw new Error('expected redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
		}
		expect(input.cookies.get).not.toHaveBeenCalled();
	});
});
