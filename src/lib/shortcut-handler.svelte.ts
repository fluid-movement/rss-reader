import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { resolve } from '$app/paths';
import { toast } from 'svelte-sonner';
import { isRead, isStarred, updateArticle } from '#lib/reader-state.svelte.ts';
import {
	adjacentIndex,
	refreshTarget,
	resolveShortcut,
	safeOriginalLink,
	shouldBlurOnEscape,
	type ShortcutAction
} from '#lib/shortcuts.ts';
import type { ReaderView } from '#lib/reader.ts';

/** What the article list on screen tells the shortcut handler. Set by the reader workspace. */
export interface ReaderShortcutContext {
	view: ReaderView;
	viewId: string | null;
	articleIds: string[];
	selectedId: string | undefined;
	/** The open article, or the selected list row (read/star state is the server's). */
	selected:
		| { id: string; feedId: string; read: boolean; starred: boolean; link?: string | null }
		| undefined;
	hasMore: boolean;
	loadMore: () => Promise<string[] | null>;
	hrefFor: (id: string) => string;
}

let context = $state.raw<ReaderShortcutContext | null>(null);

export function setReaderShortcutContext(next: ReaderShortcutContext | null) {
	context = next;
}

let refreshing = false;

async function refresh() {
	if (refreshing) return;
	if (!refreshTarget(context)) return;
	refreshing = true;
	const target = refreshTarget(context);
	if (!target) return;
	const feedView = target.kind === 'feed';
	const body = new FormData();
	if (target.kind === 'feed') body.set('feedId', target.id);
	try {
		const response = await fetch(
			`${resolve('/(app)/feeds')}?/${feedView ? 'refreshFeed' : 'refreshAll'}`,
			{ method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } }
		);
		const result = deserialize(await response.text());
		const message =
			(result.type === 'success' || result.type === 'failure') &&
			typeof result.data?.message === 'string'
				? result.data.message
				: undefined;
		if (result.type === 'success' && result.data?.success !== false) {
			// The action reports per-feed failures inside a successful result.
			if (message && /Failed: [1-9]/.test(message)) toast.warning(message);
			else toast.success(message ?? 'Refreshed.');
		} else toast.error(message ?? 'Could not refresh. Try again.');
		await invalidateAll();
	} catch {
		toast.error('Could not refresh. Try again.');
	} finally {
		refreshing = false;
	}
}

function focusSearch() {
	const inputs = document.querySelectorAll<HTMLInputElement>('input[type="search"][name="q"]');
	const visible = [...inputs].find((input) => input.getClientRects().length > 0);
	if (visible) {
		visible.focus();
		visible.select();
		return;
	}
	// Phones hide the sidebar search; the search page autofocuses its own box.
	void goto(resolve('/(app)/search'));
}

async function move(direction: 1 | -1) {
	const current = context;
	if (!current) return;
	let ids = current.articleIds;
	let index = adjacentIndex(ids, current.selectedId, direction);
	// At the end of the loaded list: fetch the next page and continue into it.
	if (index === null && direction === 1 && current.hasMore) {
		const loaded = await current.loadMore();
		if (!loaded) return;
		ids = loaded;
		index = adjacentIndex(ids, current.selectedId, direction);
	}
	if (index === null) return;
	// reset: false keeps the list scroll and focus where they are; the workspace scrolls the selected row into view.
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefFor() wraps resolve().
	await goto(current.hrefFor(ids[index]), { reset: false });
}

function run(action: ShortcutAction, openHelp: () => void) {
	const current = context;
	switch (action) {
		case 'next':
			return void move(1);
		case 'previous':
			return void move(-1);
		case 'toggleRead':
			if (current?.selected)
				void updateArticle(current.selected, { read: !isRead(current.selected) });
			return;
		case 'toggleStar':
			if (current?.selected)
				void updateArticle(current.selected, { starred: !isStarred(current.selected) });
			return;
		case 'openOriginal': {
			const link = safeOriginalLink(current?.selected?.link);
			if (link) window.open(link, '_blank', 'noopener,noreferrer');
			return;
		}
		case 'refresh':
			return void refresh();
		case 'search':
			return focusSearch();
		case 'help':
			return openHelp();
	}
}

const OPEN_OVERLAY =
	'[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[role="menu"][data-state="open"]';

/** One keydown handler for the app shell (mount it with `<svelte:window onkeydown>`). */
export function createShortcutHandler(openHelp: () => void) {
	return (event: KeyboardEvent) => {
		if (shouldBlurOnEscape(event)) {
			(event.target as HTMLElement).blur();
			return;
		}
		const action = resolveShortcut(event, !!document.querySelector(OPEN_OVERLAY));
		if (!action) return;
		event.preventDefault();
		run(action, openHelp);
	};
}
