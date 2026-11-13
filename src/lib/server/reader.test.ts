import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, folders, items, itemState, user } from './db/schema';
import { getReaderData, getShellData } from './reader';
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
		const data = getReaderData(connection.db, 'owner', { view: 'all', itemId: 'article' });
		expect(data.articles.map((article) => article.id)).toEqual(['article', 'older']);
		expect(data.selectedItem).toMatchObject({
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
			const data = getReaderData(connection.db, 'owner', { view, id: view, itemId: 'article' });
			expect(data.articles.map((article) => article.id)).toEqual(['article']);
			expect(data.listPath).toBe(`/${view}/${view}`);
		}
		expect(() =>
			getReaderData(connection.db, 'owner', { view: 'feed', id: 'second', itemId: 'article' })
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
			getReaderData(connection.db, 'owner', { view: 'all', itemId: 'secret' })
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
			selectedItem: null,
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
