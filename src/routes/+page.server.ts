import { redirect } from '@sveltejs/kit';
import { auth } from '#lib/server/auth.ts';
import type { Actions } from './$types';

export const actions: Actions = {
	logout: async ({ request }) => {
		await auth.api.signOut({ headers: request.headers });
		redirect(303, '/login');
	}
};
