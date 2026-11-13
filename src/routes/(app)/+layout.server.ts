import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getShellData } from '#lib/server/reader.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:feeds');
	return {
		user: { name: locals.user.name, email: locals.user.email },
		...getShellData(db, locals.user.id)
	};
};
