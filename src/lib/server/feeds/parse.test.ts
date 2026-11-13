import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFeed, sanitizeContent } from './parse';
import { discoverFeedUrls } from './discover';

const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const base = 'https://example.com/feed';

describe('feed parsing and sanitization', () => {
	it('normalizes RSS 2, sanitizes rich HTML and uses link/hash fallback IDs', async () => {
		const feed = await parseFeed(fixture('rss.xml'), base);
		expect(feed.title).toBe('RSS fixture');
		expect(feed.siteUrl).toBe('https://example.com/');
		expect(feed.items[0]).toMatchObject({
			guid: 'rss-1',
			author: 'Ada',
			title: 'First story',
			publishedAt: new Date('2026-11-13T09:00:00Z')
		});
		expect(feed.items[0].content).toContain('<strong>reader</strong>');
		expect(feed.items[0].content).not.toMatch(/script|onerror|javascript:/);
		expect(feed.items[1].guid).toBe('https://example.com/two');
		expect(feed.items[2].guid).toMatch(/^[a-f0-9]{64}$/);
		expect((await parseFeed(fixture('rss.xml'), base)).items[2].guid).toBe(feed.items[2].guid);
	});
	it('normalizes Atom IDs, alternate links, authors, HTML and dates', async () => {
		const feed = await parseFeed(fixture('atom.xml'), base);
		expect(feed.title).toBe('Atom fixture');
		expect(feed.items[0]).toMatchObject({
			guid: 'atom-1',
			link: 'https://example.com/atom-story',
			author: 'Grace',
			content: '<p>Atom content</p>',
			publishedAt: new Date('2026-11-12T12:00:00Z')
		});
	});
	it('normalizes JSON Feed and safely escapes plain text', async () => {
		const feed = await parseFeed(fixture('feed.json'), base);
		expect(feed.items[0]).toMatchObject({
			guid: 'json-1',
			author: 'Lin',
			link: 'https://example.com/json-story',
			content: '<p>JSON content</p>'
		});
		expect(feed.items[1].content).toBe('<p>Use &lt;script&gt; &amp; enjoy</p>');
		expect(feed.items[1].publishedAt).toBeNull();
	});
	it('rejects malformed feeds and arbitrary JSON/HTML', async () => {
		for (const body of ['<rss><broken>', '{}', '{"items":[]}', fixture('site.html')]) {
			await expect(parseFeed(body, base)).rejects.toThrow('Unable to parse');
		}
	});
	it('resolves relative links, images and protocol-relative URLs and hardens links', () => {
		const html = sanitizeContent(
			'<a href="../other" rel="opener">Read</a><img src="./image.png"><img src="//cdn.example.com/photo.jpg">',
			'https://example.com/posts/story'
		);
		expect(html).toContain(
			'<a href="https://example.com/other" rel="noopener noreferrer nofollow">Read</a>'
		);
		expect(html).toContain('src="https://example.com/posts/image.png"');
		expect(html).toContain('src="https://cdn.example.com/photo.jpg"');
	});
	it('drops unresolvable URL attributes and non-HTTP(S) schemes', () => {
		const html = sanitizeContent(
			'<a href="http://[">Broken</a><img src="../no-base"><a href="mailto:reader@example.com">Email</a><img src="data:image/png;base64,AA"><a href="javascript:alert(1)">Bad</a>'
		);
		expect(html).not.toMatch(/href=|src=/);
		expect(html).toContain('rel="noopener noreferrer nofollow"');
	});
	it.each([
		[
			'https://articles.example/posts/story',
			'https://site.example/blog/',
			'https://articles.example/posts/asset'
		],
		[undefined, 'https://site.example/blog/', 'https://site.example/blog/asset'],
		[undefined, undefined, 'https://feeds.example/directory/asset']
	])(
		'uses item/site/feed URL fallback for content and summary (%s, %s)',
		async (link, site, expected) => {
			const feed = await parseFeed(
				JSON.stringify({
					version: 'https://jsonfeed.org/version/1.1',
					title: 'Bases',
					home_page_url: site,
					items: [
						{
							id: '1',
							url: link,
							content_html: '<img src="asset">',
							summary: '<a href="asset">Asset</a>'
						}
					]
				}),
				'https://feeds.example/directory/feed.json'
			);
			expect(feed.items[0].content).toContain(`src="${expected}"`);
			expect(feed.items[0].summary).toContain(`href="${expected}"`);
		}
	);
	it('uses site URL fallback for RSS content', async () => {
		const feed = await parseFeed(
			'<rss version="2.0"><channel><title>RSS</title><link>https://site.example/blog/</link><description>Test</description><item><guid>1</guid><description><![CDATA[<img src="asset.png">]]></description></item></channel></rss>',
			base
		);
		expect(feed.items[0].content).toContain('src="https://site.example/blog/asset.png"');
	});
});

describe('real-world title entities', () => {
	it('stores titles as plain text: an RSS "&amp;" is "&", not a literal "&amp;"', async () => {
		const feed = await parseFeed(
			fixture('real-phoronix-entities.xml'),
			'https://www.phoronix.com/rss.php'
		);
		expect(feed.items[0].title).toBe(
			'Intel Posts Initial GCC Compiler Code For Razor Lake & Coral Rapids'
		);
		expect(feed.items[0].author).toBe('Michael Larabel');
	});
	it('decodes HTML-typed Atom titles once and keeps content escaped', async () => {
		const feed = await parseFeed(
			fixture('real-kottke-html-title.xml'),
			'https://feeds.kottke.org/main'
		);
		expect(feed.items[0].title).toBe('Grocery Shopping With a Bow & Arrow');
		expect(feed.items[0].content).toContain('Tom &amp; Jerry');
		expect(feed.items[0].content).toContain(
			'src="https://kottke.org/cdn-cgi/image/format=auto,width=1200/images/posts/01/x.jpg"'
		);
	});
	it('keeps inline markup in titles from adding spaces and decodes exactly once', async () => {
		const rss = (title: string) =>
			`<rss version="2.0"><channel><title>T</title><item><title>${title}</title><guid>1</guid></item></channel></rss>`;
		const t = async (title: string) =>
			(await parseFeed(rss(title), 'https://x.test/f')).items[0].title;
		expect(await t('CO&lt;sub&gt;2&lt;/sub&gt; &amp;amp; H2O')).toBe('CO2 & H2O');
		expect(await t('Using &amp;lt;div&amp;gt; &amp;amp; more')).toBe('Using <div> & more');
		expect(await t('&lt;img src=x&gt;')).toBe('Untitled');
		const json = await parseFeed(
			JSON.stringify({
				version: 'https://jsonfeed.org/version/1.1',
				title: 'J',
				items: [{ id: '1', title: 'Tom &amp; <i>Jerry</i>x', content_text: 'a' }]
			}),
			'https://x.test/f.json'
		);
		expect(json.items[0].title).toBe('Tom & Jerryx');
	});
	it('does not let markup through titles', async () => {
		const feed = await parseFeed(
			`<rss version="2.0"><channel><title>T &amp; U</title><item><title>&lt;b&gt;Hi&lt;/b&gt; &amp;lt;3 &lt;script&gt;alert(1)&lt;/script&gt;</title><guid>1</guid></item></channel></rss>`,
			'https://x.test/feed'
		);
		expect(feed.title).toBe('T & U');
		expect(feed.items[0].title).not.toMatch(/<(b|script)/);
	});
});

describe('HTML feed discovery', () => {
	it('discovers alternate RSS, Atom, JSON with relative URLs, base and entities', () => {
		expect(discoverFeedUrls(fixture('site.html'), 'https://example.com/')).toEqual([
			'https://example.com/blog/feed.xml?one=1&two=2',
			'https://example.com/atom.xml',
			'https://example.com/feed.json'
		]);
	});
	it('deduplicates links, ignores comments and unsupported schemes/types', () => {
		expect(
			discoverFeedUrls(
				'<!-- <link rel="alternate" type="application/rss+xml" href="/bad"> --><link rel="alternate" type="text/css" href="/style"><link rel="alternate" type="application/rss+xml" href="/rss"><link rel="alternate" type="application/rss+xml" href="/rss">',
				base
			)
		).toEqual(['https://example.com/rss']);
	});
});
