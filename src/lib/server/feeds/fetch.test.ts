import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { lookup } from 'node:dns/promises';
import { request } from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPublicAddress, safeFetch } from './fetch';
import { parseFeed } from './parse';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));

type ResponseFixture = {
	status?: number;
	headers?: Record<string, string>;
	body?: string | Buffer;
	hang?: boolean;
};
let responses: ResponseFixture[];
beforeEach(() => {
	vi.resetAllMocks();
	responses = [];
	vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
	vi.mocked(request).mockImplementation(((
		_url: unknown,
		options: { signal: AbortSignal },
		callback: (response: Readable) => void
	) => {
		const req = Object.assign(new EventEmitter(), { end: () => {}, destroy: vi.fn() });
		req.end = () => {
			const next = responses.shift() ?? {};
			if (next.hang) {
				options.signal.addEventListener('abort', () => req.emit('error', new Error('aborted')), {
					once: true
				});
				return;
			}
			const response = Readable.from([Buffer.from(next.body ?? 'feed')]);
			Object.assign(response, { statusCode: next.status ?? 200, headers: next.headers ?? {} });
			callback(response);
		};
		return req;
	}) as unknown as typeof request);
});
afterEach(() => vi.useRealTimers());

describe('SSRF protection', () => {
	it.each([
		'127.0.0.1',
		'0.0.0.0',
		'10.1.2.3',
		'172.16.0.1',
		'192.168.1.1',
		'169.254.169.254',
		'100.64.0.1',
		'192.0.0.1',
		'192.0.2.1',
		'198.18.0.1',
		'198.51.100.1',
		'203.0.113.1',
		'224.0.0.1',
		'255.255.255.255',
		'::',
		'::1',
		'fc00::1',
		'fe80::1',
		'ff02::1',
		'::ffff:127.0.0.1',
		'2001:db8::1',
		'2002:7f00:1::'
	])('rejects non-public address %s', (address) => {
		expect(isPublicAddress(address)).toBe(false);
	});
	it.each([
		'http://127.1/',
		'http://2130706433/',
		'http://0x7f000001/',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'file:///etc/passwd',
		'http://user:password@example.com/',
		'not a URL'
	])('rejects unsafe URL %s before connection', async (url) => {
		await expect(safeFetch(url)).rejects.toThrow();
		expect(request).not.toHaveBeenCalled();
	});
	it('rejects DNS names resolving to any private answer, including mixed DNS', async () => {
		vi.mocked(lookup).mockResolvedValue([
			{ address: '93.184.216.34', family: 4 },
			{ address: '10.0.0.1', family: 4 }
		] as never);
		await expect(safeFetch('http://public.example/')).rejects.toThrow('Private');
		expect(request).not.toHaveBeenCalled();
	});
	it('propagates DNS failure without opening a connection', async () => {
		const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
		vi.mocked(lookup).mockRejectedValue(error);
		await expect(safeFetch('http://missing.example/')).rejects.toBe(error);
		expect(request).not.toHaveBeenCalled();
	});
	it('pins the validated address in the connection lookup, preventing rebinding', async () => {
		expect((await safeFetch('http://public.example/')).body).toBe('feed');
		const options = vi.mocked(request).mock.calls[0][1] as {
			lookup: (name: string, options: object, callback: (...args: unknown[]) => void) => void;
		};
		const callback = vi.fn();
		options.lookup('public.example', {}, callback);
		expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
		options.lookup('public.example', { all: true }, callback);
		expect(callback).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);
		expect(lookup).toHaveBeenCalledTimes(1);
	});
	it('revalidates DNS after a redirect and blocks a private destination', async () => {
		responses.push({ status: 302, headers: { location: 'http://internal.example/' } });
		vi.mocked(lookup)
			.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never)
			.mockResolvedValueOnce([{ address: '192.168.0.1', family: 4 }] as never);
		await expect(safeFetch('http://public.example/')).rejects.toThrow('Private');
		expect(request).toHaveBeenCalledTimes(1);
	});
	it('rejects literal private redirect targets and bounds redirect loops', async () => {
		responses.push({ status: 302, headers: { location: 'http://169.254.169.254/' } });
		await expect(safeFetch('http://public.example/')).rejects.toThrow('Private');
		responses.push(
			...Array.from({ length: 3 }, () => ({ status: 302, headers: { location: '/again' } }))
		);
		await expect(safeFetch('http://public.example/', { maxRedirects: 2 })).rejects.toThrow(
			'Too many redirects'
		);
	});
});

describe('bounded fetching', () => {
	it('follows safe relative redirects and returns final URL and response headers', async () => {
		responses.push(
			{ status: 301, headers: { location: '/feed' } },
			{ body: '<rss/>', headers: { etag: 'v1' } }
		);
		const result = await safeFetch('http://public.example/');
		expect(result.url).toBe('http://public.example/feed');
		expect(result.body).toBe('<rss/>');
		expect(result.headers.get('etag')).toBe('v1');
	});
	it('enforces advertised and streamed byte limits', async () => {
		responses.push({ headers: { 'content-length': '100' } });
		await expect(safeFetch('http://public.example/', { maxBytes: 4 })).rejects.toThrow(
			'size limit'
		);
		responses.push({ body: '12345' });
		await expect(safeFetch('http://public.example/', { maxBytes: 4 })).rejects.toThrow(
			'size limit'
		);
	});
	it.each([
		['gzip', gzipSync],
		['deflate', deflateSync],
		['br', brotliCompressSync]
	] as const)('decodes %s responses', async (encoding, compress) => {
		const body = '<rss>café</rss>';
		responses.push({
			body: compress(Buffer.from(body)),
			headers: { 'content-encoding': encoding }
		});
		expect((await safeFetch('http://public.example/')).body).toBe(body);
		expect(vi.mocked(request).mock.calls[0][1]).toMatchObject({
			headers: { 'Accept-Encoding': 'gzip, deflate, br' }
		});
	});
	it('aborts the socket when a gzip bomb exceeds the decompressed byte limit', async () => {
		const compressed = gzipSync(Buffer.alloc(1024 * 1024, 'a'));
		expect(compressed.length).toBeLessThan(4096);
		responses.push({
			body: compressed,
			headers: { 'content-encoding': 'gzip', 'content-length': String(compressed.length) }
		});
		await expect(safeFetch('http://public.example/', { maxBytes: 4096 })).rejects.toThrow(
			'size limit'
		);
		expect(vi.mocked(request).mock.results[0].value.destroy).toHaveBeenCalled();
	});
	it('decodes two stacked encodings in reverse order', async () => {
		responses.push({
			body: brotliCompressSync(gzipSync('stacked feed')),
			headers: { 'content-encoding': 'gzip, br' }
		});
		expect((await safeFetch('http://public.example/')).body).toBe('stacked feed');
	});
	it.each(['unknown', 'gzip, br, deflate', 'gzip, unknown', 'gzip,'])(
		'rejects unknown or excessive encodings: %s',
		async (encoding) => {
			responses.push({ headers: { 'content-encoding': encoding } });
			await expect(safeFetch('http://public.example/')).rejects.toThrow(
				'Unsupported response content encoding'
			);
		}
	);
	it('fails cleanly on corrupt compressed data and destroys the socket', async () => {
		responses.push({ body: 'not a gzip stream', headers: { 'content-encoding': 'gzip' } });
		await expect(safeFetch('http://public.example/')).rejects.toThrow();
		expect(vi.mocked(request).mock.results[0].value.destroy).toHaveBeenCalled();
	});
	it.each(['header', 'prolog'] as const)(
		'decodes an ISO-8859-1 feed from its %s',
		async (source) => {
			const xml = `<?xml version="1.0" encoding="${source === 'prolog' ? 'ISO-8859-1' : 'UTF-8'}"?><rss version="2.0"><channel><title>Café français</title><link>https://example.com/</link><description>Crème</description><item><guid>1</guid><title>Déjà vu</title></item></channel></rss>`;
			responses.push({
				body: Buffer.from(xml, 'latin1'),
				headers:
					source === 'header' ? { 'content-type': 'application/rss+xml; charset="ISO-8859-1"' } : {}
			});
			const result = await safeFetch('http://public.example/');
			const feed = await parseFeed(result.body, result.url);
			expect(feed.title).toBe('Café français');
			expect(feed.items[0].title).toBe('Déjà vu');
		}
	);
	it('rejects unsupported declared charsets', async () => {
		responses.push({ headers: { 'content-type': 'text/html; charset=unknown-charset' } });
		await expect(safeFetch('http://public.example/')).rejects.toThrow(
			'Unsupported response charset'
		);
	});
	it('times out a stalled response', async () => {
		vi.useFakeTimers();
		responses.push({ hang: true });
		const assertion = expect(
			safeFetch('http://public.example/', { timeoutMs: 20 })
		).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(21);
		await assertion;
	});
	it('includes DNS resolution in the deadline', async () => {
		vi.useFakeTimers();
		vi.mocked(lookup).mockImplementation(() => new Promise(() => {}));
		const assertion = expect(
			safeFetch('http://public.example/', { timeoutMs: 20 })
		).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(21);
		await assertion;
		expect(request).not.toHaveBeenCalled();
	});
	it('supports 304 conditional responses and rejects remote errors', async () => {
		responses.push({ status: 304 }, { status: 500 });
		expect(
			(await safeFetch('http://public.example/', { headers: { 'If-None-Match': 'v1' } })).status
		).toBe(304);
		await expect(safeFetch('http://public.example/')).rejects.toThrow('HTTP 500');
	});
});
