import type { Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.ts';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { migrateDatabase } from '#lib/server/db/migrate.ts';

export function init() {
	if (!building) migrateDatabase(db);
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	const publicRoute = event.route.id === '/login' || event.route.id === '/health';
	const authRoute = event.url.pathname.startsWith('/api/auth/');
	// Real static assets are served outside this hook by SvelteKit.
	if (!event.locals.user && !publicRoute && !authRoute) redirect(303, '/login');
	return svelteKitHandler({ event, resolve, auth, building });
};

export const handle: Handle = handleBetterAuth;
