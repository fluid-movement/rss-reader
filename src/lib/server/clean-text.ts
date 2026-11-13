/** Control characters and bidirectional overrides/isolates/marks that can spoof displayed text. */
const UNSAFE = /[\p{Cc}؜‎‏‪-‮⁦-⁩]/gu;

/**
 * Cleans a user-supplied one-line name (feed title, folder name): removes control and bidi
 * characters (tabs and newlines become spaces), then collapses runs of whitespace and trims.
 */
export function cleanSingleLine(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value
		.replace(/[\t\n\r\v\f]/g, ' ')
		.replace(UNSAFE, '')
		.replace(/\s+/g, ' ')
		.trim();
}
