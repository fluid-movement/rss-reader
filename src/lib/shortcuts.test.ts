import { describe, expect, it } from 'vitest';
import {
	adjacentIndex,
	refreshMessageKind,
	refreshTarget,
	resolveShortcut,
	safeOriginalLink,
	shouldBlurOnEscape,
	SHORTCUTS,
	type KeyEventLike,
	type TargetLike
} from './shortcuts';

const body: TargetLike = { tagName: 'BODY', closest: () => null };
const field = (tagName: string, extra: Partial<TargetLike> = {}): TargetLike => ({
	tagName,
	closest: () => null,
	...extra
});
function press(key: string, extra: Partial<KeyEventLike> = {}): KeyEventLike {
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		shiftKey: false,
		isComposing: false,
		repeat: false,
		defaultPrevented: false,
		target: body,
		...extra
	};
}

describe('resolveShortcut', () => {
	it('maps every documented key to its action', () => {
		const expected = {
			j: 'next',
			k: 'previous',
			m: 'toggleRead',
			s: 'toggleStar',
			o: 'openOriginal',
			r: 'refresh',
			'/': 'search'
		};
		for (const [key, action] of Object.entries(expected))
			expect(resolveShortcut(press(key))).toBe(action);
		expect(resolveShortcut(press('?', { shiftKey: true }))).toBe('help');
		expect(SHORTCUTS.map((shortcut) => shortcut.key)).toHaveLength(8);
	});

	it.each(['INPUT', 'TEXTAREA', 'SELECT', 'input'])('ignores typing in %s', (tag) => {
		expect(resolveShortcut(press('j', { target: field(tag) }))).toBeNull();
	});
	it('ignores contenteditable targets', () => {
		expect(resolveShortcut(press('j', { target: field('DIV', { isContentEditable: true }) }))).toBe(
			null
		);
	});
	it('ignores keys inside dialogs, menus and listboxes', () => {
		const inside = { tagName: 'BUTTON', closest: () => ({}) };
		expect(resolveShortcut(press('s', { target: inside }))).toBeNull();
	});
	it('ignores everything while an overlay is open anywhere', () => {
		expect(resolveShortcut(press('j'), true)).toBeNull();
		expect(resolveShortcut(press('?', { shiftKey: true }), true)).toBeNull();
	});
	it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores %s combinations', (modifier) => {
		expect(resolveShortcut(press('r', { [modifier]: true }))).toBeNull();
	});
	it('ignores IME composition and already-handled events', () => {
		expect(resolveShortcut(press('j', { isComposing: true }))).toBeNull();
		expect(resolveShortcut(press('Process'))).toBeNull();
		expect(resolveShortcut(press('j', { defaultPrevented: true }))).toBeNull();
	});
	it('ignores shifted letters and unknown keys', () => {
		expect(resolveShortcut(press('J', { shiftKey: true }))).toBeNull();
		expect(resolveShortcut(press('x'))).toBeNull();
		expect(resolveShortcut(press('Enter'))).toBeNull();
	});
	it('lets only navigation keys auto-repeat', () => {
		expect(resolveShortcut(press('j', { repeat: true }))).toBe('next');
		expect(resolveShortcut(press('k', { repeat: true }))).toBe('previous');
		expect(resolveShortcut(press('m', { repeat: true }))).toBeNull();
		expect(resolveShortcut(press('r', { repeat: true }))).toBeNull();
	});
	it('works with a null target', () => {
		expect(resolveShortcut(press('j', { target: null }))).toBe('next');
	});
});

describe('shouldBlurOnEscape', () => {
	it('blurs a focused text field only', () => {
		expect(shouldBlurOnEscape(press('Escape', { target: field('INPUT') }))).toBe(true);
		expect(shouldBlurOnEscape(press('Escape', { target: body }))).toBe(false);
		expect(shouldBlurOnEscape(press('j', { target: field('INPUT') }))).toBe(false);
	});
	it('leaves fields inside a dialog to the dialog', () => {
		const inDialog = { tagName: 'INPUT', closest: () => ({}) };
		expect(shouldBlurOnEscape(press('Escape', { target: inDialog }))).toBe(false);
	});
});

describe('safeOriginalLink', () => {
	it('allows http(s) only', () => {
		expect(safeOriginalLink('https://example.com/a')).toBe('https://example.com/a');
		expect(safeOriginalLink('javascript:alert(1)')).toBeNull();
		expect(safeOriginalLink('data:text/html,x')).toBeNull();
		expect(safeOriginalLink('not a url')).toBeNull();
		expect(safeOriginalLink(null)).toBeNull();
	});
});

describe('adjacentIndex', () => {
	const ids = ['a', 'b', 'c'];
	it('steps within the list and stops at the ends', () => {
		expect(adjacentIndex(ids, 'a', 1)).toBe(1);
		expect(adjacentIndex(ids, 'c', 1)).toBeNull();
		expect(adjacentIndex(ids, 'b', -1)).toBe(0);
		expect(adjacentIndex(ids, 'a', -1)).toBeNull();
	});
	it('starts at the top when nothing (or something unlisted) is open', () => {
		expect(adjacentIndex(ids, undefined, 1)).toBe(0);
		expect(adjacentIndex(ids, 'gone', -1)).toBe(0);
		expect(adjacentIndex([], undefined, 1)).toBeNull();
	});
});

describe('layout-dependent shifted keys and Caps Lock', () => {
	it('accepts / and ? with Shift held (German, AZERTY layouts)', () => {
		expect(resolveShortcut(press('/', { shiftKey: true }))).toBe('search');
		expect(resolveShortcut(press('?', { shiftKey: true }))).toBe('help');
		expect(resolveShortcut(press('?'))).toBe('help');
	});
	it('ignores shifted letters and Caps Lock letters', () => {
		expect(resolveShortcut(press('J', { shiftKey: true }))).toBeNull();
		expect(resolveShortcut(press('J'))).toBeNull(); // Caps Lock: uppercase without Shift
		expect(resolveShortcut(press('S'))).toBeNull();
	});
	it('still ignores ctrl/meta/alt with a shifted slash', () => {
		expect(resolveShortcut(press('/', { shiftKey: true, ctrlKey: true }))).toBeNull();
	});
});

describe('refreshTarget', () => {
	it('refreshes the open feed, everything on other list views, nothing without a list', () => {
		expect(refreshTarget({ view: 'feed', viewId: 'f1' })).toEqual({ kind: 'feed', id: 'f1' });
		expect(refreshTarget({ view: 'all', viewId: null })).toEqual({ kind: 'all' });
		expect(refreshTarget({ view: 'folder', viewId: 'x' })).toEqual({ kind: 'all' });
		expect(refreshTarget(null)).toBeNull();
	});
});

describe('refreshMessageKind', () => {
	it('maps refresh results to toast kinds', () => {
		expect(refreshMessageKind(undefined)).toBe('success');
		expect(refreshMessageKind('Feed refreshed.')).toBe('success');
		expect(refreshMessageKind('Refreshed recently, try again in a moment.')).toBe('info');
		expect(
			refreshMessageKind(
				'Refreshed: 0. Skipped: 42. Failed: 0. Refreshed recently, try again in a moment.'
			)
		).toBe('info');
		expect(refreshMessageKind('Refreshed: 3. Skipped: 2. Failed: 0.')).toBe('success');
		expect(refreshMessageKind('Refreshed: 0. Skipped: 5. Failed: 1. See refresh errors')).toBe(
			'warning'
		);
		expect(refreshMessageKind('Feed refresh failed. See the error below.')).toBe('warning');
	});
});
