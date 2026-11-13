<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ModeWatcher } from 'mode-watcher';
	import { Menu, Search } from '@lucide/svelte';
	import * as Sidebar from '#lib/components/ui/sidebar/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import AppSidebar from '#lib/components/app-sidebar.svelte';
	import ShortcutsDialog from '#lib/components/shortcuts-dialog.svelte';
	import { createShortcutHandler } from '#lib/shortcut-handler.svelte.ts';
	import { syncReaderData } from '#lib/reader-state.svelte.ts';
	import type { ShellData } from '#lib/reader.ts';
	let {
		data,
		children
	}: { data: ShellData & { readerPrefs: { fontSize: number; width: number } }; children: Snippet } =
		$props();
	let helpOpen = $state(false);
	let returnFocusTo: HTMLElement | null = null;
	const onkeydown = createShortcutHandler(() => {
		const active = document.activeElement;
		returnFocusTo = active instanceof HTMLElement && active !== document.body ? active : null;
		helpOpen = true;
	});
	// After the help dialog closes, focus goes back to where it was, else the main region.
	function restoreFocus() {
		(returnFocusTo?.isConnected ? returnFocusTo : document.getElementById('main-content'))?.focus();
		returnFocusTo = null;
	}
	let navigationOpen = $state(false);
	afterNavigate(() => {
		navigationOpen = false;
	});

	// Keep desktop and phone in sync: refetch when the tab regains focus/visibility,
	// and lightly poll while visible. The DB is the source of truth.
	const POLL_MS = 60_000;
	const MIN_GAP_MS = 5_000;
	onMount(() => {
		let last = Date.now();
		const sync = () => {
			if (document.visibilityState !== 'visible' || Date.now() - last < MIN_GAP_MS) return;
			last = Date.now();
			void syncReaderData();
		};
		const poll = setInterval(() => {
			if (document.visibilityState === 'visible') {
				last = Date.now();
				void syncReaderData();
			}
		}, POLL_MS);
		window.addEventListener('focus', sync);
		document.addEventListener('visibilitychange', sync);
		return () => {
			clearInterval(poll);
			window.removeEventListener('focus', sync);
			document.removeEventListener('visibilitychange', sync);
		};
	});
</script>

<svelte:window {onkeydown} />
<ModeWatcher defaultMode="system" />
<ShortcutsDialog bind:open={helpOpen} onCloseAutoFocus={restoreFocus} />
<Toaster richColors />
<Sidebar.Provider class="h-dvh min-h-0 overflow-hidden">
	<!-- Layout switches with CSS (not a media-query store) so SSR and first paint match the viewport. -->
	<div class="flex size-full min-w-0 flex-col lg:flex-row">
		<aside class="hidden h-full w-60 shrink-0 border-r min-[1150px]:w-72 lg:block">
			<AppSidebar {data} />
		</aside>
		<header class="flex h-14 shrink-0 items-center gap-3 border-b px-3 lg:hidden">
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
			<a href={resolve('/(app)/(all)')} class="font-semibold tracking-tight">RSS Reader</a>
			<Button
				href={resolve('/(app)/search')}
				variant="ghost"
				size="icon"
				class="ml-auto"
				aria-label="Search articles"><Search /></Button
			>
		</header>
		<!-- Reader preferences as CSS variables: server-rendered, so there is no flash on first paint. -->
		<main
			id="main-content"
			tabindex="-1"
			class="min-h-0 min-w-0 flex-1 outline-none"
			style="--reader-font-size: {data.readerPrefs.fontSize}px; --reader-width: {data.readerPrefs
				.width}px;"
		>
			{@render children()}
		</main>
	</div>
</Sidebar.Provider>
