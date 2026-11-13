import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { feedFailure } from './reader';

describe('feed failure presentation', () => {
	it('constrains the alert grid description and wraps unbroken error text', () => {
		const workspace = readFileSync(
			new URL('./components/reader-workspace.svelte', import.meta.url),
			'utf8'
		);
		expect(workspace).toMatch(/<Alert\.Description\s+class="min-w-0">/);
		expect(workspace).toMatch(/<p\s+class="\[overflow-wrap:anywhere\]">\{failure\}<\/p>/);
	});
	it.each([0, 1, 2])('hides errors below the threshold (%s)', (errorCount) => {
		expect(feedFailure({ errorCount, lastError: 'Remote server returned HTTP 404.' })).toBeNull();
	});
	it.each([3, 4])('shows the safe last error at and above the threshold (%s)', (errorCount) => {
		expect(feedFailure({ errorCount, lastError: 'Remote server returned HTTP 404.' })).toBe(
			'Remote server returned HTTP 404.'
		);
	});
	it('handles missing feeds and missing error text without exposing internals', () => {
		expect(feedFailure(undefined)).toBeNull();
		expect(feedFailure({ errorCount: 3, lastError: null })).toBe(
			'Could not fetch this feed. Try again.'
		);
	});
	it('clears the warning on recovery even if old text remains', () => {
		expect(
			feedFailure({ errorCount: 0, lastError: 'Remote server returned HTTP 404.' })
		).toBeNull();
	});
});
