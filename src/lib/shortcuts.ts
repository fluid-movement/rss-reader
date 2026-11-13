/** Keyboard shortcut map and the pure filtering logic that decides whether a key press counts. */

export type ShortcutAction =
	| 'next'
	| 'previous'
	| 'toggleRead'
	| 'toggleStar'
	| 'openOriginal'
	| 'refresh'
	| 'search'
	| 'help';

export interface ShortcutDefinition {
	key: string;
	action: ShortcutAction;
	description: string;
	/** Holding the key down should keep firing it (navigation only). */
	repeatable?: boolean;
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
	{ key: 'j', action: 'next', description: 'Next article', repeatable: true },
	{ key: 'k', action: 'previous', description: 'Previous article', repeatable: true },
	{ key: 'm', action: 'toggleRead', description: 'Mark read / unread' },
	{ key: 's', action: 'toggleStar', description: 'Star / unstar' },
	{ key: 'o', action: 'openOriginal', description: 'Open the original in a new tab' },
	{ key: 'r', action: 'refresh', description: 'Refresh this feed (or all feeds)' },
	{ key: '/', action: 'search', description: 'Focus search' },
	{ key: '?', action: 'help', description: 'Show keyboard shortcuts' }
];

/** The parts of a KeyboardEvent the filter looks at, so it can be unit-tested without a DOM. */
export interface KeyEventLike {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
	isComposing: boolean;
	repeat: boolean;
	defaultPrevented: boolean;
	target: object | null;
}

export interface TargetLike {
	tagName?: string;
	isContentEditable?: boolean;
	closest?: (selector: string) => unknown;
}

/** Elements where letters are typed or that own their own keyboard handling. */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
/** Open overlays (dialogs, menus, listboxes) keep their keys; shortcuts would conflict. */
export const OVERLAY_SELECTOR =
	'[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[role="combobox"],[contenteditable=""],[contenteditable="true"]';

function isCasedLetter(key: string) {
	return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

export function isEditableTarget(value: object | null): boolean {
	const target = value as TargetLike | null;
	if (!target) return false;
	if (target.tagName && EDITABLE_TAGS.has(target.tagName.toUpperCase())) return true;
	return target.isContentEditable === true;
}

function insideOverlay(target: object | null) {
	return !!(target as TargetLike | null)?.closest?.(OVERLAY_SELECTOR);
}

/**
 * Resolves a key press to a shortcut action, or null when it must be left alone: typing in a
 * field, an open dialog or menu, a held ctrl/meta/alt modifier (browser and OS shortcuts), IME
 * composition, or a press another handler already consumed.
 * `overlayOpen` is true while any dialog/menu is open anywhere on the page.
 */
export function resolveShortcut(event: KeyEventLike, overlayOpen = false): ShortcutAction | null {
	if (event.defaultPrevented || event.isComposing || event.key === 'Process') return null;
	if (event.ctrlKey || event.metaKey || event.altKey) return null;
	if (overlayOpen || isEditableTarget(event.target) || insideOverlay(event.target)) return null;
	// Shift is rejected only for letters: '/' and '?' need Shift on some layouts (German, AZERTY).
	if (event.shiftKey && isCasedLetter(event.key)) return null;
	// Caps Lock yields an uppercase letter without Shift; shortcuts are lowercase.
	if (isCasedLetter(event.key) && event.key !== event.key.toLowerCase()) return null;
	const shortcut = SHORTCUTS.find((candidate) => candidate.key === event.key);
	if (!shortcut) return null;
	if (event.repeat && !shortcut.repeatable) return null;
	return shortcut.action;
}

/** Escape in a text field blurs it (but never inside a dialog, which closes itself). */
export function shouldBlurOnEscape(event: KeyEventLike): boolean {
	return (
		event.key === 'Escape' &&
		!event.isComposing &&
		isEditableTarget(event.target) &&
		!insideOverlay(event.target)
	);
}

/**
 * What `r` refreshes: the open feed, everything on a list view, or nothing when no list view
 * is on screen (settings, manage feeds).
 */
export function refreshTarget(
	context: { view: string; viewId: string | null } | null
): { kind: 'feed'; id: string } | { kind: 'all' } | null {
	if (!context) return null;
	return context.view === 'feed' && context.viewId
		? { kind: 'feed', id: context.viewId }
		: { kind: 'all' };
}

/** Only web links are opened from the keyboard. */
export function safeOriginalLink(link: string | null | undefined): string | null {
	if (!link) return null;
	try {
		const url = new URL(link);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

/** Index of the article to move to, or null when there is nowhere to go. */
export function adjacentIndex(
	ids: readonly string[],
	currentId: string | undefined,
	direction: 1 | -1
): number | null {
	if (!ids.length) return null;
	const current = currentId === undefined ? -1 : ids.indexOf(currentId);
	if (current === -1) return 0; // nothing open yet: either key starts at the top of the list
	const next = current + direction;
	return next >= 0 && next < ids.length ? next : null;
}
