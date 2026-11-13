/** Only collapsed folder IDs are stored; unknown/new folders default to expanded. */
export const sidebarPreferenceCookie = 'sidebar_collapsed';
export const maxCollapsedFolders = 80;
const maxCookieValueLength = 3800;
type CookieAccess = () => Pick<Document, 'cookie'>;

/** Bound both the count and encoded size, and never retain another user's/deleted folders. */
export function pruneCollapsedFolders(collapsed: readonly string[], folderIds: readonly string[]) {
	const allowed = new Set(folderIds);
	const result: string[] = [];
	for (const id of new Set(collapsed)) {
		if (!allowed.has(id)) continue;
		if (result.length === maxCollapsedFolders) break;
		try {
			if (encodeURIComponent(JSON.stringify([...result, id])).length > maxCookieValueLength) break;
		} catch {
			continue;
		}
		result.push(id);
	}
	return result;
}

/** SvelteKit cookies.get already URL-decodes the value. */
export function readCollapsedFolders(
	value: string | undefined,
	folderIds: readonly string[]
): string[] {
	try {
		if (!value || value.length > maxCookieValueLength) return [];
		const parsed: unknown = JSON.parse(value);
		return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
			? pruneCollapsedFolders(parsed, folderIds)
			: [];
	} catch {
		return [];
	}
}

export function writeCollapsedFolders(
	access: CookieAccess,
	collapsed: readonly string[],
	folderIds: readonly string[],
	secure: boolean
) {
	const pruned = pruneCollapsedFolders(collapsed, folderIds);
	try {
		access().cookie = `${sidebarPreferenceCookie}=${encodeURIComponent(JSON.stringify(pruned))}; Path=/; SameSite=Lax; Max-Age=31536000${secure ? '; Secure' : ''}`;
	} catch {
		// Cookies may be blocked. The current session remains usable.
	}
	return pruned;
}

export function sidebarRouteActive(pathname: string, href: string) {
	return pathname === href || pathname.startsWith(`${href}/`);
}

export function folderContainsActiveRoute(
	pathname: string,
	folderId: string,
	feeds: ReadonlyArray<{ id: string; folderId: string | null }>
) {
	return (
		sidebarRouteActive(pathname, `/folder/${folderId}`) ||
		feeds.some(
			(feed) => feed.folderId === folderId && sidebarRouteActive(pathname, `/feed/${feed.id}`)
		)
	);
}
