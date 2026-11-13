<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { enhance, type SubmitFunction } from '$app/forms';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Collapsible from '#lib/components/ui/collapsible/index.js';
	import {
		folderContainsActiveRoute,
		sidebarRouteActive,
		writeCollapsedFolders
	} from '#lib/sidebar-preferences.ts';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import SearchBox from '#lib/components/search-box.svelte';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import type { ShellData } from '#lib/reader.ts';
	import { feedFailure } from '#lib/reader.ts';
	import { unreadDelta } from '#lib/reader-state.svelte.ts';
	import {
		Rss,
		Inbox,
		Mail,
		Star,
		Folder,
		Settings2,
		Settings,
		LogOut,
		Sun,
		Moon,
		Monitor,
		TriangleAlert,
		ChevronRight
	} from '@lucide/svelte';
	let { data, onCollapsedChange }: { data: ShellData; onCollapsedChange: (ids: string[]) => void } =
		$props();
	// Folder, feed and view badges share one muted style.
	const badgeClass = 'static ml-auto shrink-0 whitespace-nowrap font-normal text-muted-foreground';
	// SSR and hydration share the cookie-backed layout data; no after-mount collapse.
	const collapsedFolders = $derived(data.collapsedFolders);
	function setFolderOpen(folderId: string, open: boolean) {
		if (folderContainsActiveRoute(page.url.pathname, folderId, data.feeds)) return;
		const collapsed = collapsedFolders.filter((id) => id !== folderId);
		if (!open) collapsed.push(folderId);
		onCollapsedChange(
			writeCollapsedFolders(
				() => document,
				collapsed,
				data.folders.map((folder) => folder.id),
				page.url.protocol === 'https:'
			)
		);
	}
	let refreshing = $state(false);
	let refreshMessage = $state('');
	let refreshFailed = $state(false);
	const refreshAll: SubmitFunction = ({ cancel }) => {
		if (refreshing) {
			cancel();
			return;
		}
		refreshing = true;
		refreshMessage = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'success' || result.type === 'failure') {
					refreshFailed = result.type === 'failure' || result.data?.success === false;
					refreshMessage =
						typeof result.data?.message === 'string'
							? result.data.message
							: refreshFailed
								? 'Could not refresh feeds. Try again.'
								: 'Feeds refreshed.';
				}
				await update({ navigate: false, refreshAll: true });
			} finally {
				refreshing = false;
			}
		};
	};
	// Unread counts: server counts per feed plus pending optimistic changes.
	const feedUnread = (feedId: string) =>
		Math.max(0, (data.unread[feedId] ?? 0) + unreadDelta(feedId));
	const folderUnread = (folderId: string) =>
		data.feeds.reduce(
			(sum, feed) => (feed.folderId === folderId ? sum + feedUnread(feed.id) : sum),
			0
		);
	const totalUnread = $derived(data.feeds.reduce((sum, feed) => sum + feedUnread(feed.id), 0));
	const views = $derived([
		{
			title: 'All articles',
			href: '/',
			path: resolve('/(app)/(all)'),
			icon: Inbox,
			count: totalUnread
		},
		{
			title: 'Unread',
			href: '/unread',
			path: resolve('/(app)/unread'),
			icon: Mail,
			count: totalUnread
		},
		{
			title: 'Starred',
			href: '/starred',
			path: resolve('/(app)/starred'),
			icon: Star,
			count: data.starred
		}
	]);
	function active(href: string) {
		return href === '/'
			? page.url.pathname === '/' || page.url.pathname.startsWith('/item/')
			: sidebarRouteActive(page.url.pathname, href);
	}
</script>

{#snippet feedIcon(feed: ShellData['feeds'][number])}
	{#if feedFailure(feed)}
		<TriangleAlert class="text-destructive" aria-hidden="true" />
		<span class="sr-only">Feed failing: {feedFailure(feed)}</span>
	{:else}
		<Rss />
	{/if}
{/snippet}

<Sidebar.Root collapsible="none" class="w-full">
	<Sidebar.Header class="p-4">
		<a
			href={resolve('/(app)/(all)')}
			class="flex items-center gap-2 text-base font-semibold tracking-tight"
			><Rss class="size-5" /> RSS Reader</a
		>
		<SearchBox
			value={page.url.pathname.startsWith('/search') ? (page.url.searchParams.get('q') ?? '') : ''}
		/>
		<form
			method="POST"
			action={`${resolve('/(app)/feeds')}?/refreshAll`}
			use:enhance={refreshAll}
			aria-busy={refreshing}
		>
			<Button type="submit" variant="outline" size="sm" class="w-full" disabled={refreshing}>
				{refreshing ? 'Refreshing…' : 'Refresh all'}
			</Button>
		</form>
		<div role="status" aria-live="polite">
			{#if refreshMessage}
				<Alert.Root variant={refreshFailed ? 'destructive' : 'default'}>
					<Alert.Description>{refreshMessage}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</Sidebar.Header>
	<Sidebar.Content>
		<nav aria-label="Reader navigation">
			<Sidebar.Group>
				<Sidebar.Menu>
					{#each views as view (view.href)}
						<Sidebar.MenuItem
							><Sidebar.MenuButton isActive={active(view.href)}>
								{#snippet child({ props })}<a
										{...props}
										href={view.path}
										aria-current={active(view.href) ? 'page' : undefined}
										><view.icon /><span class="min-w-0 flex-1 truncate">{view.title}</span>
										{#if view.count > 0}<Sidebar.MenuBadge class={badgeClass}
												>{view.count}</Sidebar.MenuBadge
											>{/if}</a
									>{/snippet}
							</Sidebar.MenuButton></Sidebar.MenuItem
						>
					{/each}
				</Sidebar.Menu>
			</Sidebar.Group>
			<Sidebar.Group>
				<Sidebar.GroupLabel>Feeds</Sidebar.GroupLabel>
				<Sidebar.GroupContent
					><Sidebar.Menu>
						{#each data.folders as folder (folder.id)}
							{@const href = `/folder/${folder.id}`}
							{@const routeActive = folderContainsActiveRoute(
								page.url.pathname,
								folder.id,
								data.feeds
							)}
							{@const open = routeActive || !collapsedFolders.includes(folder.id)}
							<Sidebar.MenuItem>
								<Collapsible.Root {open} onOpenChange={(value) => setFolderOpen(folder.id, value)}>
									<div class="flex min-w-0 items-center max-lg:gap-2">
										<Sidebar.MenuButton isActive={active(href)} class="min-w-0 flex-1"
											>{#snippet child({ props })}<a
													{...props}
													href={resolve('/(app)/folder/[id]', { id: folder.id })}
													aria-current={active(href) ? 'page' : undefined}
													><Folder /><span class="min-w-0 flex-1 truncate" title={folder.name}
														>{folder.name}</span
													>
													{#if folderUnread(folder.id) > 0}<Sidebar.MenuBadge class={badgeClass}
															>{folderUnread(folder.id)}</Sidebar.MenuBadge
														>{/if}</a
												>{/snippet}</Sidebar.MenuButton
										>
										<Collapsible.Trigger disabled={routeActive}>
											{#snippet child({ props })}
												<Button
													{...props}
													variant="ghost"
													size="icon"
													class="size-8 shrink-0"
													aria-label={`${open ? 'Collapse' : 'Expand'} ${folder.name}`}
													title={routeActive ? 'The active folder stays expanded' : undefined}
												>
													<ChevronRight class={open ? 'rotate-90' : undefined} aria-hidden="true" />
												</Button>
											{/snippet}
										</Collapsible.Trigger>
									</div>
									<Collapsible.Content>
										<Sidebar.MenuSub>
											{#each data.feeds.filter((feed) => feed.folderId === folder.id) as feed (feed.id)}
												<Sidebar.MenuSubItem
													><Tooltip.Root disabled={!feedFailure(feed)}>
														<Tooltip.Trigger>
															{#snippet child({ props })}<Sidebar.MenuSubButton
																	{...props}
																	href={resolve('/(app)/feed/[id]', { id: feed.id })}
																	isActive={active(`/feed/${feed.id}`)}
																	aria-current={active(`/feed/${feed.id}`) ? 'page' : undefined}
																	>{@render feedIcon(feed)}<span
																		class="min-w-0 flex-1 truncate"
																		title={feed.title}>{feed.title}</span
																	>{#if feedUnread(feed.id) > 0}<Sidebar.MenuBadge
																			class={badgeClass}>{feedUnread(feed.id)}</Sidebar.MenuBadge
																		>{/if}</Sidebar.MenuSubButton
																>{/snippet}
														</Tooltip.Trigger>
														{#if feedFailure(feed)}<Tooltip.Content
																role="tooltip"
																class="max-w-64 break-words">{feedFailure(feed)}</Tooltip.Content
															>{/if}
													</Tooltip.Root></Sidebar.MenuSubItem
												>
											{/each}
										</Sidebar.MenuSub>
									</Collapsible.Content>
								</Collapsible.Root>
							</Sidebar.MenuItem>
						{/each}
						{#each data.feeds.filter((feed) => !feed.folderId) as feed (feed.id)}
							<Sidebar.MenuItem
								><Tooltip.Root disabled={!feedFailure(feed)}>
									<Tooltip.Trigger>
										{#snippet child({ props: tooltipProps })}<Sidebar.MenuButton
												isActive={active(`/feed/${feed.id}`)}
												>{#snippet child({ props })}<a
														{...props}
														{...tooltipProps}
														href={resolve('/(app)/feed/[id]', { id: feed.id })}
														aria-current={active(`/feed/${feed.id}`) ? 'page' : undefined}
														>{@render feedIcon(feed)}<span
															class="min-w-0 flex-1 truncate"
															title={feed.title}>{feed.title}</span
														>
														{#if feedUnread(feed.id) > 0}<Sidebar.MenuBadge class={badgeClass}
																>{feedUnread(feed.id)}</Sidebar.MenuBadge
															>{/if}</a
													>{/snippet}</Sidebar.MenuButton
											>{/snippet}
									</Tooltip.Trigger>
									{#if feedFailure(feed)}<Tooltip.Content
											role="tooltip"
											class="max-w-64 break-words">{feedFailure(feed)}</Tooltip.Content
										>{/if}
								</Tooltip.Root></Sidebar.MenuItem
							>
						{/each}
						<Sidebar.MenuItem
							><Sidebar.MenuButton isActive={active('/feeds')}
								>{#snippet child({ props })}<a
										{...props}
										href={resolve('/(app)/feeds')}
										aria-current={active('/feeds') ? 'page' : undefined}
										><Settings2 /><span>Manage feeds</span></a
									>{/snippet}</Sidebar.MenuButton
							></Sidebar.MenuItem
						>
					</Sidebar.Menu></Sidebar.GroupContent
				>
			</Sidebar.Group>
		</nav>
	</Sidebar.Content>
	<Sidebar.Footer class="gap-2 p-2">
		<Sidebar.Menu>
			<Sidebar.MenuItem
				><Sidebar.MenuButton isActive={active('/settings')}
					>{#snippet child({ props })}<a
							{...props}
							href={resolve('/(app)/settings')}
							aria-current={active('/settings') ? 'page' : undefined}
							><Settings /><span>Settings</span></a
						>{/snippet}</Sidebar.MenuButton
				></Sidebar.MenuItem
			>
		</Sidebar.Menu>
		<div class="flex min-w-0 items-center gap-2">
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{data.user.name}</p>
				<p class="truncate text-xs text-muted-foreground">{data.user.email}</p>
			</div>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					>{#snippet child({ props })}<Button
							{...props}
							variant="ghost"
							size="icon"
							aria-label="Appearance"><Sun /></Button
						>{/snippet}</DropdownMenu.Trigger
				>
				<DropdownMenu.Content align="end"
					><DropdownMenu.Group
						><DropdownMenu.Label>Appearance</DropdownMenu.Label><DropdownMenu.RadioGroup
							value={userPrefersMode.current}
							onValueChange={(value) => setMode(value as 'light' | 'dark' | 'system')}
						>
							<DropdownMenu.RadioItem value="light" closeOnSelect={true}
								><Sun />Light</DropdownMenu.RadioItem
							>
							<DropdownMenu.RadioItem value="dark" closeOnSelect={true}
								><Moon />Dark</DropdownMenu.RadioItem
							>
							<DropdownMenu.RadioItem value="system" closeOnSelect={true}
								><Monitor />System</DropdownMenu.RadioItem
							>
						</DropdownMenu.RadioGroup></DropdownMenu.Group
					></DropdownMenu.Content
				>
			</DropdownMenu.Root>
			<form method="POST" action={`${resolve('/(app)/(all)')}?/logout`}>
				<Button type="submit" variant="ghost" size="icon" aria-label="Log out"><LogOut /></Button>
			</form>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
