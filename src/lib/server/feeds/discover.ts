import { Parser } from 'htmlparser2';
import { safeFetch, type SafeFetchResult } from './fetch';
import { FeedParseError, parseFeed, webUrl, type ParsedFeed } from './parse';

const feedTypes = new Set([
	'application/rss+xml',
	'application/atom+xml',
	'application/feed+json',
	'application/json'
]);

/** HTML parser handles quoted/unquoted attributes, entities and attribute order. */
export function discoverFeedUrls(html: string, pageUrl: string): string[] {
	const candidates: string[] = [];
	let base = pageUrl;
	let hasBase = false;
	const links: string[] = [];
	const parser = new Parser({
		onopentag(name, attributes) {
			if (name === 'base' && !hasBase && attributes.href) {
				base = webUrl(attributes.href, pageUrl) ?? pageUrl;
				hasBase = true;
			}
			if (
				name === 'link' &&
				attributes.rel?.toLowerCase().split(/\s+/).includes('alternate') &&
				feedTypes.has(attributes.type?.toLowerCase().split(';')[0].trim()) &&
				attributes.href
			) {
				links.push(attributes.href);
			}
		}
	});
	parser.end(html);
	for (const href of links) {
		const url = webUrl(href, base);
		if (url && !candidates.includes(url)) candidates.push(url);
	}
	return candidates;
}

export interface DiscoveredFeed {
	url: string;
	feed: ParsedFeed;
	response: SafeFetchResult;
}

export async function discoverFeed(input: string): Promise<DiscoveredFeed> {
	const response = await safeFetch(input);
	try {
		return { url: response.url, feed: await parseFeed(response.body, response.url), response };
	} catch {
		const urls = discoverFeedUrls(response.body, response.url);
		// Bound requests even for malicious pages with thousands of alternate links.
		for (const url of urls.slice(0, 5)) {
			try {
				const alternate = await safeFetch(url);
				return {
					url: alternate.url,
					feed: await parseFeed(alternate.body, alternate.url),
					response: alternate
				};
			} catch {
				// Try the next advertised format, always through safeFetch.
			}
		}
		throw new FeedParseError('No supported feed found at this URL.');
	}
}
