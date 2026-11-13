<script lang="ts">
	import type { Snippet } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ModeWatcher } from 'mode-watcher';
	import { Menu } from '@lucide/svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Resizable from '#lib/components/ui/resizable/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import type { ShellData } from '#lib/reader.ts';
	let { data, children }: { data: ShellData; children: Snippet } = $props();
	const desktop = new MediaQuery('(min-width: 1024px)', false);
	let navigationOpen = $state(false);
	afterNavigate(() => {
		navigationOpen = false;
	});
</script>

<ModeWatcher defaultMode="system" />
<Toaster richColors />
<Sidebar.Provider class="h-dvh min-h-0 overflow-hidden">
	{#if desktop.current}
		<Resizable.PaneGroup direction="horizontal">
			<Resizable.Pane defaultSize={18} minSize={14} maxSize={30}
				><AppSidebar {data} /></Resizable.Pane
			>
			<Resizable.Handle />
			<Resizable.Pane defaultSize={82} minSize={45}
				><main id="main-content" class="h-full min-w-0">{@render children()}</main></Resizable.Pane
			>
		</Resizable.PaneGroup>
	{:else}
		<div class="flex size-full min-w-0 flex-col">
			<header class="flex h-14 shrink-0 items-center gap-3 border-b px-3">
				<Sheet.Root bind:open={navigationOpen}>
					<Sheet.Trigger
						>{#snippet child({ props })}<Button
								{...props}
								variant="ghost"
								size="icon"
								aria-label="Open navigation"><Menu /></Button
							>{/snippet}</Sheet.Trigger
					>
					<Sheet.Content side="left" class="w-72 gap-0 p-0">
						<Sheet.Header class="sr-only"
							><Sheet.Title>Reader navigation</Sheet.Title><Sheet.Description
								>Browse articles, feeds, and settings.</Sheet.Description
							></Sheet.Header
						>
						<AppSidebar {data} />
					</Sheet.Content>
				</Sheet.Root>
				<a href={resolve('/(app)')} class="font-semibold tracking-tight">RSS Reader</a>
			</header>
			<main id="main-content" class="min-h-0 min-w-0 flex-1">{@render children()}</main>
		</div>
	{/if}
</Sidebar.Provider>
