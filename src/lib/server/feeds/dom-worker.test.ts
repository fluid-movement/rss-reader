import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { connectDatabase } from '../db/connect';
import { migrateDatabase } from '../db/migrate';
import { feeds, items, user } from '../db/schema';
import {
	DomParseError,
	assertReasonableMarkup,
	MAX_PARSED_CHARS,
	MAX_WORKERS,
	parseArticleInWorker,
	workerStats
} from './dom-worker';
import { ExtractError, extractArticleHtml, extractNewItems } from './extract';
import { safeFetch } from './fetch';

vi.mock('./fetch', async (importOriginal) => ({
	...(await importOriginal<typeof import('./fetch')>()),
	safeFetch: vi.fn()
}));
const article = readFileSync(new URL('./fixtures/article.html', import.meta.url), 'utf8');
const page = (body: string) => ({
	url: 'https://news.example/a',
	status: 200,
	headers: new Headers({ 'content-type': 'text/html' }),
	body
});
const nested = (depth: number) =>
	`<html><body>${'<div>'.repeat(depth)}text${'</div>'.repeat(depth)}</body></html>`;

/** Measures the worst event-loop delay while `run` executes. */
async function withLagProbe(run: () => Promise<unknown>) {
	let worst = 0;
	let last = performance.now();
	const probe = setInterval(() => {
		const now = performance.now();
		worst = Math.max(worst, now - last - 10);
		last = now;
	}, 10);
	const started = performance.now();
	await run();
	clearInterval(probe);
	return { worst, elapsed: performance.now() - started };
}
const lingering = () =>
	(process as unknown as { getActiveResourcesInfo(): string[] })
		.getActiveResourcesInfo()
		.filter((name) => /worker/i.test(name));

describe('hostile markup (worker isolation)', () => {
	it('rejects 5000 nested divs quickly without blocking the event loop', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page(nested(5000)));
		const { worst, elapsed } = await withLagProbe(() =>
			expect(extractArticleHtml('https://news.example/a')).rejects.toThrow(ExtractError)
		);
		expect(elapsed).toBeLessThan(7000);
		expect(worst).toBeLessThan(200);
	});
	it('rejects excessive tag counts', async () => {
		vi.mocked(safeFetch).mockResolvedValue(
			page(`<html><body>${'<span>x</span>'.repeat(30_000)}</body></html>`)
		);
		await expect(extractArticleHtml('https://news.example/a')).rejects.toThrow('too complex');
	});
	it.each(['thead', 'tbody'])('rejects repeated %s before allocating a worker', async (tag) => {
		const started = performance.now();
		await expect(
			parseArticleInWorker(`<html><body>${`<${tag}>x`.repeat(25_000)}</body></html>`)
		).rejects.toThrow('too complex');
		expect(performance.now() - started).toBeLessThan(500);
		expect(workerStats.active).toBe(0);
	});
	it.each([
		['unterminated open tags', '<div '.repeat(49_990) + 'x'.repeat(1_800_000) + '/>'],
		['unclosed tag-like fragments', '<b</b'.repeat(24_990) + 'x'.repeat(2_000_000)]
	])('pre-scans %s in linear time and still accepts them', (_name, markup) => {
		const started = performance.now();
		expect(() => assertReasonableMarkup(markup)).not.toThrow();
		expect(performance.now() - started).toBeLessThan(100);
	});
	it('logs a known worker memory limit as one warning without a stack', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		// Cheap to pre-scan, but entity expansion exhausts the worker's heap limit.
		const flood = `<html><body><p>${'&amp;'.repeat(1_400_000)}</p></body></html>`;
		await expect(parseArticleInWorker(flood, undefined, 20_000)).rejects.toThrow(DomParseError);
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0][0])).toContain('ERR_WORKER_OUT_OF_MEMORY');
		expect(String(warn.mock.calls[0][0])).not.toContain('\n    at ');
		expect(error).not.toHaveBeenCalled();
		warn.mockRestore();
		error.mockRestore();
	});
	it('caps entity-expanded output before main-thread sanitization', async () => {
		const body = `<html><body><article><p>${'&'.repeat(1024 * 1024)}</p></article></body></html>`;
		const parsed = await parseArticleInWorker(body);
		expect(parsed?.content.length).toBeLessThanOrEqual(MAX_PARSED_CHARS);
		expect(parsed?.text.length).toBeLessThanOrEqual(MAX_PARSED_CHARS);
		vi.mocked(safeFetch).mockResolvedValue(page(body));
		const { worst } = await withLagProbe(async () => {
			expect((await extractArticleHtml('https://news.example/a')).length).toBeLessThanOrEqual(
				MAX_PARSED_CHARS
			);
			// Let the probe observe the final synchronous sanitization, too.
			await new Promise((resolve) => setTimeout(resolve, 15));
		});
		expect(worst).toBeLessThan(200);
	});
	it('terminates a worker that exceeds its deadline without blocking or leaking', async () => {
		const { worst } = await withLagProbe(() =>
			expect(parseArticleInWorker(article, undefined, 1)).rejects.toThrow(DomParseError)
		);
		expect(worst).toBeLessThan(200);
		expect(workerStats.active).toBe(0);
		expect(lingering()).toHaveLength(0);
	});
	it('still extracts a normal article through the worker', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page(article));
		expect(await extractArticleHtml('https://news.example/a')).toContain('first paragraph');
		expect(workerStats.active).toBe(0);
		expect(lingering()).toHaveLength(0);
	});
	it('never runs more than the worker cap at once', async () => {
		vi.mocked(safeFetch).mockResolvedValue(page(article));
		const results = await Promise.all(
			Array.from({ length: 8 }, () => extractArticleHtml('https://news.example/a'))
		);
		expect(results.every((result) => result.includes('first paragraph'))).toBe(true);
		expect(workerStats.peak).toBe(MAX_WORKERS);
		expect(workerStats.active).toBe(0);
	});
	it('cancels pending extraction promptly when aborted', async () => {
		const connection = connectDatabase(':memory:');
		migrateDatabase(connection.db);
		connection.db.insert(user).values({ id: 'u', email: 'u@example.com', name: 'U' }).run();
		connection.db
			.insert(feeds)
			.values({ id: 'f', userId: 'u', title: 'F', url: 'https://f.example/rss' })
			.run();
		connection.db
			.insert(items)
			.values({ id: 'slow', feedId: 'f', guid: 's', title: 's', link: 'https://news.example/s' })
			.run();
		vi.mocked(safeFetch).mockImplementation(() => new Promise(() => {}));
		const controller = new AbortController();
		const job = extractNewItems(connection.db, ['slow'], { signal: controller.signal });
		controller.abort();
		const { elapsed } = await withLagProbe(() => job);
		expect(elapsed).toBeLessThan(500);
		expect(connection.db.select().from(items).all()[0].fullContent).toBeNull();
		connection.client.close();
	});
});
