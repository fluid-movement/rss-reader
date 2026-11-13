import { hashPassword } from 'better-auth/crypto';
import type { AppDatabase } from './db/connect';
import { account, user, userSettings } from './db/schema';

export async function createConsoleUser(
	db: AppDatabase,
	input: { email: string; name: string; password: string }
) {
	const email = input.email.trim().toLowerCase();
	const name = input.name.trim();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid email is required.');
	if (!name) throw new Error('A name is required.');
	if (input.password.length < 8 || input.password.length > 128) {
		throw new Error('Password must contain 8–128 characters.');
	}
	const password = await hashPassword(input.password);
	const id = crypto.randomUUID();
	const now = new Date();
	// Keep the user, credential and default settings atomic. No sign-up endpoint is enabled.
	db.transaction((tx) => {
		tx.insert(user).values({ id, email, name, createdAt: now, updatedAt: now }).run();
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
	return { id, email, name };
}
