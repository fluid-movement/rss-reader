<script lang="ts">
	import FullTextArticle from '#lib/components/full-text-article.svelte';
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { ArrowLeft, ExternalLink, Share2, Star, MailOpen, Mail } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
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
		class="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
	>
		<Button href={backHref} onclick={goBack} variant="ghost" size="sm"
			><ArrowLeft data-icon="inline-start" />Back to {data.viewTitle}</Button
		>
		<div class="flex items-center gap-1">
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
	</header>
	<!-- Keyed so each article opens scrolled to its top. -->
	{#key selected.id}
		<ScrollArea class="min-h-0 min-w-0 flex-1">
			<article
				class="mx-auto flex w-full max-w-[var(--reader-width,720px)] min-w-0 flex-col gap-7 px-6 py-10 sm:px-10 lg:py-14"
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
						<div class="article-prose">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- html is sanitized by sanitize-html on the server. -->
							{@html html}
						</div>
					{/snippet}
				</FullTextArticle>
			</article>
		</ScrollArea>
	{/key}
</section>

<svelte:head><title>{selected.title} — {data.viewTitle} · RSS Reader</title></svelte:head>

<style>
	.article-prose {
		min-width: 0;
		font-size: var(--reader-font-size, 18px);
		line-height: 1.85;
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
		max-width: 100%;
		height: auto;
		border-radius: var(--radius);
	}
	.article-prose :global(iframe) {
		max-width: 100%;
	}
	.article-prose :global(pre) {
		max-width: 100%;
		overflow-x: auto;
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
		display: block;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
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
