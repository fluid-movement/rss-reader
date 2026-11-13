<script lang="ts">
	import type { Snippet } from 'svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { BookOpen, Rss, Search, Star, Circle, CheckCheck, TriangleAlert } from '@lucide/svelte';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { feedFailure } from '#lib/reader.ts';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '#lib/components/ui/empty/index.js';
	import * as Item from '#lib/components/ui/item/index.js';
	import { ScrollArea } from '#lib/components/ui/scroll-area/index.js';
	import SearchBox from '#lib/components/search-box.svelte';
	import { itemHref } from '#lib/reader-paths.ts';
	import { setReaderShortcutContext } from '#lib/shortcut-handler.svelte.ts';
	import { EXTRA_PAGE_SIZE, loadChunked, withOpenArticle } from '#lib/reader-list.ts';
	import ArticleRow from '#lib/components/article-row.svelte';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import {
		isRead,
		isStarred,
		markViewRead,
		undoMarkRead,
		unreadAffected
	} from '#lib/reader-state.svelte.ts';
	import type {
		ArticlePreview,
		HighlightSegment,
		ReaderData,
		ReaderItem,
		ShellData
	} from '#lib/reader.ts';
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
	let failure = $derived(
		data.view === 'feed'
			? feedFailure(
					(page.data as Pick<ShellData, 'feeds'>).feeds?.find((feed) => feed.id === data.viewId)
				)
			: null
	);
	let retrying = $state(false);
	const retry: SubmitFunction = ({ cancel }) => {
		if (retrying) {
			cancel();
			return;
		}
		retrying = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					toast.error('Could not refresh. Try again.');
					return;
				}
				if ((result.type === 'success' || result.type === 'failure') && result.data?.message) {
					const message = String(result.data.message);
					if (
						result.type === 'failure' ||
						result.data.success === false ||
						message.includes('refresh failed')
					)
						toast.error(message);
					else if (message === 'Refreshed recently, try again in a moment.') toast.info(message);
					else toast.success(message);
				}
				await update({ navigate: false, refreshAll: true, reset: false });
			} finally {
				retrying = false;
			}
		};
	};

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

	// Tell the shell's keyboard shortcuts what is listed and open (j/k, m, s, o, r).
	$effect(() => {
		setReaderShortcutContext({
			view: data.view,
			viewId: data.viewId,
			articleIds: articles.map((article) => article.id),
			selectedId: itemId,
			selected: selectedItem ?? articles.find((article) => article.id === itemId),
			hasMore,
			loadMore: async () => {
				await loadMore();
				return articles.map((article) => article.id);
			},
			hrefFor: (id) => itemHref(data, id)
		});
		return () => setReaderShortcutContext(null);
	});

	// Keep the open row visible without moving the list otherwise (also for keyboard j/k).
	let listElement = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!itemId) return;
		listElement
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});

	function dateLabel(date: Date) {
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(date);
	}
	/** Mark all read above this many affected items asks first. */
	const CONFIRM_ABOVE = 10;
	let confirmMark = $state<{ olderThanDays?: number; count: number } | null>(null);

	function requestMarkAll(olderThanDays?: number) {
		const count = unreadAffected(articles, olderThanDays).length;
		if (count > CONFIRM_ABOVE) confirmMark = { olderThanDays, count };
		else void markAll(olderThanDays);
	}
	async function markAll(olderThanDays?: number) {
		const ids = await markViewRead(data, articles, olderThanDays);
		if (!ids) return;
		toast(olderThanDays === undefined ? 'Marked all as read' : 'Marked older articles as read', {
			action: { label: 'Undo', onClick: () => void undoMarkRead(ids) }
		});
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
							<DropdownMenu.Item onSelect={() => requestMarkAll()}
								>Mark all as read</DropdownMenu.Item
							>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onSelect={() => requestMarkAll(1)}
								>Older than 1 day</DropdownMenu.Item
							>
							<DropdownMenu.Item onSelect={() => requestMarkAll(7)}
								>Older than 1 week</DropdownMenu.Item
							>
							<DropdownMenu.Item onSelect={() => requestMarkAll(30)}
								>Older than 1 month</DropdownMenu.Item
							>
						</DropdownMenu.Content>
					</DropdownMenu.Root>{/if}
			</header>
			<ScrollArea class="min-h-0 flex-1">
				{#if failure}
					<div class="p-3">
						<Alert.Root variant="destructive">
							<TriangleAlert />
							<Alert.Title>Could not refresh feed</Alert.Title>
							<Alert.Description class="min-w-0">
								<p class="[overflow-wrap:anywhere]">{failure}</p>
								<form
									method="POST"
									action={`${resolve('/(app)/feeds')}?/refreshFeed`}
									use:enhance={retry}
									aria-busy={retrying}
								>
									<input type="hidden" name="feedId" value={data.viewId} />
									<Button type="submit" variant="outline" size="sm" disabled={retrying}
										>{retrying ? 'Retrying…' : 'Retry'}</Button
									>
								</form>
							</Alert.Description>
						</Alert.Root>
					</div>
				{/if}
				{#if articles.length}
					<Item.Group class="min-w-0 p-2" bind:ref={listElement}>
						{#each articles as article, index (article.id)}
							{@const read = isRead(article)}
							<ArticleRow
								{article}
								{read}
								starred={isStarred(article)}
								href={itemHref(data, article.id)}
								selected={itemId === article.id}
								above={() => articles.slice(0, index)}
								below={() => articles.slice(index + 1)}
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
									<Item.Title class={read ? 'font-normal text-muted-foreground' : 'font-semibold'}>
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
							</ArticleRow>
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

<AlertDialog.Root
	open={confirmMark !== null}
	onOpenChange={(open) => {
		if (!open) confirmMark = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Mark {confirmMark?.count} articles as read?</AlertDialog.Title>
			<AlertDialog.Description>You can undo this right after.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				onclick={() => {
					const days = confirmMark?.olderThanDays;
					confirmMark = null;
					void markAll(days);
				}}>Mark as read</AlertDialog.Action
			>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
