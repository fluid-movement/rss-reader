import { createHash } from 'node:crypto';
import Parser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';

export interface ParsedItem {
	guid: string;
	link: string | null;
	title: string;
	content: string | null;
	summary: string | null;
	author: string | null;
	publishedAt: Date | null;
}

export interface ParsedFeed {
	title: string;
	siteUrl: string | null;
	items: ParsedItem[];
}

export class FeedParseError extends Error {}

export function webUrl(value: unknown, base?: string): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const url = new URL(value, base);
		return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}

export function sanitizeContent(value: string | null, baseUrl?: string): string | null {
	if (value === null) return null;
	return sanitizeHtml(value, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
		allowedAttributes: {
			a: ['href', 'title', 'rel'],
			img: ['src', 'alt', 'title', 'width', 'height']
		},
		allowedSchemes: ['http', 'https'],
		transformTags: {
			'*': (tagName, attributes) => {
				for (const attribute of ['href', 'src']) {
					if (!(attribute in attributes)) continue;
					const resolved = webUrl(attributes[attribute], baseUrl);
					if (resolved) attributes[attribute] = resolved;
					else delete attributes[attribute];
				}
				if (tagName === 'a') attributes.rel = 'noopener noreferrer nofollow';
				return { tagName, attribs: attributes };
			}
		},
		allowProtocolRelative: false
	});
}

const plain = (value: string) => sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} });
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const date = (value: unknown): Date | null => {
	const parsed = typeof value === 'string' ? new Date(value) : null;
	return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
};

function normalize(
	input: {
		id?: unknown;
		link?: unknown;
		title?: unknown;
		content?: unknown;
		summary?: unknown;
		author?: unknown;
		publishedAt?: unknown;
	},
	base: string,
	siteUrl: string | null
): ParsedItem {
	const link = webUrl(input.link, siteUrl ?? base);
	const contentBase = link ?? siteUrl ?? base;
	const content = text(input.content);
	const title = plain(text(input.title) ?? 'Untitled');
	return {
		guid:
			text(input.id)?.trim() ||
			link ||
			createHash('sha256')
				.update(JSON.stringify([title, content, input.publishedAt ?? null]))
				.digest('hex'),
		link,
		title,
		content: sanitizeContent(content, contentBase),
		summary: sanitizeContent(text(input.summary), contentBase),
		author: text(input.author) ? plain(input.author as string) : null,
		publishedAt: date(input.publishedAt)
	};
}

/** Parses RSS 2/1, Atom or JSON Feed into the scheduler's shared item shape. */
export async function parseFeed(body: string, baseUrl: string): Promise<ParsedFeed> {
	try {
		if (body.trimStart().startsWith('{')) {
			const feed = JSON.parse(body);
			if (
				!/^https:\/\/jsonfeed.org\/version\/1(?:\.1)?$/.test(feed.version) ||
				!Array.isArray(feed.items)
			) {
				throw new Error('Invalid JSON Feed');
			}
			const siteUrl = webUrl(feed.home_page_url, baseUrl);
			return {
				title: plain(text(feed.title) ?? baseUrl),
				siteUrl,
				items: feed.items.map((item: Record<string, unknown>) => {
					const authors = item.authors as { name?: string }[] | undefined;
					const author = item.author as { name?: string } | undefined;
					const content =
						text(item.content_html) ??
						(typeof item.content_text === 'string'
							? `<p>${sanitizeHtml(item.content_text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), { allowedTags: [], allowedAttributes: {} })}</p>`
							: null);
					return normalize(
						{
							id: item.id,
							link: item.url ?? item.external_url,
							title: item.title,
							content,
							summary: item.summary,
							author:
								authors
									?.map((a) => a.name)
									.filter(Boolean)
									.join(', ') || author?.name,
							publishedAt: item.date_published ?? item.date_modified
						},
						baseUrl,
						siteUrl
					);
				})
			};
		}
		const feed = await new Parser().parseString(body);
		const siteUrl = webUrl(feed.link, baseUrl);
		return {
			title: plain(feed.title ?? baseUrl),
			siteUrl,
			items: feed.items.map((item) =>
				normalize(
					{
						id: item.guid ?? item.id,
						link: item.link,
						title: item.title,
						content: item['content:encoded'] ?? item.content ?? item.summary,
						summary: item.summary ?? item.contentSnippet,
						author: item.creator ?? item.author,
						publishedAt: item.isoDate ?? item.pubDate
					},
					baseUrl,
					siteUrl
				)
			)
		};
	} catch {
		throw new FeedParseError('Unable to parse this URL as an RSS, Atom or JSON feed.');
	}
}
