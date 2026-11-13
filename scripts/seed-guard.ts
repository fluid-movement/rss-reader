import { isAbsolute, relative, resolve } from 'node:path';

/** Refuses to seed anywhere but a local development environment. */
export function assertSafeToSeed(
	env: Record<string, string | undefined>,
	projectDir = process.cwd()
) {
	if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
		throw new Error(
			'Refusing to seed: NODE_ENV is production. The seed creates a known-password account.'
		);
	}
	let hostname = '';
	try {
		const origin = new URL(env.ORIGIN ?? '');
		// Userinfo is never legitimate in ORIGIN and can disguise the real host.
		if (!origin.username && !origin.password) hostname = origin.hostname;
	} catch {
		// Falls through to the refusal below.
	}
	if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
		throw new Error(
			'Refusing to seed: ORIGIN must be a localhost or 127.0.0.1 URL (for example http://localhost:5173).'
		);
	}
	const database = env.DATABASE_URL;
	if (database && database !== ':memory:') {
		const rel = relative(resolve(projectDir), resolve(projectDir, database));
		if (rel.startsWith('..') || isAbsolute(rel)) {
			throw new Error('Refusing to seed: DATABASE_URL must point inside the project directory.');
		}
	}
}
