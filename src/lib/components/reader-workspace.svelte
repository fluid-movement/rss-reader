<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ExternalLink,
		Share2,
		BookOpen,
		Rss,
		Star,
		Circle,
		CheckCheck,
		MailOpen,
		Mail
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import { shareArticle } from '#lib/share.ts';
	import { itemHref, listHref } from '#lib/reader-paths.ts';
	import { isRead, isStarred, markViewRead, updateArticle } from '#lib/reader-state.svelte.ts';
	import type { ReaderData } from '#lib/reader.ts';
	let { data }: { data: ReaderData } = $props();
	let sharing = $state(false);
	let cameFromList = $state(false);
	let original = $derived(safeLink(data.selectedItem?.link));
	let backHref = $derived(listHref(data));
	let unreadInView = $derived(data.articles.filter((article) => !isRead(article)).length);

	afterNavigate(({ from, type }) => {
		// Only when the previous history entry is known to be this view's list.
		cameFromList = (type === 'link' || type === 'goto') && !!from && from.url.pathname === backHref;
	});

	// Opening an article in the reader marks it read once; scrolling the list never does.
	let autoMarked = '';
	$effect(() => {
		const selected = data.selectedItem;
		if (!selected || autoMarked === selected.id) return;
		autoMarked = selected.id;
		untrack(() => {
			if (!isRead(selected)) void updateArticle(selected, { read: true });
		});
	});

	function goBack(event: MouseEvent) {
		if (!cameFromList) return;
		event.preventDefault();
		history.back();
	}
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
	async function markAll(olderThanDays?: number) {
		const ok = await markViewRead(data, data.articles, olderThanDays);
		if (ok)
			toast.success(
				olderThanDays === undefined ? 'Marked all as read' : 'Marked older articles as read'
			);
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
		<header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-5">
			<h1 class="truncate text-lg font-semibold tracking-tight">{data.viewTitle}</h1>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					>{#snippet child({ props })}<Button
							{...props}
							variant="ghost"
							size="sm"
							disabled={unreadInView === 0}
							aria-label="Mark as read options"
							><CheckCheck data-icon="inline-start" />Mark read</Button
						>{/snippet}</DropdownMenu.Trigger
				>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onSelect={() => markAll()}>Mark all as read</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => markAll(1)}>Older than 1 day</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => markAll(7)}>Older than 1 week</DropdownMenu.Item>
					<DropdownMenu.Item onSelect={() => markAll(30)}>Older than 1 month</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</header>
		<ScrollArea class="min-h-0 flex-1">
			{#if data.articles.length}
				<Item.Group class="min-w-0 p-2">
					{#each data.articles as article (article.id)}
						{@const read = isRead(article)}
						<Item.Root
							variant={data.selectedItem?.id === article.id ? 'muted' : 'default'}
							size="sm"
							role="listitem"
						>
							{#snippet child({ props })}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() wraps resolve() for the per-view item route. -->
								<a
									{...props}
									href={itemHref(data, article.id)}
									aria-current={data.selectedItem?.id === article.id ? 'page' : undefined}
								>
									<Item.Content>
										<div
											class="flex items-center justify-between gap-3 text-xs text-muted-foreground"
										>
											<span class="flex min-w-0 items-center gap-1.5">
												{#if !read}<Circle
														class="size-2 shrink-0 fill-primary text-primary"
														aria-label="Unread"
													/>{/if}
												<span class="truncate">{article.feedTitle}</span>
											</span>
											<span class="flex shrink-0 items-center gap-2">
												{#if isStarred(article)}<Star
														class="size-3.5 fill-current text-amber-500"
														aria-label="Starred"
													/>{/if}
												{#if article.publishedAt}<time datetime={article.publishedAt.toISOString()}
														>{dateLabel(article.publishedAt)}</time
													>{/if}
											</span>
										</div>
										<Item.Title
											class={read ? 'font-normal text-muted-foreground' : 'font-semibold'}
										>
											{article.title}
										</Item.Title>
										{#if article.summary}<Item.Description>
												{article.summary}
											</Item.Description>{/if}
									</Item.Content>
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
							><Button href={resolve('/(app)/feeds')}>Add a feed</Button></Empty.Content
						>{/if}</Empty.Root
				>
			{/if}
		</ScrollArea>
	</section>
{/snippet}

{#snippet reader()}
	{#if data.selectedItem}
		{@const selected = data.selectedItem}
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

<!-- Both panes render once; CSS picks which is visible so SSR/first paint match the viewport. -->
<div class="flex h-full min-w-0">
	<div
		class="h-full min-w-0 flex-1 lg:w-[22rem] lg:max-w-md lg:flex-none lg:border-r xl:w-[26rem] {data.selectedItem
			? 'hidden lg:block'
			: ''}"
	>
		{@render articleList()}
	</div>
	<div class="h-full min-w-0 flex-1 {data.selectedItem ? '' : 'hidden lg:block'}">
		{@render reader()}
	</div>
</div>

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
