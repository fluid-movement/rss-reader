import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import type { AppDatabase } from './db/connect';
import { account, user, userSettings } from './db/schema';

const USERNAME = /^[a-zA-Z0-9_.]+$/;

export async function createConsoleUser(
	db: AppDatabase,
	input: { username: string; name: string; password: string }
) {
	const displayUsername = input.username.trim();
	// Same normalisation and rules as Better Auth's username plugin defaults.
	const username = displayUsername.toLowerCase();
	const name = input.name.trim();
	if (username.length < 3 || username.length > 30 || !USERNAME.test(username)) {
		throw new Error('Username must contain 3–30 letters, digits, underscores or dots.');
	}
	if (!name) throw new Error('A name is required.');
	if (input.password.length < 8 || input.password.length > 128) {
		throw new Error('Password must contain 8–128 characters.');
	}
	if (db.select({ id: user.id }).from(user).where(eq(user.username, username)).get()) {
		throw new Error('That username is already taken.');
	}
	const password = await hashPassword(input.password);
	const id = crypto.randomUUID();
	// Better Auth requires a unique email; this internal value is never shown or used for mail.
	const email = `${id}@users.invalid`;
	const now = new Date();
	// Keep the user, credential and default settings atomic. No sign-up endpoint is enabled.
	db.transaction((tx) => {
		tx.insert(user)
			.values({ id, email, name, username, displayUsername, createdAt: now, updatedAt: now })
			.run();
		tx.insert(account)
			.values({
				id: crypto.randomUUID(),
				userId: id,
				accountId: id,
				providerId: 'credential',
				password,
				createdAt: now,
				updatedAt: now
			})
			.run();
		tx.insert(userSettings).values({ userId: id }).run();
	});
	return { id, username, name };
}
