import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDatabase } from './db/connect';
import { migrateDatabase } from './db/migrate';
import { feeds as feedTable, items, user } from './db/schema';
import { createFeedService } from './feeds/subscribe';
import { safeFetch } from './feeds/fetch';
import { createOpmlService, MAX_OPML_BYTES, OpmlError, parseOpml } from './opml';

vi.mock('./feeds/fetch', () => ({ safeFetch: vi.fn() }));
const opml = (body: string) => `<opml version="2.0"><body>${body}</body></opml>`;

describe('OPML parsing', () => {
	it.each(['<outline/>', '<outline></outline>', '<outline>Only text</outline>'])(
		'counts non-object outlines as invalid without aborting: %s',
		(outline) => {
			const result = parseOpml(opml(outline + '<outline xmlUrl="https://example.com/rss"/>'));
			expect(result.invalid).toBe(1);
			expect(result.feeds).toHaveLength(1);
		}
	);
	it('skips nested empty and text-only outlines while processing their siblings', () => {
		const result = parseOpml(
			opml(
				'<outline text="News"><outline/><outline></outline><outline>Text</outline><outline><outline/></outline><outline xmlUrl="https://example.com/rss"/></outline>'
			)
		);
		expect(result.invalid).toBe(4);
		expect(result.feeds).toEqual([
			{ title: 'https://example.com/rss', url: 'https://example.com/rss', folder: 'News' }
		]);
	});
	it('detects canonical URL duplicates but preserves trailing slashes and query differences', () => {
		const result = parseOpml(
			opml(
				[
					'http://d.com/x',
					'HTTP://D.com:80/x#frag',
					'http://d.com/x/',
					'http://d.com/x?a=1',
					'http://d.com/x?a=2'
				]
					.map((url) => `<outline xmlUrl="${url}"/>`)
					.join('')
			)
		);
		expect(result.skippedDuplicates).toBe(1);
		expect(result.feeds.map((feed) => feed.url)).toEqual([
			'http://d.com/x',
			'http://d.com/x/',
			'http://d.com/x?a=1',
			'http://d.com/x?a=2'
		]);
	});
	it('parses flat feeds and flattens deeper folders into the top-level folder', () => {
		const result = parseOpml(
			opml(`
			<outline xmlUrl="https://example.com/flat" title="Flat"/>
			<outline text="News"><outline text="Deep">
				<outline text="Nested" xmlUrl="https://example.com/nested"/>
			</outline></outline>`)
		);
		expect(result.folders).toEqual(['News']);
		expect(result.feeds).toEqual(
			expect.arrayContaining([
				{ title: 'Flat', url: 'https://example.com/flat', folder: undefined },
				{ title: 'Nested', url: 'https://example.com/nested', folder: 'News' }
			])
		);
		expect(result.invalid).toBe(0);
	});
	it('visits children of outlines which themselves contain feed URLs', () => {
		expect(
			parseOpml(
				opml(`<outline text="News"><outline xmlUrl="https://example.com/1">
			<outline xmlUrl="https://example.com/2"/></outline></outline>`)
			).feeds
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ url: 'https://example.com/1', folder: 'News' }),
				expect.objectContaining({ url: 'https://example.com/2', folder: 'News' })
			])
		);
	});
	it('counts invalid URLs without accepting non-http(s) schemes', () => {
		const urls = [
			'javascript:alert(1)',
			'file:///etc/passwd',
			'ftp://example.com/a',
			'/relative',
			'',
			'x'.repeat(4097)
		];
		const result = parseOpml(
			opml(
				urls.map((url) => `<outline xmlUrl="${url}"/>`).join('') +
					'<outline xmlUrl="http://example.com/rss"/>'
			)
		);
		expect(result.invalid).toBe(urls.length);
		expect(result.feeds).toHaveLength(1);
	});
	it.each([
		'',
		'<rss><channel/></rss>',
		'<opml/>',
		'<opml><body></opml>',
		'<opml><body><outline xmlUrl="https://example.com"></body></opml>',
		opml('<outline xmlUrl=https://example.com/>')
	])('rejects malformed or non-OPML documents: %s', (xml) => {
		expect(() => parseOpml(xml)).toThrow(OpmlError);
	});
	it('accepts empty OPML and preserves empty folders', () => {
		expect(parseOpml(opml('')).feeds).toEqual([]);
		expect(parseOpml(opml('<outline text="Empty"/>')).folders).toEqual(['Empty']);
	});
	it('rejects huge files, measured in UTF-8 bytes, and extreme nesting', () => {
		expect(() => parseOpml(opml('x'.repeat(MAX_OPML_BYTES)))).toThrow('2 MB');
		expect(() => parseOpml(opml('é'.repeat(MAX_OPML_BYTES / 2)))).toThrow('2 MB');
		expect(() =>
			parseOpml(opml('<outline text="x">'.repeat(102) + '</outline>'.repeat(102)))
		).toThrow(OpmlError);
	});
	it.each([
		'<!DOCTYPE opml SYSTEM "https://attacker.example/evil.dtd">',
		'<!DOCTYPE opml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
		'<!DOCTYPE opml [<!ENTITY a "123"><!ENTITY b "&a;&a;&a;">]>',
		'<!ENTITY xxe SYSTEM "file:///etc/passwd">'
	])('rejects DTDs and external/expanding entity declarations before parsing', (declaration) => {
		expect(() => parseOpml(declaration + opml('<outline text="&xxe;"/>'))).toThrow(
			'entity declarations'
		);
	});
});

describe('OPML persistence and export', () => {
	let connection: ReturnType<typeof connectDatabase>;
	let service: ReturnType<typeof createOpmlService>;
	let feeds: ReturnType<typeof createFeedService>;
	beforeEach(() => {
		vi.clearAllMocks();
		connection = connectDatabase(':memory:');
		migrateDatabase(connection.db);
		connection.db
			.insert(user)
			.values([
				{ id: 'owner', name: 'Owner', email: 'owner@example.com' },
				{ id: 'other', name: 'Other', email: 'other@example.com' }
			])
			.run();
		service = createOpmlService(connection.db);
		feeds = createFeedService(connection.db);
	});
	afterEach(() => connection.client.close());
	it('reuses folder names case-insensitively without renaming the existing folder', () => {
		const folder = feeds.createFolder('owner', 'News');
		const result = service.import(
			'owner',
			opml(
				'<outline text="news"><outline xmlUrl="https://example.com/1"/></outline><outline text="NEWS"><outline xmlUrl="https://example.com/2"/></outline>'
			)
		);
		expect(result.foldersCreated).toBe(0);
		expect(feeds.list('owner').folders).toEqual([folder]);
		expect(feeds.list('owner').feeds.every((feed) => feed.folderId === folder.id)).toBe(true);
	});
	it('normalizes queued URLs and compares legacy URLs without rewriting them', () => {
		const legacyUrl = 'HTTP://D.com:80/legacy#old';
		connection.db
			.insert(feedTable)
			.values({ userId: 'owner', title: 'Legacy', url: legacyUrl })
			.run();
		expect(feeds.queueFeed('owner', 'HTTP://D.com:80/x#frag', 'First')).toBe(1);
		expect(feeds.queueFeed('owner', 'http://d.com/x', 'Duplicate')).toBe(0);
		const xml = opml(
			['http://d.com/x#other', 'http://d.com/x/', 'http://d.com/legacy', 'HTTP://D.COM:80/x/']
				.map((url) => `<outline xmlUrl="${url}"/>`)
				.join('')
		);
		expect(service.import('owner', xml)).toEqual({
			added: 1,
			skippedDuplicates: 3,
			invalid: 0,
			foldersCreated: 0
		});
		expect(service.import('owner', xml)).toEqual({
			added: 0,
			skippedDuplicates: 4,
			invalid: 0,
			foldersCreated: 0
		});
		expect(feeds.list('owner').feeds.map((feed) => feed.url)).toEqual(
			expect.arrayContaining([legacyUrl, 'http://d.com/x', 'http://d.com/x/'])
		);
	});
	it('strips forbidden C0 controls on import and export while preserving XML whitespace', () => {
		const controls = Array.from({ length: 32 }, (_, code) => code)
			.filter((code) => ![9, 10, 13].includes(code))
			.map((code) => String.fromCharCode(code))
			.join('');
		const title = `A${controls}B\tC\nD\rE`;
		const xml = opml(
			`<outline text="N${controls}ews"><outline text="${title.replace('\r', '&#13;')}" xmlUrl="https://example.com/f${controls}eed"/></outline>`
		);
		expect(service.import('owner', xml).added).toBe(1);
		const imported = feeds.list('owner');
		expect(imported.folders[0].name).toBe('News');
		expect(imported.feeds[0]).toMatchObject({
			title: 'AB\tC\nD\rE',
			url: 'https://example.com/feed'
		});
		// Also handle legacy database values that did not pass through OPML import.
		connection.db
			.insert(feedTable)
			.values({ userId: 'owner', title, url: `https://example.com/legacy${controls}` })
			.run();
		const exported = service.export('owner');
		for (const control of controls) expect(exported).not.toContain(control);
		expect(service.import('other', exported).added).toBe(2);
		expect(feeds.list('other').feeds.every((feed) => feed.title === 'AB\tC\nD\rE')).toBe(true);
	});
	it('reuses folders, skips duplicates idempotently and queues without fetching', () => {
		const folder = feeds.createFolder('owner', 'News');
		const xml = opml(`<outline text="News"><outline text="One" xmlUrl="https://example.com/1"/>
			<outline text="Duplicate" xmlUrl="https://example.com/1"/>
			<outline xmlUrl="javascript:bad"/></outline><outline text="Empty"/>`);
		const before = Date.now();
		expect(service.import('owner', xml)).toEqual({
			added: 1,
			skippedDuplicates: 1,
			invalid: 1,
			foldersCreated: 1
		});
		expect(service.import('owner', xml)).toEqual({
			added: 0,
			skippedDuplicates: 2,
			invalid: 1,
			foldersCreated: 0
		});
		const feed = feeds.list('owner').feeds[0];
		expect(feed.title).toBe('One');
		expect(feed.folderId).toBe(folder.id);
		expect(feed.lastFetchedAt).toBeNull();
		expect(feed.nextFetchAt!.getTime()).toBeGreaterThanOrEqual(before);
		expect(feed.nextFetchAt!.getTime()).toBeLessThanOrEqual(Date.now());
		expect(connection.db.select().from(items).all()).toEqual([]);
		expect(safeFetch).not.toHaveBeenCalled();
	});
	it('queues 300 feeds without any network calls', () => {
		const xml = opml(
			Array.from({ length: 300 }, (_, i) => `<outline xmlUrl="https://example.com/${i}"/>`).join('')
		);
		expect(service.import('owner', xml).added).toBe(300);
		expect(safeFetch).not.toHaveBeenCalled();
	});
	it('round-trips foldered, ungrouped and empty folders with XML escaping', () => {
		const title = `A & B <News> "quoted" 'apostrophe'\nNew line`;
		const folder = feeds.createFolder('owner', title);
		feeds.createFolder('owner', 'Empty');
		feeds.queueFeed('owner', 'https://example.com/rss?a=1&b=2', title, folder.id);
		feeds.queueFeed('owner', 'https://example.com/plain', 'Unfiled');
		const xml = service.export('owner');
		expect(xml).toContain('&amp;');
		expect(xml).toContain('&lt;News&gt;');
		expect(xml).toContain('&quot;quoted&quot;');
		expect(xml).toContain('&apos;apostrophe&apos;');
		expect(service.import('other', xml)).toEqual({
			added: 2,
			skippedDuplicates: 0,
			invalid: 0,
			foldersCreated: 2
		});
		const imported = feeds.list('other');
		expect(imported.folders.map((f) => f.name)).toEqual(expect.arrayContaining([title, 'Empty']));
		expect(imported.feeds.find((f) => f.title === title)?.url).toBe(
			'https://example.com/rss?a=1&b=2'
		);
		expect(imported.feeds.find((f) => f.title === 'Unfiled')?.folderId).toBeNull();
		expect(parseOpml(service.export('other'))).toEqual(parseOpml(xml));
	});
	it('scopes duplicates, folder reuse and exports to the current user', () => {
		const privateFolder = feeds.createFolder('owner', 'Private');
		feeds.queueFeed('owner', 'https://example.com/shared', 'Secret title', privateFolder.id);
		feeds.createFolder('owner', 'Secret folder');
		const xml = opml(
			'<outline text="Private"><outline text="Public" xmlUrl="https://example.com/shared"/></outline>'
		);
		expect(service.import('other', xml)).toEqual({
			added: 1,
			skippedDuplicates: 0,
			invalid: 0,
			foldersCreated: 1
		});
		expect(feeds.list('other').feeds[0].folderId).not.toBe(privateFolder.id);
		expect(service.export('other')).not.toContain('Secret');
		expect(service.export('owner')).not.toContain('Public');
	});
	it('does not mutate anything for invalid XML', () => {
		expect(() => service.import('owner', '<broken>')).toThrow();
		expect(feeds.list('owner')).toEqual({ feeds: [], folders: [] });
	});
});
