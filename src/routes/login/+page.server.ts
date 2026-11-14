import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request }) => {
		const data = await request.formData();
		const username = data.get('username')?.toString().trim() ?? '';
		const password = data.get('password')?.toString() ?? '';
		if (!username || !password) return fail(400, { message: 'Enter your username and password.' });
		try {
			await auth.api.signInUsername({ body: { username, password }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { message: 'Invalid username or password.' });
			throw error;
		}
		redirect(303, '/');
	}
};
