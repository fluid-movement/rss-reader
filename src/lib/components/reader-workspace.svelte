<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: off -- Server-provided reader paths append to the resolved app root so nested views retain their route context. */
	import { MediaQuery } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { ArrowLeft, ExternalLink, Share2, BookOpen, Rss } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Resizable from '#lib/components/ui/resizable/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import { shareArticle } from '#lib/share.ts';
	import type { ReaderData } from '#lib/reader.ts';
	let { data }: { data: ReaderData } = $props();
	const desktop = new MediaQuery('(min-width: 1024px)', false);
	let sharing = $state(false);
	let original = $derived(safeLink(data.selectedItem?.link));
	function safeLink(link: string | null | undefined) {
		if (!link) return null;
		try {
			const url = new URL(link);
			return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
		} catch {
			return null;
		}
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
		if (!original || !data.selectedItem || sharing) return;
		sharing = true;
		try {
			const result = await shareArticle({ title: data.selectedItem.title, url: original });
			if (result === 'copied') toast.success('Link copied to clipboard');
		} catch {
			toast.error('Could not share this article. Try opening the original instead.');
		} finally {
			sharing = false;
		}
	}
</script>

<svelte:head
	><title
		>{data.selectedItem ? `${data.selectedItem.title} — ` : ''}{data.viewTitle} · RSS Reader</title
	></svelte:head
>

{#snippet articleList()}
	<section aria-label={data.viewTitle} class="flex h-full min-w-0 flex-col">
		<header class="flex h-16 shrink-0 items-center border-b px-5">
			<h1 class="truncate text-lg font-semibold tracking-tight">{data.viewTitle}</h1>
		</header>
		<ScrollArea class="min-h-0 flex-1">
			{#if data.articles.length}
				<Item.Group class="min-w-0 p-2">
					{#each data.articles as article (article.id)}
						<Item.Root
							variant={data.selectedItem?.id === article.id ? 'muted' : 'default'}
							size="sm"
							role="listitem"
						>
							{#snippet child({ props })}
								<a
									{...props}
									href={`${resolve('/(app)').replace(/\/$/, '')}${data.listPath === '/' ? '' : data.listPath}/item/${article.id}`}
									aria-current={data.selectedItem?.id === article.id ? 'page' : undefined}
								>
									<Item.Content>
										<div
											class="flex items-center justify-between gap-3 text-xs text-muted-foreground"
										>
											<span class="truncate">{article.feedTitle}</span
											>{#if article.publishedAt}<time
													class="shrink-0"
													datetime={article.publishedAt.toISOString()}
													>{dateLabel(article.publishedAt)}</time
												>{/if}
										</div>
										<Item.Title>
											{article.title}
										</Item.Title>
										{#if article.summary}<Item.Description>
												{article.summary}
											</Item.Description>{/if}
									</Item.Content>
								</a>
							{/snippet}
						</Item.Root>
					{/each}
				</Item.Group>
			{:else}
				<Empty.Root class="py-16"
					><Empty.Header
						><Empty.Media variant="icon"><Rss /></Empty.Media><Empty.Title
							>{data.hasFeeds ? 'No articles here yet' : 'Your reading space awaits'}</Empty.Title
						><Empty.Description
							>{data.hasFeeds
								? 'Articles in this view will appear here when available.'
								: 'Add your first feed to start following the sites you love.'}</Empty.Description
						></Empty.Header
					>{#if !data.hasFeeds}<Empty.Content
							><Button href="/feeds">Add a feed</Button></Empty.Content
						>{/if}</Empty.Root
				>
			{/if}
		</ScrollArea>
	</section>
{/snippet}

{#snippet reader()}
	{#if data.selectedItem}
		<section aria-label="Article reader" class="flex h-full min-w-0 flex-col">
			<header
				class="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2"
			>
				<Button
					href={`${resolve('/(app)').replace(/\/$/, '')}${data.listPath}`}
					variant="ghost"
					size="sm"><ArrowLeft data-icon="inline-start" />Back to {data.viewTitle}</Button
				>
				<div class="flex items-center gap-1">
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
			<ScrollArea class="min-h-0 min-w-0 flex-1">
				<article
					class="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-7 px-6 py-10 sm:px-10 lg:py-14"
				>
					<header class="flex min-w-0 flex-col gap-4">
						<p class="text-sm font-medium text-muted-foreground">{data.selectedItem.feedTitle}</p>
						<h1 class="text-3xl leading-tight font-semibold tracking-tight break-words sm:text-4xl">
							{data.selectedItem.title}
						</h1>
						<div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
							{#if data.selectedItem.author}<span>{data.selectedItem.author}</span
								>{/if}{#if data.selectedItem.publishedAt}<time
									datetime={data.selectedItem.publishedAt.toISOString()}
									>{dateLabel(data.selectedItem.publishedAt)}</time
								>{/if}
						</div>
					</header>
					<!-- Only the server-sanitized article body may be rendered as HTML. -->
					<div class="article-prose">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitizedContent is sanitized by sanitize-html on the server. -->
						{@html data.selectedItem.sanitizedContent}
					</div>
				</article>
			</ScrollArea>
		</section>
	{:else}
		<Empty.Root class="h-full"
			><Empty.Header
				><Empty.Media variant="icon"><BookOpen /></Empty.Media><Empty.Title
					>A little space to read</Empty.Title
				><Empty.Description>Select an article from the list to start reading.</Empty.Description
				></Empty.Header
			></Empty.Root
		>
	{/if}
{/snippet}

{#if desktop.current}
	<Resizable.PaneGroup direction="horizontal">
		<Resizable.Pane defaultSize={35} minSize={25} maxSize={55}
			>{@render articleList()}</Resizable.Pane
		>
		<Resizable.Handle />
		<Resizable.Pane defaultSize={65} minSize={35}>{@render reader()}</Resizable.Pane>
	</Resizable.PaneGroup>
{:else if data.selectedItem}
	{@render reader()}
{:else}
	{@render articleList()}
{/if}

<style>
	.article-prose {
		min-width: 0;
		font-size: 1rem;
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
