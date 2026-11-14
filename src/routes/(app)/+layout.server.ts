import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.ts';
import { getShellData } from '#lib/server/reader.ts';
import { getUserPrefs } from '#lib/server/settings.ts';
import { readCollapsedFolders, sidebarPreferenceCookie } from '#lib/sidebar-preferences.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, depends, cookies }) => {
	if (!locals.user) redirect(303, '/login');
	depends('app:feeds');
	const { readerFontSize, readerWidth } = getUserPrefs(db, locals.user.id);
	const shell = getShellData(db, locals.user.id);
	return {
		user: {
			id: locals.user.id,
			name: locals.user.name,
			username: locals.user.username ?? locals.user.name
		},
		// Reader preferences ride along with the shell so they are in the first server render.
		readerPrefs: { fontSize: readerFontSize, width: readerWidth },
		...shell,
		collapsedFolders: readCollapsedFolders(
			cookies.get(sidebarPreferenceCookie),
			shell.folders.map((folder) => folder.id)
		)
	};
};
