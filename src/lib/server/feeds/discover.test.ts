import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverFeed } from './discover';
import { safeFetch } from './fetch';

vi.mock('./fetch', () => ({ safeFetch: vi.fn() }));
const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const response = (name: string, url: string) => ({
	url,
	status: 200,
	headers: new Headers(),
	body: fixture(name)
});
beforeEach(() => vi.resetAllMocks());

describe('direct feeds and website discovery', () => {
	it.each([
		['rss.xml', 'RSS fixture'],
		['atom.xml', 'Atom fixture'],
		['feed.json', 'JSON fixture']
	])('accepts direct %s and retains the final redirected URL', async (name, title) => {
		vi.mocked(safeFetch).mockResolvedValue(response(name, `https://example.com/${name}`));
		const result = await discoverFeed('https://example.com/old-feed');
		expect(result.url).toBe(`https://example.com/${name}`);
		expect(result.feed.title).toBe(title);
		expect(result.feed.items.length).toBeGreaterThan(0);
		expect(safeFetch).toHaveBeenCalledTimes(1);
	});

	it('discovers an alternate and tries the next supported link when the first fails', async () => {
		vi.mocked(safeFetch)
			.mockResolvedValueOnce(response('site.html', 'https://example.com/'))
			.mockRejectedValueOnce(new Error('Unavailable RSS'))
			.mockResolvedValueOnce(response('atom.xml', 'https://example.com/atom.xml'));
		const result = await discoverFeed('https://example.com/');
		expect(result.feed.title).toBe('Atom fixture');
		expect(vi.mocked(safeFetch).mock.calls.map(([url]) => url)).toEqual([
			'https://example.com/',
			'https://example.com/blog/feed.xml?one=1&two=2',
			'https://example.com/atom.xml'
		]);
	});

	it('bounds alternate requests on malicious HTML and reports missing feeds', async () => {
		vi.mocked(safeFetch)
			.mockResolvedValueOnce({
				url: 'https://example.com/',
				status: 200,
				headers: new Headers(),
				body: Array.from(
					{ length: 50 },
					(_, i) => `<link rel="alternate" type="application/rss+xml" href="/${i}">`
				).join('')
			})
			.mockRejectedValue(new Error('Unavailable'));
		await expect(discoverFeed('https://example.com/')).rejects.toThrow('No supported feed');
		expect(safeFetch).toHaveBeenCalledTimes(6);
		expect(vi.mocked(safeFetch).mock.calls.map(([url]) => url)).toEqual([
			'https://example.com/',
			...Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`)
		]);
	});
});
