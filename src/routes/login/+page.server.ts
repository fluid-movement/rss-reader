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
		const email = data.get('email')?.toString().trim() ?? '';
		const password = data.get('password')?.toString() ?? '';
		if (!email || !password) return fail(400, { message: 'Enter your email and password.' });
		try {
			await auth.api.signInEmail({ body: { email, password }, headers: request.headers });
		} catch (error) {
			if (error instanceof APIError) return fail(400, { message: 'Invalid email or password.' });
			throw error;
		}
		redirect(303, '/');
	}
};
