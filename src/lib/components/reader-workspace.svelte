<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { BookOpen, Rss, Search, Star, Circle, CheckCheck } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import SearchBox from '#lib/components/search-box.svelte';
	import { itemHref } from '#lib/reader-paths.ts';
	import { EXTRA_PAGE_SIZE, loadChunked, withOpenArticle } from '#lib/reader-list.ts';
	import { isRead, isStarred, markViewRead } from '#lib/reader-state.svelte.ts';
	import type { ArticlePreview, HighlightSegment, ReaderData, ReaderItem } from '#lib/reader.ts';
	let {
		data,
		children
	}: {
		data: ReaderData;
		/** The nested route: the open article (the list itself has nothing to render). */
		children: Snippet;
	} = $props();

	let itemId = $derived(page.params.itemId);
	let selectedItem = $derived((page.data as { selectedItem?: ReaderItem }).selectedItem);

	// Pages loaded beyond the layout's first page. They are refetched alongside it on sync.
	let extras = $state<ArticlePreview[]>([]);
	let extrasHasMore = $state(false);
	let loadingMore = $state(false);
	let hasMore = $derived(extras.length ? extrasHasMore : data.hasMore);

	// The open article always stays listed (even when it stops matching Unread/Starred or sits
	// beyond the loaded pages) until navigation away.
	let articles = $derived(withOpenArticle([...data.articles, ...extras], selectedItem));
	let unreadInView = $derived(articles.filter((article) => !isRead(article)).length);

	type WireArticle = Omit<ArticlePreview, 'publishedAt' | 'sortAt'> & {
		publishedAt: number | null;
		sortAt: number;
	};
	async function fetchAfter(after: ArticlePreview, limit: number) {
		const query = new URL('/api/articles', location.origin);
		query.searchParams.set('view', data.view);
		query.searchParams.set('afterSortAt', String(after.sortAt.getTime()));
		query.searchParams.set('afterId', after.id);
		query.searchParams.set('limit', String(limit));
		if (data.viewId) query.searchParams.set('id', data.viewId);
		if (data.view === 'search') query.searchParams.set('q', data.query ?? '');
		const response = await fetch(query);
		if (!response.ok) throw new Error(`Request failed (${response.status})`);
		const body = (await response.json()) as { articles: WireArticle[]; hasMore: boolean };
		return {
			hasMore: body.hasMore,
			articles: body.articles.map((article) => ({
				...article,
				publishedAt: article.publishedAt === null ? null : new Date(article.publishedAt),
				sortAt: new Date(article.sortAt)
			}))
		};
	}

	// Load more and sync refreshes run one at a time so neither discards the other's result.
	let queue: Promise<unknown> = Promise.resolve();
	function enqueue(task: () => Promise<void>) {
		queue = queue.then(task, task);
		return queue;
	}

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		try {
			await enqueue(async () => {
				const last = extras.at(-1) ?? data.articles.at(-1);
				if (!last) return;
				try {
					const result = await fetchAfter(last, EXTRA_PAGE_SIZE);
					extras = [...extras, ...result.articles];
					extrasHasMore = result.hasMore;
				} catch {
					toast.error('Could not load more articles. Try again.');
				}
			});
		} finally {
			loadingMore = false;
		}
	}

	// When the first page is reloaded (mutation, focus, poll), reload the extra pages behind it
	// (in chunks the server accepts) so they never show stale read/star state or departed items.
	$effect(() => {
		if (!data.articles.length || untrack(() => extras.length) === 0) return;
		void enqueue(async () => {
			const last = data.articles.at(-1);
			const count = extras.length;
			if (!last || count === 0) return;
			try {
				const result = await loadChunked(fetchAfter, last, count);
				extras = result.articles;
				extrasHasMore = result.hasMore;
			} catch {
				// Keep what is shown; the next sync retries.
			}
		});
	});

	function dateLabel(date: Date) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(date);
	}
	async function markAll(olderThanDays?: number) {
		const ok = await markViewRead(data, articles, olderThanDays);
		if (ok)
			toast.success(
				olderThanDays === undefined ? 'Marked all as read' : 'Marked older articles as read'
			);
	}
</script>

{#snippet parts(segments: HighlightSegment[])}
	<!-- Plain text segments, escaped by Svelte; <mark> only wraps matched terms. -->
	<!-- One wrapper element: the title and description containers are flex boxes with a gap. -->
	<span
		>{#each segments as segment, index (index)}{#if segment.match}<mark
					class="rounded-sm bg-yellow-200 text-foreground dark:bg-yellow-500/40"
					>{segment.text}</mark
				>{:else}{segment.text}{/if}{/each}</span
	>
{/snippet}

<svelte:head
	>{#if !itemId}<title
			>{data.view === 'search' && data.query ? `Search: ${data.query}` : data.viewTitle} · RSS Reader</title
		>{/if}</svelte:head
>

<!-- Both panes render once; CSS picks which is visible so SSR/first paint match the viewport.
	On phones the list is hidden with visibility (not display) while an article is open, so it
	keeps its scroll position for the way back. -->
<div class="relative flex h-full min-w-0">
	<div
		class="h-full min-w-0 flex-1 min-[1150px]:w-[22rem] lg:w-[19rem] lg:max-w-md lg:flex-none lg:border-r xl:w-[26rem] {itemId
			? 'max-lg:invisible max-lg:absolute max-lg:inset-0'
			: ''}"
	>
		<section aria-label={data.viewTitle} class="flex h-full min-w-0 flex-col">
			<header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-5">
				{#if data.view === 'search'}
					<h1 class="sr-only">{data.viewTitle}</h1>
					<SearchBox value={data.query ?? ''} autofocus={!data.query} class="min-w-0 flex-1" />
				{:else}
					<h1 class="truncate text-lg font-semibold tracking-tight">{data.viewTitle}</h1>
				{/if}
				{#if data.view !== 'search'}<DropdownMenu.Root>
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
					</DropdownMenu.Root>{/if}
			</header>
			<ScrollArea class="min-h-0 flex-1">
				{#if articles.length}
					<Item.Group class="min-w-0 p-2">
						{#each articles as article (article.id)}
							{@const read = isRead(article)}
							<Item.Root
								variant={itemId === article.id ? 'muted' : 'default'}
								size="sm"
								role="listitem"
							>
								{#snippet child({ props })}
									<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() wraps resolve() for the per-view item route. -->
									<a
										{...props}
										href={itemHref(data, article.id)}
										aria-current={itemId === article.id ? 'page' : undefined}
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
													{#if article.publishedAt}<time
															datetime={article.publishedAt.toISOString()}
															>{dateLabel(article.publishedAt)}</time
														>{/if}
												</span>
											</div>
											<Item.Title
												class={read ? 'font-normal text-muted-foreground' : 'font-semibold'}
											>
												{#if article.titleParts}{@render parts(
														article.titleParts
													)}{:else}{article.title}{/if}
											</Item.Title>
											{#if article.snippetParts}<Item.Description>
													{@render parts(article.snippetParts)}
												</Item.Description>{:else if article.summary}<Item.Description>
													{article.summary}
												</Item.Description>{/if}
										</Item.Content>
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
								{/snippet}
							</Item.Root>
						{/each}
					</Item.Group>
					{#if hasMore}
						<div class="flex justify-center p-3">
							<Button variant="outline" size="sm" disabled={loadingMore} onclick={loadMore}
								>{loadingMore ? 'Loading…' : 'Load more'}</Button
							>
						</div>
					{/if}
				{:else if data.view === 'search'}
					<Empty.Root class="py-16"
						><Empty.Header
							><Empty.Media variant="icon"><Search /></Empty.Media><Empty.Title
								>{data.query ? 'No results' : 'Search your articles'}</Empty.Title
							><Empty.Description
								>{data.query
									? `Nothing matched “${data.query}”. Try different or fewer words.`
									: 'Type a word or phrase to search titles and article text.'}</Empty.Description
							></Empty.Header
						></Empty.Root
					>
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
	</div>
	<div class="h-full min-w-0 flex-1 {itemId ? '' : 'hidden lg:block'}">
		{#if itemId}
			{@render children()}
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
	</div>
</div>
