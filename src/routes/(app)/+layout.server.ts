import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getShellData } from '#lib/server/reader.ts';
import { getUserPrefs } from '#lib/server/settings.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:feeds');
	const { readerFontSize, readerWidth } = getUserPrefs(db, locals.user.id);
	return {
		user: { name: locals.user.name, email: locals.user.email },
		// Reader preferences ride along with the shell so they are in the first server render.
		readerPrefs: { fontSize: readerFontSize, width: readerWidth },
		...getShellData(db, locals.user.id)
	};
};
