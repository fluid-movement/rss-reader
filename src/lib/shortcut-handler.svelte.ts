import { deserialize } from '$app/forms';
import { goto, invalidateAll, preloadData } from '$app/navigation';
import { resolve } from '$app/paths';
import { toast } from 'svelte-sonner';
import { isRead, isStarred, updateArticle } from '#lib/reader-state.svelte.ts';
import {
	adjacentIndex,
	refreshMessageKind,
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
	/** Feeds of the open folder (folder views only): refreshed one by one. */
	folderFeedIds?: string[];
	hasMore: boolean;
	loadMore: () => Promise<string[] | null>;
	hrefFor: (id: string) => string;
}

let context = $state.raw<ReaderShortcutContext | null>(null);

export function setReaderShortcutContext(next: ReaderShortcutContext | null) {
	context = next;
}

let refreshing = $state(false);

/** True while a refresh started from the list (button, pull or `r`) is running. */
export function isRefreshing() {
	return refreshing;
}

/** Whether the list on screen can be refreshed. */
export function canRefresh() {
	return refreshTarget(context) !== null;
}

type RefreshOutcome = { kind: 'success' | 'info' | 'warning' | 'error'; message: string };

async function post(
	action: 'refreshFeed' | 'refreshAll',
	feedId?: string
): Promise<RefreshOutcome> {
	const body = new FormData();
	if (feedId) body.set('feedId', feedId);
	const response = await fetch(`${resolve('/(app)/feeds')}?/${action}`, {
		method: 'POST',
		body,
		headers: { 'x-sveltekit-action': 'true' }
	});
	const result = deserialize(await response.text());
	const message =
		(result.type === 'success' || result.type === 'failure') &&
		typeof result.data?.message === 'string'
			? result.data.message
			: undefined;
	if (result.type === 'success' && result.data?.success !== false) {
		// The action reports per-feed failures inside a successful result.
		return { kind: refreshMessageKind(message), message: message ?? 'Refreshed.' };
	}
	return { kind: 'error', message: message ?? 'Could not refresh. Try again.' };
}

/** Refresh the open view with the existing refresh actions: a feed, the feeds of a folder, or
 * everything. Shows one result toast and reloads the list data (scroll and open article stay). */
export async function refresh() {
	if (refreshing) return;
	const target = refreshTarget(context);
	if (!target) return;
	refreshing = true;
	try {
		let outcome: RefreshOutcome;
		const folderFeeds = context?.view === 'folder' ? context.folderFeedIds : undefined;
		if (target.kind === 'feed') outcome = await post('refreshFeed', target.id);
		else if (folderFeeds) {
			const outcomes = [];
			for (const id of folderFeeds) outcomes.push(await post('refreshFeed', id));
			const worst =
				outcomes.find((o) => o.kind === 'error') ??
				outcomes.find((o) => o.kind === 'warning') ??
				outcomes.find((o) => o.kind === 'success') ??
				outcomes[0];
			outcome = worst ?? { kind: 'info', message: 'No feeds in this folder.' };
		} else outcome = await post('refreshAll');
		toast[outcome.kind](outcome.message);
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

/** Where the open article sits in the list it was opened from (for the toolbar and swipes). */
export function readerPosition() {
	const current = context;
	const index = current?.selectedId ? current.articleIds.indexOf(current.selectedId) : -1;
	const count = current?.articleIds.length ?? 0;
	return {
		index,
		count,
		hasMore: !!current?.hasMore,
		canPrevious: index > 0,
		canNext: index >= 0 && (index < count - 1 || !!current?.hasMore)
	};
}

/** Warm the neighbors' item data so a swipe or button lands without a spinner. */
export function preloadNeighbors() {
	const current = context;
	if (!current?.selectedId) return;
	const index = current.articleIds.indexOf(current.selectedId);
	if (index < 0) return;
	for (const id of [current.articleIds[index - 1], current.articleIds[index + 1]]) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefFor() wraps resolve().
		if (id) void preloadData(current.hrefFor(id)).catch(() => {});
	}
}

/** Open the next (1) or previous (-1) article of the list. Resolves true when it moved. */
export async function moveArticle(direction: 1 | -1): Promise<boolean> {
	const current = context;
	if (!current) return false;
	let ids = current.articleIds;
	let index = adjacentIndex(ids, current.selectedId, direction);
	// At the end of the loaded list: fetch the next page and continue into it.
	if (index === null && direction === 1 && current.hasMore) {
		const loaded = await current.loadMore();
		if (!loaded) return false;
		ids = loaded;
		index = adjacentIndex(ids, current.selectedId, direction);
	}
	if (index === null) return false;
	// reset: false keeps the list scroll and focus where they are; the workspace scrolls the selected row into view.
	// replaceState: paging between articles must not add history entries, so Back returns to the list in one step.
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- hrefFor() wraps resolve().
	await goto(current.hrefFor(ids[index]), { reset: false, replaceState: !!current.selectedId });
	return true;
}

function run(action: ShortcutAction, openHelp: () => void) {
	const current = context;
	switch (action) {
		case 'next':
			return void moveArticle(1);
		case 'previous':
			return void moveArticle(-1);
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
