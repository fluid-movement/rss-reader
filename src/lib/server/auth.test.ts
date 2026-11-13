import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAuth } from './auth-config';
import { createConsoleUser } from './create-user';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import {
	account,
	feeds,
	folders,
	items,
	itemState,
	passkey,
	session,
	user,
	userSettings
} from './db/schema';

let connection: ReturnType<typeof connectDatabase>;
const origin = 'http://localhost:5301';
const credentials = {
	email: 'reader@example.com',
	name: 'Reader',
	password: 'a-long-test-password'
};

beforeEach(() => {
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
});
afterEach(() => connection.client.close());

function auth() {
	return createAuth(connection.db, origin, 'test-secret-with-at-least-32-characters');
}

describe('console-created users and authentication', () => {
	it('creates a credential with a hashed password, defaults, and a working session', async () => {
		const created = await createConsoleUser(connection.db, {
			...credentials,
			email: ' READER@example.com '
		});
		const stored = connection.db.select().from(account).get()!;
		expect(stored.password).not.toBe(credentials.password);
		expect(connection.db.select().from(userSettings).get()).toMatchObject({
			userId: created.id,
			retentionDays: 30,
			readerFontSize: 18,
			readerWidth: 720
		});
		const instance = auth();
		const response = await instance.api.signInEmail({ body: credentials, asResponse: true });
		expect(response.status).toBe(200);
		const cookie = response.headers.get('set-cookie')!.split(';')[0];
		const active = await instance.api.getSession({ headers: new Headers({ cookie }) });
		expect(active?.user.id).toBe(created.id);
		await instance.api.signOut({ headers: new Headers({ cookie }) });
		expect(await instance.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
	});

	it('rejects public sign-up and invalid passwords', async () => {
		const instance = auth();
		const response = await instance.handler(
			new Request(`${origin}/api/auth/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify(credentials)
			})
		);
		expect(response.status).toBe(400);
		expect(connection.db.select().from(user).all()).toHaveLength(0);
		await createConsoleUser(connection.db, credentials);
		await expect(
			instance.api.signInEmail({ body: { ...credentials, password: 'wrong-password' } })
		).rejects.toThrow();
	});

	it('rejects duplicate console users atomically and validates inputs', async () => {
		await createConsoleUser(connection.db, credentials);
		await expect(createConsoleUser(connection.db, credentials)).rejects.toThrow();
		await expect(
			createConsoleUser(connection.db, { ...credentials, password: 'short' })
		).rejects.toThrow();
		await expect(
			createConsoleUser(connection.db, { ...credentials, email: 'invalid' })
		).rejects.toThrow();
		expect(connection.db.select().from(user).all()).toHaveLength(1);
		expect(connection.db.select().from(account).all()).toHaveLength(1);
	});

	it('exposes passkey authentication with the configured relying party and requires a session to register', async () => {
		const instance = auth();
		const response = await instance.handler(
			new Request(`${origin}/api/auth/passkey/generate-authenticate-options`)
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			rpId: 'localhost',
			challenge: expect.any(String)
		});
		const registration = await instance.handler(
			new Request(`${origin}/api/auth/passkey/generate-register-options`)
		);
		expect(registration.status).toBe(401);
	});
});

describe('generated migrations and reader schema', () => {
	it('can apply migrations again without losing data', async () => {
		await createConsoleUser(connection.db, credentials);
		migrateDatabase(connection.db);
		expect(connection.db.select().from(user).all()).toHaveLength(1);
	});

	it('isolates feed subscriptions and GUIDs, enforces item state uniqueness and cascades user data', async () => {
		const db = connection.db;
		const owner = await createConsoleUser(db, credentials);
		const other = await createConsoleUser(db, { ...credentials, email: 'other@example.com' });
		const folder = db.insert(folders).values({ userId: owner.id, name: 'News' }).returning().get();
		const feed = db
			.insert(feeds)
			.values({
				userId: owner.id,
				folderId: folder.id,
				url: 'https://example.com/feed',
				title: 'Feed'
			})
			.returning()
			.get();
		const second = db
			.insert(feeds)
			.values({ userId: other.id, url: feed.url, title: 'Private copy' })
			.returning()
			.get();
		const article = db
			.insert(items)
			.values({ feedId: feed.id, guid: 'same', title: 'Article' })
			.returning()
			.get();
		db.insert(items).values({ feedId: second.id, guid: 'same', title: 'Other copy' }).run();
		expect(() =>
			db.insert(items).values({ feedId: feed.id, guid: 'same', title: 'Duplicate' }).run()
		).toThrow();
		db.insert(itemState)
			.values({ userId: owner.id, itemId: article.id, readAt: new Date(), starredAt: new Date() })
			.run();
		expect(() =>
			db.insert(itemState).values({ userId: owner.id, itemId: article.id }).run()
		).toThrow();
		expect(
			db
				.select()
				.from(items)
				.innerJoin(feeds, eq(items.feedId, feeds.id))
				.where(eq(feeds.userId, other.id))
				.all()
		).toHaveLength(1);
		db.insert(passkey)
			.values({
				id: 'key',
				userId: owner.id,
				publicKey: 'public',
				credentialID: 'credential',
				counter: 0,
				deviceType: 'singleDevice',
				backedUp: false
			})
			.run();
		await auth().api.signInEmail({ body: credentials });
		db.delete(user).where(eq(user.id, owner.id)).run();
		for (const table of [folders, itemState, passkey, session])
			expect(db.select().from(table).all()).toHaveLength(0);
		expect(db.select().from(account).all()).toHaveLength(1);
		expect(db.select().from(userSettings).all()).toHaveLength(1);
		expect(db.select().from(feeds).all()).toHaveLength(1);
		expect(db.select().from(items).all()).toHaveLength(1);
	});

	it('keeps feeds when their folder is removed', async () => {
		const db = connection.db;
		const owner = await createConsoleUser(db, credentials);
		const folder = db.insert(folders).values({ userId: owner.id, name: 'News' }).returning().get();
		db.insert(feeds)
			.values({
				userId: owner.id,
				folderId: folder.id,
				url: 'https://example.com/feed',
				title: 'Feed'
			})
			.run();
		db.delete(folders).where(eq(folders.id, folder.id)).run();
		expect(db.select().from(feeds).get()?.folderId).toBeNull();
	});
});
