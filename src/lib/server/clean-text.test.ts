import { describe, expect, it } from 'vitest';
import { cleanSingleLine } from './clean-text';

describe('cleanSingleLine', () => {
	it('strips control and bidi characters from the spoofing repro', () => {
		expect(cleanSingleLine('<script>alert(1)</script> ‮RTL\u0007ctrl')).toBe(
			'<script>alert(1)</script> RTLctrl'
		);
	});
	it.each(['‪', '‫', '‬', '‭', '‮', '⁦', '⁧', '⁨', '⁩', '‎', '‏', '؜'])('removes %j', (ch) =>
		expect(cleanSingleLine(`a${ch}b`)).toBe('ab')
	);
	it('collapses whitespace, turns newlines into spaces and trims', () => {
		expect(cleanSingleLine('  a \n\t b   c  ')).toBe('a b c');
	});
	it('returns an empty string for non-strings', () => {
		expect(cleanSingleLine(null)).toBe('');
	});
});
