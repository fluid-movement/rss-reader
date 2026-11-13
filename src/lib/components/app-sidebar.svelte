<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: off -- Dynamic links and future issue routes append to the resolved app root; existing routes use resolve directly. */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { setMode, userPrefersMode } from 'mode-watcher';
	import type { ShellData } from '#lib/reader.ts';
	import {
		Rss,
		Inbox,
		Mail,
		Star,
		Folder,
		Plus,
		Settings,
		LogOut,
		Sun,
		Moon,
		Monitor
	} from '@lucide/svelte';
	let { data }: { data: ShellData } = $props();
	const views = [
		{ title: 'All articles', href: '/', icon: Inbox },
		{ title: 'Unread', href: '/unread', icon: Mail },
		{ title: 'Starred', href: '/starred', icon: Star }
	];
	function active(href: string) {
		return href === '/'
			? page.url.pathname === '/' || page.url.pathname.startsWith('/item/')
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<Sidebar.Root collapsible="none" class="w-full">
	<Sidebar.Header class="p-5">
		<a
			href={resolve('/(app)')}
			class="flex items-center gap-2 text-base font-semibold tracking-tight"
			><Rss class="size-5" /> RSS Reader</a
		>
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
										href={`${resolve('/(app)').replace(/\/$/, '')}${view.href}`}
										aria-current={active(view.href) ? 'page' : undefined}
										><view.icon /><span>{view.title}</span></a
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
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={active(href)}
									>{#snippet child({ props })}<a
											{...props}
											href={resolve('/(app)/folder/[id]', { id: folder.id })}
											aria-current={active(href) ? 'page' : undefined}
											><Folder /><span>{folder.name}</span></a
										>{/snippet}</Sidebar.MenuButton
								>
								<Sidebar.MenuSub>
									{#each data.feeds.filter((feed) => feed.folderId === folder.id) as feed (feed.id)}
										<Sidebar.MenuSubItem
											><Sidebar.MenuSubButton
												href={resolve('/(app)/feed/[id]', { id: feed.id })}
												isActive={active(`/feed/${feed.id}`)}
												aria-current={active(`/feed/${feed.id}`) ? 'page' : undefined}
												><Rss /><span>{feed.title}</span></Sidebar.MenuSubButton
											></Sidebar.MenuSubItem
										>
									{/each}
								</Sidebar.MenuSub>
							</Sidebar.MenuItem>
						{/each}
						{#each data.feeds.filter((feed) => !feed.folderId) as feed (feed.id)}
							<Sidebar.MenuItem
								><Sidebar.MenuButton isActive={active(`/feed/${feed.id}`)}
									>{#snippet child({ props })}<a
											{...props}
											href={resolve('/(app)/feed/[id]', { id: feed.id })}
											aria-current={active(`/feed/${feed.id}`) ? 'page' : undefined}
											><Rss /><span>{feed.title}</span></a
										>{/snippet}</Sidebar.MenuButton
								></Sidebar.MenuItem
							>
						{/each}
						<Sidebar.MenuItem
							><Sidebar.MenuButton
								>{#snippet child({ props })}<a
										{...props}
										href={`${resolve('/(app)').replace(/\/$/, '')}/feeds`}
										><Plus /><span>Add feed</span></a
									>{/snippet}</Sidebar.MenuButton
							></Sidebar.MenuItem
						>
					</Sidebar.Menu></Sidebar.GroupContent
				>
			</Sidebar.Group>
		</nav>
	</Sidebar.Content>
	<Sidebar.Footer class="gap-3 p-3">
		<Sidebar.Menu>
			<Sidebar.MenuItem
				><Sidebar.MenuButton
					>{#snippet child({ props })}<a
							{...props}
							href={`${resolve('/(app)').replace(/\/$/, '')}/feeds`}
							><Rss /><span>Manage feeds</span></a
						>{/snippet}</Sidebar.MenuButton
				></Sidebar.MenuItem
			>
			<Sidebar.MenuItem
				><Sidebar.MenuButton
					>{#snippet child({ props })}<a
							{...props}
							href={`${resolve('/(app)').replace(/\/$/, '')}/settings`}
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
			<form method="POST" action={`${resolve('/(app)')}?/logout`}>
				<Button type="submit" variant="ghost" size="icon" aria-label="Log out"><LogOut /></Button>
			</form>
		</div>
	</Sidebar.Footer>
</Sidebar.Root>
