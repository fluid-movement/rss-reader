import { describe, expect, it } from 'vitest';
import {
	folderContainsActiveRoute,
	readCollapsedFolders,
	maxCollapsedFolders,
	sidebarPreferenceCookie,
	sidebarRouteActive,
	writeCollapsedFolders
} from './sidebar-preferences.ts';

describe('sidebar persistence', () => {
	it('defaults to expanded, round-trips collapsed folders and isolates viewers', () => {
		const document = { cookie: '' };
		expect(readCollapsedFolders(undefined, ['one', 'two'])).toEqual([]);
		writeCollapsedFolders(() => document, ['one', 'two', 'deleted'], ['one', 'two'], false);
		expect(document.cookie).toBe(
			`${sidebarPreferenceCookie}=%5B%22one%22%2C%22two%22%5D; Path=/; SameSite=Lax; Max-Age=31536000`
		);
		const value = decodeURIComponent(document.cookie.split(';')[0].split('=')[1]);
		expect(readCollapsedFolders(value, ['one', 'two'])).toEqual(['one', 'two']);
		expect(readCollapsedFolders(value, ['three'])).toEqual([]);
		writeCollapsedFolders(() => document, ['one'], ['one'], true);
		expect(document.cookie).toMatch(/; Secure$/);
	});

	it.each(['not json', '{}', 'null', '42', '["one", false]', '{"one":true}'])(
		'ignores malformed storage: %s',
		(value) => {
			expect(readCollapsedFolders(value, ['one'])).toEqual([]);
		}
	);

	it('deduplicates stored folder IDs', () => {
		expect(readCollapsedFolders('["one","one","deleted"]', ['one'])).toEqual(['one']);
	});

	it('caps the count and encoded cookie size, including unusually long ids', () => {
		const ids = Array.from(
			{ length: 100 },
			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
		);
		const document = { cookie: '' };
		expect(writeCollapsedFolders(() => document, ids, ids, false)).toHaveLength(
			maxCollapsedFolders
		);
		expect(document.cookie.length).toBeLessThan(4096);
		expect(readCollapsedFolders(JSON.stringify(ids.slice(0, 90)), ids)).toHaveLength(
			maxCollapsedFolders
		);
		expect(readCollapsedFolders(JSON.stringify(ids), ids)).toEqual([]);
		expect(readCollapsedFolders(' '.repeat(4000), ids)).toEqual([]);
		const longIds = ['x'.repeat(2000), 'y'.repeat(2000)];
		expect(writeCollapsedFolders(() => document, longIds, longIds, false)).toHaveLength(1);
		expect(document.cookie.length).toBeLessThan(4096);
	});

	it('tolerates inaccessible documents, blocked setters and silently rejected cookies', () => {
		const blocked = () => {
			throw new Error('blocked');
		};
		expect(writeCollapsedFolders(blocked, ['one'], ['one'], false)).toEqual(['one']);
		const document = {
			set cookie(_value: string) {
				blocked();
			}
		};
		expect(writeCollapsedFolders(() => document, ['one'], ['one'], false)).toEqual(['one']);
		const silent = { set cookie(_value: string) {} };
		expect(writeCollapsedFolders(() => silent, ['one'], ['one'], false)).toEqual(['one']);
	});
});

describe('active folder visibility', () => {
	const feeds = [
		{ id: 'feed-1', folderId: 'one' },
		{ id: 'feed-2', folderId: 'two' },
		{ id: 'loose', folderId: null }
	];
	it.each(['/folder/one', '/folder/one/item/article', '/feed/feed-1', '/feed/feed-1/item/article'])(
		'keeps the containing folder expanded on %s',
		(pathname) => {
			expect(folderContainsActiveRoute(pathname, 'one', feeds)).toBe(true);
		}
	);
	it.each([
		'/folder/one-more',
		'/feed/feed-10',
		'/feed/feed-2/item/article',
		'/feed/loose',
		'/item/article',
		'/unread'
	])('does not force unrelated folder open on %s', (pathname) => {
		expect(folderContainsActiveRoute(pathname, 'one', feeds)).toBe(false);
	});
	it('matches route boundaries and trailing slashes', () => {
		expect(sidebarRouteActive('/feed/feed-1/', '/feed/feed-1')).toBe(true);
		expect(sidebarRouteActive('/feed/feed-10', '/feed/feed-1')).toBe(false);
	});
});
