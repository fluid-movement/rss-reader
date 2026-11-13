import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import type { AppDatabase } from './db/connect';

/** Shared by the web server and the server-independent console command. */
export function createAuth(db: AppDatabase, origin: string, secret: string) {
	const url = new URL(origin);
	return betterAuth({
		baseURL: url.origin,
		secret,
		database: drizzleAdapter(db, { provider: 'sqlite' }),
		emailAndPassword: { enabled: true, disableSignUp: true },
		plugins: [passkey({ rpID: url.hostname, origin: url.origin, rpName: 'RSS Reader' })]
	});
}
