<script lang="ts">
	import FullTextArticle from '#lib/components/full-text-article.svelte';
	import ArticleImageViewer from '#lib/components/article-image-viewer.svelte';
	import { enhanceArticle, nextToolbarState } from '#lib/reader-enhancements.ts';
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { ArrowLeft, ExternalLink, Share2, Star, MailOpen, Mail } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { shareArticle } from '#lib/share.ts';
	import { safeOriginalLink } from '#lib/shortcuts.ts';
	import { listHref } from '#lib/reader-paths.ts';
	import { isRead, isStarred, updateArticle } from '#lib/reader-state.svelte.ts';
	import type { ReaderItemData } from '#lib/reader.ts';
	let { data }: { data: ReaderItemData } = $props();
	let sharing = $state(false);
	let cameFromList = $state(false);
	let selected = $derived(data.selectedItem);
	let original = $derived(safeOriginalLink(selected.link));
	let backHref = $derived(listHref(data));
	let image = $state<{ src: string; alt: string; trigger: HTMLElement } | null>(null);
	let collapsed = $state(false);
	let headerFocused = $state(false);
	let scrollAnchor = 0;
	let scrollArticleId = '';
	function trackScroll(event: Event) {
		const el = event.currentTarget as HTMLElement;
		if (scrollArticleId !== selected.id) {
			scrollArticleId = selected.id;
			scrollAnchor = 0;
			collapsed = false;
		}
		const next = nextToolbarState({
			top: el.scrollTop,
			clientHeight: el.clientHeight,
			scrollHeight: el.scrollHeight,
			anchor: scrollAnchor,
			collapsed
		});
		collapsed = next.collapsed;
		scrollAnchor = next.anchor;
	}

	afterNavigate(({ from, type }) => {
		// Only when the previous history entry is known to be this view's list.
		cameFromList =
			(type === 'link' || type === 'goto') &&
			!!from &&
			from.url.pathname + from.url.search === backHref;
	});

	// Opening an article in the reader marks it read once; scrolling the list never does.
	let autoMarked = '';
	$effect(() => {
		const item = data.selectedItem;
		if (autoMarked === item.id) return;
		autoMarked = item.id;
		untrack(() => {
			if (!isRead(item)) void updateArticle(item, { read: true });
		});
	});

	function goBack(event: MouseEvent) {
		if (!cameFromList) return;
		event.preventDefault();
		history.back();
	}
	function dateLabel(date: Date) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(date);
	}
	async function share() {
		if (!original || sharing) return;
		sharing = true;
		try {
			const result = await shareArticle({ title: selected.title, url: original });
			if (result === 'copied') toast.success('Link copied to clipboard');
		} catch {
			toast.error('Could not share this article. Try opening the original instead.');
		} finally {
			sharing = false;
		}
	}
</script>

<section aria-label="Article reader" class="flex h-full min-w-0 flex-col">
	<header
		class="reader-toolbar shrink-0 border-b px-4 py-2"
		onfocusin={() => {
			headerFocused = true;
		}}
		onfocusout={(event) => {
			if (!event.currentTarget.contains(event.relatedTarget as Node | null)) headerFocused = false;
		}}
	>
		<Button
			href={backHref}
			onclick={goBack}
			variant="ghost"
			size="sm"
			class="min-h-11 max-w-full whitespace-normal"
			><ArrowLeft data-icon="inline-start" />Back to {data.viewTitle}</Button
		>
		<div class="action-slot">
			<div
				data-reader-actions
				class="reader-actions flex flex-wrap items-center gap-1 [&_a]:min-h-11 [&_button]:min-h-11"
				data-collapsed={collapsed && !headerFocused}
				inert={collapsed && !headerFocused}
			>
				<Button
					variant="ghost"
					size="sm"
					aria-pressed={isStarred(selected)}
					onclick={() => updateArticle(selected, { starred: !isStarred(selected) })}
					><Star
						data-icon="inline-start"
						class={isStarred(selected) ? 'fill-current text-amber-500' : ''}
					/>{isStarred(selected) ? 'Starred' : 'Star'}</Button
				>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => updateArticle(selected, { read: !isRead(selected) })}
					>{#if isRead(selected)}<Mail data-icon="inline-start" />Mark unread{:else}<MailOpen
							data-icon="inline-start"
						/>Mark read{/if}</Button
				>
				{#if original}<Button
						href={original}
						target="_blank"
						rel="noopener noreferrer"
						variant="ghost"
						size="sm"><ExternalLink data-icon="inline-start" />Original</Button
					>{/if}
				<Button variant="ghost" size="sm" onclick={share} disabled={!original || sharing}
					><Share2 data-icon="inline-start" />Share</Button
				>
			</div>
		</div>
	</header>
	<!-- Keyed so each article opens scrolled to its top. -->
	{#key selected.id}
		<div
			data-reader-scroller
			class="reader-scroll min-h-0 min-w-0 flex-1 overflow-y-auto"
			onscroll={trackScroll}
			{@attach () => {
				collapsed = false;
				scrollAnchor = 0;
			}}
		>
			<article
				class="reader-content mx-auto flex w-full max-w-[var(--reader-width,720px)] min-w-0 flex-col gap-7 px-5 py-8 sm:px-10 lg:py-14"
			>
				<header class="flex min-w-0 flex-col gap-4">
					<p class="text-sm font-medium text-muted-foreground">{selected.feedTitle}</p>
					<h1 class="text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl">
						{selected.title}
					</h1>
					<div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
						{#if selected.author}<span>{selected.author}</span>{/if}{#if selected.publishedAt}<time
								datetime={selected.publishedAt.toISOString()}
								>{dateLabel(selected.publishedAt)}</time
							>{/if}
					</div>
				</header>
				<!-- Only the server-sanitized article body may be rendered as HTML. -->
				<FullTextArticle item={selected}>
					{#snippet body(html)}
						{#key html}
							<div
								class="article-prose"
								{@attach (node) =>
									enhanceArticle(
										node,
										(next) => {
											image = next;
										},
										original
									)}
							>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is sanitized by sanitize-html on the server. -->
								{@html html}
							</div>
						{/key}
					{/snippet}
				</FullTextArticle>
			</article>
		</div>
	{/key}
</section>

{#if image}<ArticleImageViewer
		{image}
		onclose={() => {
			image = null;
		}}
	/>{/if}

<svelte:head><title>{selected.title} — {data.viewTitle} · RSS Reader</title></svelte:head>

<style>
	.reader-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.25rem 0.5rem;
	}
	.action-slot {
		min-width: 0;
		overflow: hidden;
	}
	.reader-actions {
		transition:
			transform 160ms ease,
			opacity 160ms ease;
	}
	.reader-actions[data-collapsed='true'] {
		transform: translateY(-110%);
		opacity: 0;
	}
	.reader-scroll {
		overscroll-behavior-y: contain;
		overflow-x: hidden;
		scrollbar-gutter: stable;
	}
	.reader-content {
		overflow-wrap: anywhere;
	}
	@media (max-width: 639px) {
		.reader-toolbar {
			display: block;
			position: relative;
			z-index: 1;
			background: var(--background);
		}
		.action-slot {
			height: 0;
			overflow: visible;
		}
		.reader-actions {
			position: absolute;
			inset-inline: 0;
			top: 100%;
			height: 48px;
			padding-inline: 1rem;
			background: var(--background);
			border-bottom: 1px solid var(--border);
			flex-wrap: nowrap;
			justify-content: space-between;
			gap: 0;
		}
		.reader-actions :global(button),
		.reader-actions :global(a) {
			padding-inline: 0.5rem;
			font-size: 0.75rem;
		}
		.reader-actions :global(svg) {
			display: none;
		}
		.reader-scroll {
			position: relative;
			z-index: 0;
		}
		.reader-content {
			padding-top: calc(2rem + 48px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.reader-actions {
			transition: none;
		}
	}
	.article-prose {
		min-width: 0;
		max-width: 100%;
		font-size: var(--reader-font-size, 18px);
		line-height: 1.75;
		overflow-wrap: anywhere;
	}
	.article-prose :global(> * + *) {
		margin-top: 1.25em;
	}
	.article-prose :global(h1),
	.article-prose :global(h2),
	.article-prose :global(h3),
	.article-prose :global(h4) {
		font-weight: 650;
		line-height: 1.3;
		margin-top: 1.8em;
	}
	.article-prose :global(h1) {
		font-size: 1.8em;
	}
	.article-prose :global(h2) {
		font-size: 1.5em;
	}
	.article-prose :global(h3) {
		font-size: 1.25em;
	}
	.article-prose :global(a) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.article-prose :global(img),
	.article-prose :global(video) {
		max-width: 100% !important;
		min-width: 0 !important;
		height: auto !important;
		border-radius: var(--radius);
	}
	.article-prose :global(iframe) {
		max-width: 100%;
	}
	.article-prose :global(pre) {
		width: max-content !important;
		min-width: 100% !important;
		max-width: none !important;
		padding: 1rem;
		border-radius: var(--radius);
		background: var(--muted);
		font-size: 0.85em;
		white-space: pre;
		overflow-wrap: normal;
	}
	.article-prose :global(code) {
		font-size: 0.9em;
	}
	.article-prose :global(table) {
		width: max-content !important;
		min-width: 100% !important;
		max-width: none !important;
		border-collapse: collapse;
	}
	.article-prose :global(figure) {
		width: auto !important;
		max-width: 100% !important;
		min-width: 0 !important;
		margin-inline: 0;
	}
	.article-prose :global(.article-scroll-region) {
		max-width: 100%;
		min-width: 0;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		touch-action: pan-x pan-y;
	}
	.article-prose :global(img[role='button']) {
		cursor: zoom-in;
	}
	.article-prose :global(:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 3px;
	}
	.article-prose :global(.embed-placeholder a),
	.article-prose :global(.removed-embed a),
	.article-prose :global([data-embed-placeholder] a) {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		margin-block: 0.25rem;
		padding: 0.5rem;
	}
	.article-prose :global(th),
	.article-prose :global(td) {
		padding: 0.6em 0.8em;
		border: 1px solid var(--border);
	}
	.article-prose :global(blockquote) {
		border-left: 3px solid var(--border);
		padding-left: 1.25em;
		color: var(--muted-foreground);
	}
	.article-prose :global(ul) {
		list-style: disc;
		padding-left: 1.5em;
	}
	.article-prose :global(ol) {
		list-style: decimal;
		padding-left: 1.5em;
	}
	.article-prose :global(li + li) {
		margin-top: 0.4em;
	}
	.article-prose :global(figcaption) {
		margin-top: 0.5em;
		font-size: 0.85em;
		color: var(--muted-foreground);
	}
</style>
