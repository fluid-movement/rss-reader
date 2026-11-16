<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import {
		ArrowDownToLine,
		ArrowUpToLine,
		Copy,
		Ellipsis,
		ExternalLink,
		Mail,
		MailOpen,
		Share2,
		Star,
		StarOff
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { GESTURE_THRESHOLDS } from '#lib/gestures.ts';
	import { SwipeTracker } from '#lib/swipe-navigation.ts';
	import { shareArticle } from '#lib/share.ts';
	import { safeOriginalLink } from '#lib/shortcuts.ts';
	import { setArticlesRead, updateArticle } from '#lib/reader-state.svelte.ts';
	import type { ArticlePreview } from '#lib/reader.ts';

	type Row = Pick<ArticlePreview, 'id' | 'title' | 'feedId' | 'link' | 'read' | 'starred'>;

	let {
		article,
		href,
		selected,
		read,
		starred,
		above,
		below,
		children
	}: {
		article: Row;
		href: string;
		selected: boolean;
		read: boolean;
		starred: boolean;
		/** Loaded articles listed before / after this one (for mark above/below as read). */
		above: () => Row[];
		below: () => Row[];
		/** The row's visible content, rendered inside the link. */
		children: Snippet;
	} = $props();

	const LONG_PRESS_MS = 500;
	const LONG_PRESS_SLOP = 10;
	const MAX_OFFSET = 140;
	/** The row collapses this long when it leaves the list (for example read in Unread). */
	const COLLAPSE_MS = 220;
	const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

	let menuOpen = $state(false);
	let offset = $state(0);
	let dragging = $state(false);
	let original = $derived(safeOriginalLink(article.link));

	const tracker = new SwipeTracker({
		canStep: () => true,
		viewportWidth: () => window.innerWidth
	});
	let pointerId: number | null = null;
	let startX = 0;
	let startY = 0;
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let suppressClick = false;
	let lastPointerType = '';

	function stopPress() {
		clearTimeout(pressTimer);
		pressTimer = undefined;
	}
	function resetSwipe() {
		stopPress();
		tracker.cancel();
		pointerId = null;
		dragging = false;
		offset = 0;
	}

	function onpointerdown(event: PointerEvent) {
		lastPointerType = event.pointerType;
		suppressClick = false;
		if (event.pointerType !== 'touch') return;
		if (pointerId !== null) {
			// A second finger is not a row gesture.
			resetSwipe();
			return;
		}
		pointerId = event.pointerId;
		startX = event.clientX;
		startY = event.clientY;
		// The shared edge guard decides whether a swipe may start; a long press still works there.
		if (!tracker.down(event.clientX, event.clientY, event.timeStamp)) tracker.cancel();
		pressTimer = setTimeout(() => {
			suppressClick = true;
			resetSwipe();
			menuOpen = true;
		}, LONG_PRESS_MS);
	}

	function onpointermove(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		if (Math.hypot(event.clientX - startX, event.clientY - startY) > LONG_PRESS_SLOP) stopPress();
		const move = tracker.move(event.clientX, event.clientY, event.timeStamp);
		if (move.phase === 'vertical') {
			resetSwipe();
			return;
		}
		if (move.phase !== 'horizontal') return;
		if (!dragging) {
			dragging = true;
			try {
				(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			} catch {
				// Capture is a nicety; the swipe still works without it.
			}
		}
		offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, move.offset));
	}

	function onpointerup(event: PointerEvent) {
		if (event.pointerId !== pointerId) return;
		const wasDragging = dragging;
		// Right swipe is step -1 (read), left swipe is step 1 (star).
		const step = tracker.up(event.clientX, event.timeStamp);
		resetSwipe();
		if (!wasDragging) return;
		suppressClick = true;
		if (step === -1) void toggleRead();
		else if (step === 1) void toggleStar();
	}

	function onpointercancel(event: PointerEvent) {
		if (event.pointerId === pointerId) resetSwipe();
	}

	function onclickcapture(event: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	// Long press on Android also raises contextmenu; keep the native menu from covering ours.
	function oncontextmenu(event: MouseEvent) {
		if (lastPointerType !== 'touch') return;
		event.preventDefault();
		suppressClick = true;
		resetSwipe();
		menuOpen = true;
	}

	async function toggleRead() {
		const next = !read;
		if (!(await updateArticle(article, { read: next }))) return;
		toast(next ? 'Marked as read' : 'Marked as unread', {
			action: { label: 'Undo', onClick: () => void updateArticle(article, { read: !next }) }
		});
	}

	async function toggleStar() {
		const next = !starred;
		if (!(await updateArticle(article, { starred: next }))) return;
		toast(next ? 'Starred' : 'Unstarred', {
			action: { label: 'Undo', onClick: () => void updateArticle(article, { starred: !next }) }
		});
	}

	async function markRelative(rows: Row[], label: string) {
		const affected = rows.filter((row) => !row.read);
		if (!affected.length) return;
		if (!(await setArticlesRead(affected, true))) return;
		const count = affected.length;
		toast(`Marked ${count} ${count === 1 ? 'article' : 'articles'} ${label} as read`, {
			action: { label: 'Undo', onClick: () => void setArticlesRead(affected, false) }
		});
	}

	async function share() {
		if (!original) return;
		try {
			const result = await shareArticle({ title: article.title, url: original });
			if (result === 'copied') toast.success('Link copied to clipboard');
		} catch {
			toast.error('Could not share this article. Try opening the original instead.');
		}
	}

	async function copyLink() {
		if (!original) return;
		try {
			await navigator.clipboard.writeText(original);
			toast.success('Link copied to clipboard');
		} catch {
			toast.error('Could not copy the link.');
		}
	}

	function openOriginal() {
		if (original) window.open(original, '_blank', 'noopener,noreferrer');
	}

	let committed = $derived(Math.abs(offset) >= GESTURE_THRESHOLDS.commitDistance);
	// Read (and starred) rows in the menu need current state, so the rows are recomputed on open.
	let aboveUnread = $derived(menuOpen ? above().some((row) => !row.read) : true);
	let belowUnread = $derived(menuOpen ? below().some((row) => !row.read) : true);
</script>

<div
	role="listitem"
	class="relative overflow-hidden rounded-lg"
	out:slide|local={{ duration: reducedMotion() ? 0 : COLLAPSE_MS }}
>
	<!-- The action revealed under the row while it is dragged. -->
	<div aria-hidden="true" class="pointer-events-none absolute inset-0 flex items-center">
		{#if offset > 0}
			<div
				class="flex h-full w-full items-center justify-start text-sm font-medium {committed
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground'}"
			>
				<span class="flex w-24 shrink-0 flex-col items-center gap-1 text-center">
					{#if read}<Mail class="size-5" />Unread{:else}<MailOpen class="size-5" />Read{/if}
				</span>
			</div>
		{:else if offset < 0}
			<div
				class="flex h-full w-full items-center justify-end text-sm font-medium {committed
					? 'bg-primary text-primary-foreground'
					: 'bg-muted text-muted-foreground'}"
			>
				<span class="flex w-24 shrink-0 flex-col items-center gap-1 text-center">
					{#if starred}<StarOff class="size-5" />Unstar{:else}<Star class="size-5" />Star{/if}
				</span>
			</div>
		{/if}
	</div>
	<!-- Touch gestures are an extra; every action is also in the row menu. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="relative touch-pan-y bg-background {dragging
			? ''
			: 'transition-transform duration-150 ease-out motion-reduce:transition-none'}"
		style:transform={offset ? `translate3d(${offset}px,0,0)` : undefined}
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onpointercancel}
		{onclickcapture}
		{oncontextmenu}
	>
		<Item.Root variant={selected ? 'muted' : 'default'} size="sm">
			{#snippet child({ props })}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- href comes from itemHref(), which wraps resolve(). -->
				<a
					{...props}
					{href}
					data-sveltekit-preload-data="tap"
					draggable="false"
					class="{props.class} pr-12 [-webkit-touch-callout:none] active:opacity-70 pointer-coarse:select-none"
					aria-current={selected ? 'page' : undefined}
				>
					{@render children()}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/snippet}
		</Item.Root>
		<DropdownMenu.Root bind:open={menuOpen}>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="absolute top-1/2 right-0.5 size-11 -translate-y-1/2 text-muted-foreground"
						aria-label={`Actions for ${article.title}`}><Ellipsis /></Button
					>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-52">
				<DropdownMenu.Item onSelect={toggleRead}>
					{#if read}<Mail />Mark as unread{:else}<MailOpen />Mark as read{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={toggleStar}>
					{#if starred}<StarOff />Unstar{:else}<Star />Star{/if}
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item disabled={!original} onSelect={share}><Share2 />Share</DropdownMenu.Item>
				<DropdownMenu.Item disabled={!original} onSelect={openOriginal}
					><ExternalLink />Open original</DropdownMenu.Item
				>
				<DropdownMenu.Item disabled={!original} onSelect={copyLink}
					><Copy />Copy link</DropdownMenu.Item
				>
				<DropdownMenu.Separator />
				<DropdownMenu.Item disabled={!aboveUnread} onSelect={() => markRelative(above(), 'above')}
					><ArrowUpToLine />Mark above as read</DropdownMenu.Item
				>
				<DropdownMenu.Item disabled={!belowUnread} onSelect={() => markRelative(below(), 'below')}
					><ArrowDownToLine />Mark below as read</DropdownMenu.Item
				>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</div>
</div>
