import { Parser } from 'htmlparser2';

const SKIPPED = new Set(['script', 'style', 'noscript', 'template']);

/**
 * Removes C0 control characters (except tab, newline, carriage return). Highlighting marks
 * matches with \u0001/\u0002 inside the index, so indexed text must never contain them itself.
 */
export const stripControlChars = (text: string) =>
	// eslint-disable-next-line no-control-regex -- the point is to match control characters.
	text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

/** Visible text of an HTML fragment: tags and attributes are dropped, entities decoded.
 * `spaceTags: false` adds no whitespace at tag boundaries (for titles: `CO<sub>2</sub>`). */
export function htmlToSearchText(html: string, { spaceTags = true } = {}): string {
	let out = '';
	let skipping = 0;
	const parser = new Parser({
		onopentag(name) {
			if (SKIPPED.has(name)) skipping++;
			if (spaceTags) out += ' ';
		},
		onclosetag(name) {
			if (SKIPPED.has(name) && skipping > 0) skipping--;
			if (spaceTags) out += ' ';
		},
		ontext(text) {
			if (!skipping) out += text;
		}
	});
	parser.write(html);
	parser.end();
	return stripControlChars(out).replace(/\s+/g, ' ').trim();
}
