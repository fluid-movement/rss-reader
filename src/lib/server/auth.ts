import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { createAuth } from './auth-config';

const config = createAuth(db, ORIGIN, BETTER_AUTH_SECRET).options;

export const auth = betterAuth({
	...config,
	plugins: [
		...config.plugins,
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
