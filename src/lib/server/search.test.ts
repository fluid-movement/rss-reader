import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds, items, itemState, user } from './db/schema';
import { getArticlePage, getReaderData, getUnreadCounts } from './reader';
import { buildMatch, MAX_QUERY_LENGTH, MAX_QUERY_TERMS, normalizeQuery } from './search';
import { htmlToSearchText } from './db/search-text';

let connection: ReturnType<typeof connectDatabase>;
const day = (n: number) => new Date(Date.UTC(2026, 10, n));
const search = (query: string, userId = 'owner', options = {}) =>
	getArticlePage(connection.db, userId, { view: 'search', query }, options);
const titles = (query: string, userId = 'owner') =>
	search(query, userId).articles.map((article) => article.title);
const ftsRows = () =>
	(connection.client.prepare('select count(*) as n from items_fts').get() as { n: number }).n;

function add(id: string, values: Partial<typeof items.$inferInsert> = {}, feedId = 'feed') {
	connection.db
		.insert(items)
		.values({ id, feedId, guid: id, title: id, publishedAt: day(10), ...values })
		.run();
}

beforeEach(() => {
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	const { db } = connection;
	db.insert(user)
		.values([
			{ id: 'owner', email: 'owner@example.com', name: 'Owner' },
			{ id: 'other', email: 'other@example.com', name: 'Other' }
		])
		.run();
	db.insert(feeds)
		.values([
			{ id: 'feed', userId: 'owner', title: 'Mine', url: 'https://example.com/a' },
			{ id: 'secret', userId: 'other', title: 'Theirs', url: 'https://example.com/b' }
		])
		.run();
});
afterEach(() => connection.client.close());

describe('index sync', () => {
	it('indexes inserts, updates (including full_content) and deletes', () => {
		add('a', { title: 'Quantum gardens', content: '<p>soil</p>' });
		expect(titles('quantum')).toEqual(['Quantum gardens']);
		expect(titles('soil')).toEqual(['Quantum gardens']);
		expect(titles('lichen')).toEqual([]);
		// The full-text extraction issue writes full_content with a plain UPDATE.
		connection.db
			.update(items)
			.set({ fullContent: '<article><p>Lichen everywhere</p></article>' })
			.where(eq(items.id, 'a'))
			.run();
		expect(titles('lichen')).toEqual(['Quantum gardens']);
		expect(titles('soil')).toEqual(['Quantum gardens']);
		connection.db.update(items).set({ title: 'Renamed' }).where(eq(items.id, 'a')).run();
		expect(titles('quantum')).toEqual([]);
		expect(titles('renamed')).toEqual(['Renamed']);
		expect(ftsRows()).toBe(1);
		connection.db.delete(items).where(eq(items.id, 'a')).run();
		expect(titles('renamed')).toEqual([]);
		expect(ftsRows()).toBe(0);
	});

	it('removes rows when a feed (and so its items) is deleted', () => {
		add('a', { title: 'Findable' });
		connection.db.delete(feeds).where(eq(feeds.id, 'feed')).run();
		expect(ftsRows()).toBe(0);
	});

	it('does not index markup, attributes, scripts or styles as words', () => {
		add('a', {
			title: 'Plain',
			content:
				'<p class="uniqueclass" data-x="hiddenattr">Visible &amp; <b>bold</b>words</p><script>scriptword()</script><style>.stylerule{}</style><a href="https://example.com/linkpath">link text</a>',
			summary: '<img alt="alttext" src="https://example.com/imgsrc.png">'
		});
		for (const hidden of [
			'uniqueclass',
			'hiddenattr',
			'scriptword',
			'stylerule',
			'linkpath',
			'imgsrc',
			'href',
			'class'
		])
			expect(titles(hidden), hidden).toEqual([]);
		for (const seen of ['visible', 'bold', 'words', 'link', 'text'])
			expect(titles(seen), seen).toEqual(['Plain']);
		expect(htmlToSearchText('<p>a</p><p>b</p>')).toBe('a b');
		expect(htmlToSearchText('x &lt;y&gt;')).toBe('x <y>');
	});

	it('backfills items that existed before the migration', () => {
		const dir = mkdtempSync(join(tmpdir(), 'rss-migrations-'));
		try {
			cpSync(resolve('drizzle'), dir, { recursive: true });
			const journalPath = join(dir, 'meta', '_journal.json');
			const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
			const full = journal.entries;
			journal.entries = full.filter((entry: { tag: string }) => !entry.tag.endsWith('items_fts'));
			expect(journal.entries.length).toBe(full.length - 1);
			writeFileSync(journalPath, JSON.stringify(journal));
			const old = connectDatabase(':memory:');
			migrate(old.db, { migrationsFolder: dir });
			old.db.insert(user).values({ id: 'u', email: 'u@example.com', name: 'U' }).run();
			old.db
				.insert(feeds)
				.values({ id: 'f', userId: 'u', title: 'F', url: 'https://x.test/' })
				.run();
			old.db
				.insert(items)
				.values({ id: 'i', feedId: 'f', guid: 'g', title: 'Legacy heron', content: '<p>marsh</p>' })
				.run();
			// Upgrade the existing database in place.
			migrate(old.db, { migrationsFolder: resolve('drizzle') });
			const hit = (term: string) =>
				getArticlePage(old.db, 'u', { view: 'search', query: term }).articles.map((a) => a.id);
			expect(hit('heron')).toEqual(['i']);
			expect(hit('marsh')).toEqual(['i']);
			old.client.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('scoping', () => {
	it('never returns another user’s items', () => {
		add('mine', { title: 'Shared word' });
		add('theirs', { title: 'Shared word secret' }, 'secret');
		expect(search('shared').articles.map((a) => a.id)).toEqual(['mine']);
		expect(search('shared', 'other').articles.map((a) => a.id)).toEqual(['theirs']);
		expect(titles('secret')).toEqual([]);
	});

	it('reports read/starred state and leaves unread counts alone', () => {
		add('a', { title: 'State check' });
		connection.db
			.insert(itemState)
			.values({ userId: 'owner', itemId: 'a', starredAt: day(11) })
			.run();
		const [article] = search('state').articles;
		expect(article).toMatchObject({ read: false, starred: true });
		search('state');
		expect(getUnreadCounts(connection.db, 'owner')).toEqual({ feed: 1 });
	});
});

describe('query handling', () => {
	const hostile = [
		'"',
		'""',
		'"unbalanced',
		'*',
		'a*',
		'-',
		'-term',
		'NEAR(a b)',
		'NEAR/2',
		'a AND',
		'OR b',
		'NOT',
		'title:secret',
		'{title}: x',
		'^x',
		'(((',
		')',
		'a OR (b',
		"'; drop table items; --",
		'\u0000',
		'\u0001\u0002',
		'日本語 テスト',
		'🙂',
		'\uD800',
		' \n\t ',
		'',
		'x'.repeat(5000),
		'word '.repeat(2000)
	];
	it('never throws on hostile input', () => {
		add('a', { title: 'Hello world', content: 'AND OR NOT near' });
		for (const query of hostile)
			expect(() => search(query), JSON.stringify(query.slice(0, 20))).not.toThrow();
		expect(titles('')).toEqual([]);
		expect(titles('   ')).toEqual([]);
		expect(titles('"')).toEqual([]);
		expect(ftsRows()).toBe(1);
	});

	it('treats operators as literal words', () => {
		add('a', { title: 'Cats and dogs' });
		add('b', { title: 'Cats only' });
		expect(titles('cats AND dogs')).toEqual(['Cats and dogs']);
		expect(titles('cats OR dogs')).toEqual([]);
		expect(titles('cats NOT dogs')).toEqual([]);
		expect(titles('title:cats')).toEqual([]);
		// '-' is dropped, never interpreted as NOT.
		expect(titles('cats -dogs')).toEqual(['Cats and dogs']);
	});

	it('builds quoted terms with a prefix on the last term and caps length and count', () => {
		expect(buildMatch('hello wor')).toBe('"hello" "wor"*');
		expect(buildMatch('(a) "b" c:d')).toBe('"a" "b" "c" "d"*');
		expect(buildMatch('!!!')).toBeNull();
		expect(buildMatch('a '.repeat(100))?.split(' ').length).toBe(MAX_QUERY_TERMS);
		expect(normalizeQuery(`  ${'x'.repeat(1000)}  `).length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
		expect(buildMatch('x'.repeat(1000))?.length).toBeLessThan(80);
	});

	it('matches prefixes, accents and unicode', () => {
		add('a', { title: 'Café Zürich 東京' });
		expect(titles('caf')).toEqual(['Café Zürich 東京']);
		expect(titles('cafe zurich')).toEqual(['Café Zürich 東京']);
		expect(titles('東京')).toEqual(['Café Zürich 東京']);
	});
});

describe('ordering, pagination and highlighting', () => {
	it('orders newest first and pages with a stable cursor', () => {
		for (let i = 1; i <= 7; i++)
			add(`n${i}`, { title: `Needle ${i}`, publishedAt: day(i % 3 === 0 ? 5 : i) });
		add('tie', { title: 'Needle tie', publishedAt: day(5) });
		add('undated', { title: 'Needle undated', publishedAt: null, fetchedAt: day(20) });
		const all = search('needle', 'owner', { limit: 100 }).articles.map((a) => a.id);
		expect(all[0]).toBe('undated');
		const seen: string[] = [];
		let after;
		for (;;) {
			const page = search('needle', 'owner', { limit: 3, after });
			seen.push(...page.articles.map((a) => a.id));
			if (!page.hasMore) break;
			const last = page.articles.at(-1)!;
			after = { sortAt: last.sortAt.getTime(), id: last.id };
		}
		expect(seen).toEqual(all);
		expect(new Set(seen).size).toBe(9);
	});

	it('returns plain-text highlight segments, never markup', () => {
		add('a', {
			title: 'Rust <b>news</b>',
			content: `<p>${'filler '.repeat(60)}the borrow checker is great ${'more '.repeat(60)}</p>`
		});
		const [article] = search('borrow rust').articles;
		expect(article.titleParts?.filter((p) => p.match).map((p) => p.text)).toEqual(['Rust']);
		expect(article.titleParts?.map((p) => p.text).join('')).toBe('Rust <b>news</b>');
		expect(article.snippetParts?.filter((p) => p.match).map((p) => p.text.toLowerCase())).toEqual([
			'borrow'
		]);
		expect(JSON.stringify(article)).not.toMatch(/\\u0001|\\u0002/);
	});

	it('cannot be spoofed by marker characters in article text', () => {
		add('spoof', {
			title: 'spoofx \u0001ALLBOLD',
			content: '<p>spoofx before \u0001 hl text \u0002 after &#1;x</p>'
		});
		const [article] = search('spoofx').articles;
		const matched = (parts?: { text: string; match: boolean }[]) =>
			parts?.filter((part) => part.match).map((part) => part.text.toLowerCase());
		expect(matched(article.titleParts)).toEqual(['spoofx']);
		expect(matched(article.snippetParts)).toEqual(['spoofx']);
		expect(article.titleParts?.map((part) => part.text).join('')).toBe('spoofx ALLBOLD');
		expect(htmlToSearchText('a\u0001b\u0002c\u0000d\te')).toBe('abcd e');
	});

	it('builds search reader data with a query-carrying list path', () => {
		add('a', { title: 'Zebra crossing' });
		const data = getReaderData(connection.db, 'owner', { view: 'search', query: '  zebra  ' });
		expect(data).toMatchObject({
			view: 'search',
			query: 'zebra',
			listPath: '/search?q=zebra',
			hasMore: false
		});
		expect(data.articles).toHaveLength(1);
		expect(getReaderData(connection.db, 'owner', { view: 'search' }).articles).toEqual([]);
	});
});
