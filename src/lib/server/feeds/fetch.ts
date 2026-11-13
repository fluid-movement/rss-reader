import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import ipaddr from 'ipaddr.js';

let configuredContact: string | undefined;

/** Supply SvelteKit's runtime env (including .env in dev); Node scripts use process.env. */
export function configureFeedContact(contact: string | undefined) {
	configuredContact = contact;
}

export function feedUserAgent() {
	// Also used by standalone Node scripts, outside SvelteKit's env modules.
	const contact = (configuredContact ?? process.env.RSS_READER_CONTACT)?.trim();
	return `RSSReader/1.0 (+${contact && /^[\x20-\x7e]+$/.test(contact) && !/[()]/.test(contact) ? contact : 'https://github.com/fluid-movement/rss-reader'})`;
}

export class FeedFetchError extends Error {}

const NETWORK_CODES = new Set([
	'ENOTFOUND',
	'ECONNREFUSED',
	'ECONNRESET',
	'ETIMEDOUT',
	'EAI_AGAIN',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'EPIPE',
	'ECONNABORTED',
	'UND_ERR_SOCKET'
]);
/** True for transient network failures (DNS, refused/reset connections, timeouts). */
export function isTransientNetworkError(error: unknown, depth = 0): boolean {
	if (!error || typeof error !== 'object' || depth > 3) return false;
	const { code, cause, errors } = error as { code?: unknown; cause?: unknown; errors?: unknown };
	if (typeof code === 'string' && NETWORK_CODES.has(code)) return true;
	if (isTransientNetworkError(cause, depth + 1)) return true;
	return (
		Array.isArray(errors) &&
		errors.length > 0 &&
		errors.every((e) => isTransientNetworkError(e, depth + 1))
	);
}

export interface SafeFetchOptions {
	timeoutMs?: number;
	maxBytes?: number;
	maxRedirects?: number;
	/** Conditional request headers only; cookies and authorization are never forwarded. */
	headers?: { 'If-None-Match'?: string; 'If-Modified-Since'?: string };
}

export interface SafeFetchResult {
	url: string;
	status: number;
	headers: Headers;
	body: string;
}

/** Only globally routable unicast addresses are allowed, including mapped IPv4. */
export function isPublicAddress(address: string): boolean {
	try {
		return ipaddr.process(address).range() === 'unicast';
	} catch {
		return false;
	}
}

export function validateFetchUrl(input: string | URL): URL {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		throw new FeedFetchError('Enter a valid HTTP or HTTPS URL.');
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
		throw new FeedFetchError('Only HTTP(S) URLs without credentials are allowed.');
	}
	url.hash = '';
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	if (isIP(hostname) && !isPublicAddress(hostname)) {
		throw new FeedFetchError('Private or reserved network addresses are not allowed.');
	}
	return url;
}

function decodeBody(body: Buffer, contentType: string | null): string {
	const charset = contentType?.match(/\bcharset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i);
	const xmlEncoding = body
		.subarray(0, 1024)
		.toString('latin1')
		.match(/^\s*<\?xml\b[^?]*\bencoding\s*=\s*["']([^"']+)["']/i)?.[1];
	const encoding = charset?.[1] ?? charset?.[2] ?? charset?.[3] ?? xmlEncoding ?? 'utf-8';
	try {
		return new TextDecoder(encoding).decode(body);
	} catch {
		throw new FeedFetchError(`Unsupported response charset: ${encoding}.`);
	}
}

/**
 * Bounded server-side GET. Resolve once, validate every answer and pin the socket
 * to that answer (not merely a preflight lookup), closing DNS rebinding races.
 * Every redirect is resolved/validated again; a single deadline covers all hops
 * and DNS resolution as well as decompression. The byte limit applies to decoded
 * output; pipeline backpressure bounds buffering and abort destroys the socket.
 */
export async function safeFetch(
	input: string | URL,
	options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
	const { timeoutMs = 15_000, maxBytes = 5 * 1024 * 1024, maxRedirects = 5 } = options;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const signal = controller.signal;
	const aborted = new Promise<never>((_, reject) => {
		signal.addEventListener('abort', () => reject(new FeedFetchError('Request timed out.')), {
			once: true
		});
	});
	async function run() {
		let url = validateFetchUrl(input);
		for (let hop = 0; hop <= maxRedirects; hop++) {
			const hostname = url.hostname.replace(/^\[|\]$/g, '');
			const addresses = isIP(hostname)
				? [{ address: hostname, family: isIP(hostname) }]
				: await Promise.race([lookup(hostname, { all: true }), aborted]);
			if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
				throw new FeedFetchError('Private or reserved network addresses are not allowed.');
			}
			signal.throwIfAborted();
			const pinned = addresses[0];
			const result = await new Promise<SafeFetchResult & { location?: string }>(
				(resolve, reject) => {
					const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
						url,
						{
							signal,
							agent: false,
							headers: {
								Accept:
									'application/atom+xml, application/rss+xml, application/feed+json, application/xml, text/html, */*',
								'Accept-Encoding': 'gzip, deflate, br',
								'User-Agent': feedUserAgent(),
								...options.headers
							},
							lookup: (_hostname, lookupOptions, callback) => {
								if (lookupOptions.all) callback(null, [pinned]);
								else callback(null, pinned.address, pinned.family);
							}
						},
						(response) => {
							const status = response.statusCode ?? 0;
							const headers = new Headers();
							for (const [name, value] of Object.entries(response.headers)) {
								if (value !== undefined)
									headers.set(name, Array.isArray(value) ? value.join(', ') : value);
							}
							response.on('error', reject);
							if ([301, 302, 303, 307, 308].includes(status)) {
								response.destroy();
								resolve({
									url: url.href,
									status,
									headers,
									body: '',
									location: headers.get('location') ?? ''
								});
								return;
							}
							if (status === 304) {
								response.resume();
								resolve({ url: url.href, status, headers, body: '' });
								return;
							}
							if (status < 200 || status >= 300) {
								response.destroy();
								reject(new FeedFetchError(`Remote server returned HTTP ${status}.`));
								return;
							}
							if (Number(headers.get('content-length')) > maxBytes) {
								response.destroy();
								reject(new FeedFetchError('Response exceeds size limit.'));
								return;
							}
							const encodings = (headers.get('content-encoding') ?? 'identity')
								.split(',')
								.map((encoding) => encoding.trim().toLowerCase());
							if (
								encodings.length > 2 ||
								encodings.some(
									(encoding) => !['identity', 'gzip', 'deflate', 'br'].includes(encoding)
								)
							) {
								response.destroy();
								reject(new FeedFetchError('Unsupported response content encoding.'));
								return;
							}
							// Content encodings are applied in order and decoded in reverse.
							const decoders = encodings
								.reverse()
								.filter((encoding) => encoding !== 'identity')
								.map((encoding) => {
									if (encoding === 'gzip') return createGunzip();
									if (encoding === 'deflate') return createInflate();
									return createBrotliDecompress();
								});
							const chunks: Buffer[] = [];
							let bytes = 0;
							const sink = new Writable({
								write(chunk: Buffer, _encoding, callback) {
									bytes += chunk.length;
									if (bytes > maxBytes) {
										// Stop upstream immediately, not just the decoded output.
										response.destroy();
										request.destroy();
										callback(new FeedFetchError('Response exceeds size limit.'));
									} else {
										chunks.push(chunk);
										callback();
									}
								}
							});
							pipeline([response, ...decoders, sink], { signal })
								.then(() =>
									resolve({
										url: url.href,
										status,
										headers,
										body: decodeBody(Buffer.concat(chunks), headers.get('content-type'))
									})
								)
								.catch((error: unknown) => {
									request.destroy();
									if (bytes > maxBytes) reject(new FeedFetchError('Response exceeds size limit.'));
									else reject(error);
								});
						}
					);
					request.on('error', reject);
					request.end();
				}
			);
			if (result.location !== undefined) {
				if (!result.location) throw new FeedFetchError('Redirect has no destination.');
				url = validateFetchUrl(new URL(result.location, url));
				continue;
			}
			return result;
		}
		throw new FeedFetchError('Too many redirects.');
	}
	try {
		return await Promise.race([run(), aborted]);
	} finally {
		clearTimeout(timeout);
	}
}
