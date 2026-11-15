import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual worker with browser APIs replaced, not a separate policy copy.
function setup() {
	const listeners: Record<string, (event: unknown) => void> = {};
	const cache = {
		addAll: vi.fn().mockResolvedValue(undefined),
		match: vi.fn().mockResolvedValue(undefined)
	};
	const caches = {
		open: vi.fn().mockResolvedValue(cache),
		keys: vi
			.fn()
			.mockResolvedValue(['rss-reader-assets-old', 'rss-reader-assets-test', 'other-app']),
		delete: vi.fn().mockResolvedValue(true)
	};
	const fetch = vi.fn().mockResolvedValue(new Response('live private response'));
	const claim = vi.fn().mockResolvedValue(undefined);
	const source = readFileSync(new URL('../service-worker.ts', import.meta.url), 'utf8').replace(
		/^import .* from '\$app\/(?:manifest|env|service-worker)';$/gm,
		''
	);
	runInNewContext(ts.transpileModule(source, {}).outputText, {
		immutable: [{ path: '_app/immutable/app.js' }],
		assets: [
			{ path: 'manifest.webmanifest' },
			{ path: 'offline.html' },
			{ path: 'icons/icon-192.png' }
		],
		version: 'test',
		worker: {
			location: { origin: 'https://reader.test' },
			clients: { claim },
			addEventListener: (name: string, callback: (event: unknown) => void) => {
				listeners[name] = callback;
			}
		},
		caches,
		fetch,
		URL,
		Response
	});
	function request(path: string, options: { method?: string; mode?: string } = {}) {
		const respondWith = vi.fn();
		const request = { url: new URL(path, 'https://reader.test').href, method: 'GET', ...options };
		listeners.fetch({ request, respondWith });
		return respondWith;
	}
	return { listeners, cache, caches, fetch, claim, request };
}

describe('online-only service worker', () => {
	it('precaches only build + static files and removes only its own old caches', async () => {
		const { listeners, cache, caches, claim } = setup();
		const waitUntil = vi.fn();
		listeners.install({ waitUntil });
		await waitUntil.mock.calls[0][0];
		expect(cache.addAll).toHaveBeenCalledWith([
			'/_app/immutable/app.js',
			'/manifest.webmanifest',
			'/offline.html',
			'/icons/icon-192.png'
		]);
		listeners.activate({ waitUntil });
		await waitUntil.mock.calls[1][0];
		expect(caches.delete).toHaveBeenCalledExactlyOnceWith('rss-reader-assets-old');
		expect(claim).toHaveBeenCalledOnce();
	});

	it.each([
		['/api/items', {}],
		['/api/auth/get-session', {}],
		['/api', { mode: 'navigate' }],
		['/auth/callback', { mode: 'navigate' }],
		['/login', { mode: 'navigate' }],
		['/?/logout', {}],
		['/', { method: 'POST', mode: 'navigate' }],
		['/feed/__data.json', {}],
		['/feed/__data.json?x=1', {}],
		['/_app/remote/query', {}],
		['https://external.test/article', { mode: 'navigate' }],
		['/unknown.json', {}]
	])('does not intercept %s (%j)', (path, options) => {
		const { request, fetch, caches } = setup();
		expect(request(path, options)).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
		expect(caches.open).not.toHaveBeenCalled();
	});

	it('serves known static assets cache-first', async () => {
		const { request, cache, fetch } = setup();
		cache.match.mockResolvedValue(new Response('cached script'));
		const response = await request('/_app/immutable/app.js').mock.calls[0][0];
		expect(await response.text()).toBe('cached script');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('passes navigation HTML straight through without opening a cache', async () => {
		const { request, caches } = setup();
		const response = await request('/feed/private', { mode: 'navigate' }).mock.calls[0][0];
		expect(await response.text()).toBe('live private response');
		expect(caches.open).not.toHaveBeenCalled();
	});

	it('returns only the generic offline screen on network failure', async () => {
		const { request, cache, fetch } = setup();
		fetch.mockRejectedValue(new TypeError('offline'));
		cache.match.mockResolvedValue(new Response('You are offline'));
		const response = await request('/feed/private', { mode: 'navigate' }).mock.calls[0][0];
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('You are offline');
		expect(cache.match).toHaveBeenCalledExactlyOnceWith('/offline.html');
	});
});

describe('PWA manifest and icons', () => {
	it('has install metadata and real PNG icons with matching dimensions', () => {
		const manifest = JSON.parse(
			readFileSync(new URL('../../static/manifest.webmanifest', import.meta.url), 'utf8')
		);
		expect(manifest).toMatchObject({
			name: 'RSS Reader',
			start_url: '/',
			scope: '/',
			display: 'standalone',
			theme_color: '#f9f6f1',
			background_color: '#f9f6f1'
		});
		expect(manifest.description).toBeTruthy();
		expect(manifest.icons).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
				expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
				expect.objectContaining({ sizes: '512x512', purpose: 'maskable' })
			])
		);
		for (const icon of [
			...manifest.icons,
			{ src: '/icons/apple-touch-icon.png', sizes: '180x180' },
			{ src: '/favicon.png', sizes: '32x32' }
		]) {
			const png = readFileSync(new URL(`../../static${icon.src}`, import.meta.url));
			expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
			expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
		}
	});
});
