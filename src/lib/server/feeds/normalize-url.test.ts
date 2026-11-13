import { expect, it } from 'vitest';
import { normalizeFeedUrl } from './normalize-url';

it.each([
	['HTTP://D.com:80/x#frag', 'http://d.com/x'],
	['HTTPS://D.com:443/x#frag', 'https://d.com/x'],
	['https://D.com:8443/x/', 'https://d.com:8443/x/'],
	['http://d.com/x/?b=2&a=%2f#frag', 'http://d.com/x/?b=2&a=%2f'],
	['http://d.com/X', 'http://d.com/X']
])('normalizes %s to %s without removing path/query distinctions', (input, expected) => {
	expect(normalizeFeedUrl(input)).toBe(expected);
});

it.each(['javascript:alert(1)', 'ftp://d.com/x', 'not a URL'])(
	'rejects non-HTTP(S) feed URLs: %s',
	(input) => {
		expect(() => normalizeFeedUrl(input)).toThrow();
	}
);
