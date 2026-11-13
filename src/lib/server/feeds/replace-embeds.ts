import { Parser } from 'htmlparser2';

/** Replace whole embed subtrees before sanitizing; never link to an untrusted embed src. */
export function replaceEmbeds(html: string, original: string | null): string {
	const href = original
		?.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	const hint = `Embedded content not shown.${href ? ` <a href="${href}">Open original</a>` : ''}`;
	const ranges: Array<[number, number]> = [];
	let start: number | null = null;
	let depth = 0;
	const parser = new Parser({
		onopentag(name) {
			if (start !== null) depth++;
			else if (name === 'iframe' || name === 'video') {
				start = parser.startIndex;
				depth = 1;
			}
		},
		onclosetag() {
			if (start !== null && --depth === 0) {
				ranges.push([start, parser.endIndex + 1]);
				start = null;
			}
		}
	});
	parser.end(html);
	for (const [from, to] of ranges.reverse()) html = html.slice(0, from) + hint + html.slice(to);
	return html;
}
