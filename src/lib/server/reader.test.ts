import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, folders, items, itemState, user } from './db/schema';
import { getArticlePage, getReaderData, getSelectedItem, getShellData } from './reader';
import { sanitizeArticle, webUrl } from './reader-content';

let connection: ReturnType<typeof connectDatabase>;

beforeEach(() => {
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	const db = connection.db;
	db.insert(user)
		.values([
			{ id: 'owner', name: 'Reader', email: 'reader@example.com' },
			{ id: 'other', name: 'Other', email: 'other@example.com' }
		])
		.run();
	db.insert(folders)
		.values([
			{ id: 'folder', userId: 'owner', name: 'Design' },
			{ id: 'private-folder', userId: 'other', name: 'Private' }
		])
		.run();
	db.insert(feeds)
		.values([
			{
				id: 'feed',
				userId: 'owner',
				title: 'Journal',
				url: 'https://example.com/rss',
				folderId: 'folder'
			},
			{ id: 'second', userId: 'owner', title: 'Another', url: 'https://example.org/rss' },
			{
				id: 'private-feed',
				userId: 'other',
				title: 'Secret',
				url: 'https://private.example/rss',
				folderId: 'private-folder'
			}
		])
		.run();
	db.insert(items)
		.values([
			{
				id: 'article',
				feedId: 'feed',
				guid: '1',
				title: 'A story',
				summary: '<p>Preview</p>',
				content: '<p>Feed body</p>',
				fullContent: '<p>Full body</p><script>alert(1)</script>',
				link: 'https://example.com/story',
				author: 'A. Writer',
				publishedAt: new Date('2026-11-13')
			},
			{
				id: 'older',
				feedId: 'second',
				guid: '2',
				title: 'An older story',
				content: '<p>Older body</p>',
				publishedAt: new Date('2026-11-12')
			},
			{ id: 'secret', feedId: 'private-feed', guid: '3', title: 'Secret story' }
		])
		.run();
});
afterEach(() => connection.client.close());

describe('user-scoped reader queries', () => {
	it('returns only the current user’s navigation, in alphabetical order', () => {
		const shell = getShellData(connection.db, 'owner');
		expect(shell.feeds.map((feed) => feed.id)).toEqual(['second', 'feed']);
		expect(shell.folders.map((folder) => folder.id)).toEqual(['folder']);
	});
	it('lists newest articles and loads sanitized full content with metadata', () => {
		const data = getReaderData(connection.db, 'owner', { view: 'all' });
		expect(data.articles.map((article) => article.id)).toEqual(['article', 'older']);
		expect(data.hasMore).toBe(false);
		expect(
			getSelectedItem(connection.db, 'owner', { view: 'all', itemId: 'article' })
		).toMatchObject({
			title: 'A story',
			feedTitle: 'Journal',
			author: 'A. Writer',
			link: 'https://example.com/story',
			summary: 'Preview',
			sanitizedContent: '<p>Full body</p>'
		});
	});
	it('keeps nested feed and folder lists scoped and provides shareable back paths', () => {
		for (const view of ['feed', 'folder'] as const) {
			const data = getReaderData(connection.db, 'owner', { view, id: view });
			expect(data.articles.map((article) => article.id)).toEqual(['article']);
			expect(data.listPath).toBe(`/${view}/${view}`);
			expect(
				getSelectedItem(connection.db, 'owner', { view, id: view, itemId: 'article' }).id
			).toBe('article');
		}
		expect(() =>
			getSelectedItem(connection.db, 'owner', { view: 'feed', id: 'second', itemId: 'article' })
		).toThrow();
	});
	it('rejects another user’s feed, folder and article IDs without revealing them', () => {
		expect(() =>
			getReaderData(connection.db, 'owner', { view: 'feed', id: 'private-feed' })
		).toThrow();
		expect(() =>
			getReaderData(connection.db, 'owner', { view: 'folder', id: 'private-folder' })
		).toThrow();
		expect(() =>
			getSelectedItem(connection.db, 'owner', { view: 'all', itemId: 'secret' })
		).toThrow();
	});
	it('reads existing state without mutating it', () => {
		connection.db
			.insert(itemState)
			.values({ userId: 'owner', itemId: 'article', readAt: new Date(), starredAt: new Date() })
			.run();
		expect(
			getReaderData(connection.db, 'owner', { view: 'unread' }).articles.map((item) => item.id)
		).toEqual(['older']);
		expect(
			getReaderData(connection.db, 'owner', { view: 'starred' }).articles.map((item) => item.id)
		).toEqual(['article']);
		expect(connection.db.select().from(itemState).all()).toHaveLength(1);
	});
	it('provides a useful empty model before feeds exist', () => {
		const data = getReaderData(connection.db, 'new-user', { view: 'all' });
		expect(data).toMatchObject({
			articles: [],
			hasMore: false,
			hasFeeds: false,
			listPath: '/',
			viewTitle: 'All articles'
		});
	});
});

describe('article trust boundary', () => {
	it('removes scripts, event handlers, forms, embeds, styles, and unsafe URLs', () => {
		const result = sanitizeArticle(
			'<style>body{display:none}</style><script>alert(1)</script><p onclick="bad()">Safe</p><iframe src="https://evil.example"></iframe><form><input></form><a href="javascript:alert(1)">bad</a><img src="data:image/svg+xml,evil" onerror="bad()"><svg onload="bad()"></svg>'
		);
		expect(result).toContain('<p>Safe</p>');
		expect(result).not.toMatch(
			/script|onclick|iframe|form|input|style|javascript:|data:|onerror|svg/
		);
	});
	it('preserves article typography and resolves safe relative content links', () => {
		const result = sanitizeArticle(
			'<h2>Title</h2><p><em>Text</em> <a href="/more">more</a></p><img src="photo.jpg" alt="Photo">',
			'https://example.com/story'
		);
		expect(result).toContain('<h2>Title</h2>');
		expect(result).toContain('href="https://example.com/more"');
		expect(result).toContain('src="https://example.com/photo.jpg"');
		expect(result).toContain('rel="noopener noreferrer"');
	});
	it('rejects non-web action URLs', () => {
		for (const value of [
			'javascript:alert(1)',
			'data:text/html,bad',
			'/relative',
			'file:///etc/passwd',
			null
		])
			expect(webUrl(value)).toBeNull();
		expect(webUrl('https://example.com/article')).toBe('https://example.com/article');
	});
});

describe('paginated lists and starred total', () => {
	function seedMany(count: number) {
		connection.db
			.insert(items)
			.values(
				Array.from({ length: count }, (_, index) => ({
					id: `bulk-${String(index).padStart(3, '0')}`,
					feedId: 'second',
					guid: `bulk-${index}`,
					title: `Bulk ${index}`,
					// Pairs share a timestamp to exercise the id tie-break across page borders.
					publishedAt: new Date(Date.UTC(2020, 0, 1) + Math.floor(index / 2) * 60_000)
				}))
			)
			.run();
	}
	it('continues after a cursor without gaps or repeats', () => {
		seedMany(25);
		const selection = { view: 'feed', id: 'second' } as const;
		const seen: string[] = [];
		let page = getArticlePage(connection.db, 'owner', selection, { limit: 10 });
		expect(page.articles).toHaveLength(10);
		expect(page.hasMore).toBe(true);
		for (;;) {
			seen.push(...page.articles.map((article) => article.id));
			if (!page.hasMore) break;
			const last = page.articles.at(-1)!;
			page = getArticlePage(connection.db, 'owner', selection, {
				limit: 10,
				after: { sortAt: last.sortAt.getTime(), id: last.id }
			});
		}
		const all = getArticlePage(connection.db, 'owner', selection, { limit: 500 });
		expect(seen).toEqual(all.articles.map((article) => article.id));
		expect(new Set(seen).size).toBe(seen.length);
		expect(seen.length).toBe(26); // 25 seeded plus the fixture item in this feed
	});
	it('bounds the default first page', () => {
		seedMany(130);
		const data = getReaderData(connection.db, 'owner', { view: 'all' });
		expect(data.articles).toHaveLength(100);
		expect(data.hasMore).toBe(true);
	});
	it('counts starred items per user, without the list limit', () => {
		expect(getShellData(connection.db, 'owner').starred).toBe(0);
		connection.db
			.insert(itemState)
			.values({ userId: 'owner', itemId: 'article', starredAt: new Date() })
			.run();
		expect(getShellData(connection.db, 'owner').starred).toBe(1);
		expect(getShellData(connection.db, 'other').starred).toBe(0);
	});
});
