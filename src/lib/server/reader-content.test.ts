import { describe, expect, it } from 'vitest';
import { sanitizeArticle } from './reader-content';
import { sanitizeContent } from './feeds/parse';

describe('embedded content at the reader boundary', () => {
	it.each(['iframe', 'video'])(
		'replaces stored %s embeds and keeps hints after re-sanitization',
		(tag) => {
			const content = `<p>Before</p><${tag} src="https://embed.example" onload="bad()"><source src="bad"><script>bad()</script></${tag}><p>After</p>`;
			const original = 'https://example.com/story?a=1&b=2';
			for (const value of [content, sanitizeContent(content, original)]) {
				const html = sanitizeArticle(value, original);
				expect(html).toBe(
					'<p>Before</p>Embedded content not shown. <a href="https://example.com/story?a=1&amp;b=2" rel="noopener noreferrer">Open original</a><p>After</p>'
				);
			}
		}
	);
	it('escapes the original URL and does not link to an embed source', () => {
		const html = sanitizeArticle(
			'<video src="javascript:bad()"></video>',
			'https://example.com/" onclick="bad'
		);
		expect(html).toContain('Embedded content not shown.');
		expect(html).not.toMatch(/<video|javascript:| onclick=/);
	});
	it('shows a hint without a link when the original URL is unavailable', () => {
		expect(
			sanitizeArticle('<iframe src="https://embed.example"></iframe>', 'javascript:bad()')
		).toBe('Embedded content not shown.');
	});
});
