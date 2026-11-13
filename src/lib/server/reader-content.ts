import sanitizeHtml from 'sanitize-html';

/** Only absolute web links can become reader actions or shared URLs. */
export function webUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		const url = new URL(value);
		return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

/** The database is not a trust boundary: sanitize at the reader's server boundary. */
export function sanitizeArticle(content: string | null, baseUrl?: string | null): string {
	const base = webUrl(baseUrl);
	return sanitizeHtml(content ?? '', {
		allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption'],
		allowedAttributes: {
			a: ['href', 'title', 'rel'],
			img: ['src', 'alt', 'title', 'loading']
		},
		allowedSchemes: ['http', 'https'],
		allowProtocolRelative: false,
		exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
		transformTags: {
			a: (_tag, attributes) => ({
				tagName: 'a',
				attribs: {
					...attributes,
					href: resolveWebLink(attributes.href, base) ?? '',
					rel: 'noopener noreferrer'
				}
			}),
			img: (_tag, attributes) => ({
				tagName: 'img',
				attribs: {
					...attributes,
					src: resolveWebLink(attributes.src, base) ?? '',
					loading: 'lazy'
				}
			})
		}
	});
}

function resolveWebLink(value: string | undefined, base: string | null) {
	if (!value) return null;
	try {
		return webUrl(new URL(value, base ?? undefined).href);
	} catch {
		return null;
	}
}

export function articleSummary(value: string | null): string | null {
	if (!value) return null;
	return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 240);
}
