import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { connectDatabase } from '../db/connect';
import { migrateDatabase } from '../db/migrate';
import { feeds, items, user } from '../db/schema';
import {
	claimExtractionSlot,
	ExtractError,
	extractArticleHtml,
	extractItem,
	extractNewItems,
	MAX_ARTICLE_BYTES,
	resetExtractionCooldowns
} from './extract';
import { FeedFetchError, safeFetch } from './fetch';
import { getArticlePage } from '../reader';

vi.mock('./fetch', async (importOriginal) => ({
	...(await importOriginal<typeof import('./fetch')>()),
	safeFetch: vi.fn()
}));
const html = readFileSync(new URL('./fixtures/article.html', import.meta.url), 'utf8');
const page = (
	body = html,
	type = 'text/html; charset=utf-8',
	url = 'https://news.example/a/b'
) => ({
	url,
	status: 200,
	headers: new Headers({ 'content-type': type }),
	body
});
let connection: ReturnType<typeof connectDatabase>;

beforeEach(() => {
	vi.resetAllMocks();
	resetExtractionCooldowns();
	connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	connection.db.insert(user).values({ id: 'u', email: 'u@example.com', name: 'U' }).run();
	connection.db
		.insert(feeds)
		.values({ id: 'f', userId: 'u', title: 'F', url: 'https://f.example/rss' })
		.run();
	vi.mocked(safeFetch).mockResolvedValue(page());
});
afterEach(() => connection.client.close());

describe('extractArticleHtml', () => {
	it('extracts the article with Readability and sanitizes it', async () => {
		const result = await extractArticleHtml('https://news.example/a/b');
		expect(safeFetch).toHaveBeenCalledWith(
			'https://news.example/a/b',
			expect.objectContaining({ maxBytes: MAX_ARTICLE_BYTES })
		);
		expect(result).toContain('first paragraph of a long article');
		expect(result).not.toContain('Copyright');
		expect(result).not.toContain('Home');
	});
	it('resolves relative links and images against the article URL', async () => {
		const result = await extractArticleHtml('https://news.example/a/b');
		expect(result).toContain('href="https://news.example/relative/link"');
		expect(result).toContain('src="https://news.example/img/photo.png"');
	});
	it('strips hostile markup', async () => {
		const result = await extractArticleHtml('https://news.example/a/b');
		expect(result).not.toMatch(/<script|<iframe|onclick|javascript:|alert/i);
	});
	it('cleans a real BBC video caption and repairs its adjacent byline spans', async () => {
		const bbc = readFileSync(new URL('./fixtures/real-bbc-article.html', import.meta.url), 'utf8');
		vi.mocked(safeFetch).mockResolvedValue(page(bbc));
		const result = await extractArticleHtml('https://news.example/a');
		const { document } = parseHTML(result);
		// Readability may omit the byline entirely (the reader has author metadata).
		const text = document.documentElement.textContent.replace(/\s+/g, ' ');
		if (text.includes('Henry Moore')) expect(text).toContain('By Henry Moore and Laura Cress');
		expect(text).not.toContain('ByHenry');
		expect(result).toContain('A major global Microsoft outage');
		expect(result).not.toMatch(/Figure caption|Watch:|This video can not be played/);
	});
	it('keeps real Wired prose, photo and credit while dropping empty figures', async () => {
		const wired = readFileSync(
			new URL('./fixtures/real-wired-article.html', import.meta.url),
			'utf8'
		);
		// Also cover figures left empty by missing/unsupported publisher media.
		const body = wired.replace(
			'<div></div>',
			'<figure><span> </span></figure><figure><img></figure><figure><iframe src="https://www.youtube.com/embed/example"></iframe></figure>'
		);
		vi.mocked(safeFetch).mockResolvedValue(page(body));
		const result = await extractArticleHtml('https://news.example/a');
		const { document } = parseHTML(result);
		expect(result).toContain('Unlike a bulky');
		expect(result).toContain('Courtesy of Urevo');
		expect(document.querySelector('img')?.getAttribute('src')).toContain(
			'https://media.wired.com/'
		);
		expect(document.querySelectorAll('figure').length).toBeGreaterThan(0);
		for (const figure of document.querySelectorAll('figure')) {
			expect(!!figure.textContent.trim() || !!figure.querySelector('img[src]')).toBe(true);
		}
	});
	it('preserves meaningful image captions and text-only figures', async () => {
		const figures =
			'<figure><img src="/diagram.png"><figcaption><span class="visually-hidden">Figure caption, </span>A useful explanation.</figcaption></figure>' +
			'<figure><figcaption>A diagram described entirely in words.</figcaption></figure>';
		vi.mocked(safeFetch).mockResolvedValue(page(html.replace('<img', `${figures}<img`)));
		const result = await extractArticleHtml('https://news.example/a');
		expect(result).toContain('A useful explanation.');
		expect(result).toContain('A diagram described entirely in words.');
		expect(result).toContain('src="https://news.example/diagram.png"');
		expect(result).not.toContain('Figure caption,');
	});
	it('keeps a meaningful caption of an image-less video figure but drops the media', async () => {
		const caption = 'Meaningful caption about the video content that readers should keep';
		const figures =
			`<figure><video src="x.mp4"></video><figcaption>${caption}</figcaption></figure>` +
			'<figure><video src="y.mp4"></video><figcaption>Short clip</figcaption></figure>' +
			'<figure><iframe src="https://www.youtube.com/embed/e"></iframe></figure>';
		vi.mocked(safeFetch).mockResolvedValue(page(html.replace('<img', `${figures}<img`)));
		const result = await extractArticleHtml('https://news.example/a');
		expect(result).toContain(caption);
		expect(result).not.toMatch(/<video|<iframe|Short clip/);
	});
	it('repairs the reported multi-author byline without changing prose word fragments', async () => {
		const byline =
			'<div data-testid="multi-byline"><span>By</span><span>Helen Davidson</span><span>Jessica Lamb</span><span> and Helen Sullivan</span></div>';
		const body = html.replace(
			'<img',
			`${byline}<p>exam<span>ple</span>, <em>emphasis</em>!</p><img`
		);
		vi.mocked(safeFetch).mockResolvedValue(page(body));
		const result = await extractArticleHtml('https://news.example/a');
		const { document } = parseHTML(result);
		expect(document.documentElement.textContent).toContain(
			'By Helen Davidson Jessica Lamb and Helen Sullivan'
		);
		expect(document.documentElement.textContent).toContain('example, emphasis!');
	});
	it('rejects non-HTML content types', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page('{}', 'application/json'));
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow(ExtractError);
	});
	it('accepts real-world pages above 1 MiB (Wired article pages are 1.1-1.6 MB)', async () => {
		const padded = html.replace('</body>', `<!-- ${'x'.repeat(1_700_000)} --></body>`);
		expect(Buffer.byteLength(padded)).toBeGreaterThan(1024 * 1024);
		expect(Buffer.byteLength(padded)).toBeLessThan(MAX_ARTICLE_BYTES);
		vi.mocked(safeFetch).mockResolvedValue(page(padded));
		await expect(extractArticleHtml('https://news.example/a/b')).resolves.toContain(
			'first paragraph of a long article'
		);
	});
	it('refuses pages above the 2 MiB cap with the safe message', async () => {
		expect(MAX_ARTICLE_BYTES).toBe(2 * 1024 * 1024);
		vi.mocked(safeFetch).mockResolvedValue(
			page(html.replace('</body>', `<!-- ${'x'.repeat(MAX_ARTICLE_BYTES)} --></body>`))
		);
		await expect(extractArticleHtml('https://news.example/a/b')).rejects.toThrow(
			'The article page is too large.'
		);
	});
	it('rejects oversized bodies and size-limit failures', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page('a'.repeat(MAX_ARTICLE_BYTES + 1)));
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow('too large');
		vi.mocked(safeFetch).mockRejectedValue(new FeedFetchError('Response exceeds size limit.'));
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow(ExtractError);
	});
	it('surfaces SSRF and redirect refusals as safe errors', async () => {
		vi.mocked(safeFetch).mockRejectedValue(
			new FeedFetchError('Private or reserved network addresses are not allowed.')
		);
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow(
			'Private or reserved network addresses are not allowed.'
		);
	});
	it('does not leak unexpected errors', async () => {
		vi.mocked(safeFetch).mockRejectedValue(new Error('secret internals'));
		await expect(extractArticleHtml('https://news.example/a')).rejects.not.toBeInstanceOf(
			ExtractError
		);
	});
	it('fails when Readability finds nothing or the link is unusable', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page('<html><body></body></html>'));
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow(ExtractError);
		await expect(extractArticleHtml('javascript:alert(1)')).rejects.toThrow(ExtractError);
	});
});

describe('extractItem / extractNewItems', () => {
	function item(id: string, link: string | null = `https://news.example/${id}`) {
		connection.db
			.insert(items)
			.values({ id, feedId: 'f', guid: id, title: id, link, content: '<p>feed</p>' })
			.run();
	}
	const row = (id: string) => connection.db.select().from(items).where(eq(items.id, id)).get()!;

	it('stores sanitized content and leaves feed content alone', async () => {
		item('a');
		await extractItem(connection.db, 'a');
		expect(row('a').fullContent).toContain('first paragraph');
		expect(row('a').content).toBe('<p>feed</p>');
	});
	it('re-indexes search when extraction writes full_content', async () => {
		item('a');
		const find = (query: string) =>
			getArticlePage(connection.db, 'u', { view: 'search', query }).articles.map((a) => a.id);
		expect(find('paragraph')).toEqual([]);
		expect(find('feed')).toEqual(['a']);
		await extractItem(connection.db, 'a');
		expect(find('paragraph')).toEqual(['a']);
		// Feed content stays searchable, and extracted markup is not indexed as words.
		expect(find('feed')).toEqual(['a']);
		expect(find('href')).toEqual([]);
	});
	it('keeps the feed content on failure', async () => {
		item('a');
		vi.mocked(safeFetch).mockRejectedValue(new FeedFetchError('nope'));
		await expect(extractItem(connection.db, 'a')).rejects.toThrow(ExtractError);
		expect(row('a').fullContent).toBeNull();
	});
	it('requires a link', async () => {
		item('a', null);
		await expect(extractItem(connection.db, 'a')).rejects.toThrow(ExtractError);
	});
	it('caps the batch, limits concurrency and swallows failures', async () => {
		const ids = Array.from({ length: 15 }, (_, index) => `i${index}`);
		ids.forEach((id) => item(id));
		let active = 0;
		let peak = 0;
		vi.mocked(safeFetch).mockImplementation(async (url) => {
			active++;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			active--;
			if (String(url).endsWith('/i1')) throw new Error('boom');
			return page();
		});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		await extractNewItems(connection.db, ids, { cap: 10, concurrency: 2 });
		expect(safeFetch).toHaveBeenCalledTimes(10);
		expect(peak).toBeLessThanOrEqual(2);
		expect(row('i0').fullContent).not.toBeNull();
		expect(row('i1').fullContent).toBeNull();
		expect(row('i10').fullContent).toBeNull();
		expect(error).toHaveBeenCalledOnce();
	});
});

describe('cooldown', () => {
	it('blocks repeats per user and item until it expires', () => {
		expect(claimExtractionSlot('u', 'a', 1000)).toBe(true);
		expect(claimExtractionSlot('u', 'a', 2000)).toBe(false);
		expect(claimExtractionSlot('u', 'b', 2000)).toBe(true);
		expect(claimExtractionSlot('v', 'a', 2000)).toBe(true);
		expect(claimExtractionSlot('u', 'a', 31_001)).toBe(true);
	});
});
