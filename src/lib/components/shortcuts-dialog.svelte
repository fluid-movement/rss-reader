<script lang="ts">
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Kbd } from '#lib/components/ui/kbd/index.js';
	import { SHORTCUTS } from '#lib/shortcuts.ts';

	let {
		open = $bindable(false),
		onCloseAutoFocus
	}: { open?: boolean; onCloseAutoFocus?: () => void } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="sm:max-w-md"
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			onCloseAutoFocus?.();
		}}
	>
		<!-- Phones: the 44px close button sits in the top-right corner, keep the text clear of it. -->
		<Dialog.Header class="max-lg:pe-12">
			<Dialog.Title>Keyboard shortcuts</Dialog.Title>
			<Dialog.Description>
				Available on any keyboard. They pause while you type in a field or have a dialog open.
			</Dialog.Description>
		</Dialog.Header>
		<dl class="flex flex-col gap-2 text-sm">
			{#each SHORTCUTS as shortcut (shortcut.key)}
				<div class="flex items-center justify-between gap-4">
					<dt class="text-muted-foreground">{shortcut.description}</dt>
					<dd><Kbd>{shortcut.key}</Kbd></dd>
				</div>
			{/each}
			<div class="flex items-center justify-between gap-4">
				<dt class="text-muted-foreground">Close a dialog / leave a field</dt>
				<dd><Kbd>Esc</Kbd></dd>
			</div>
		</dl>
	</Dialog.Content>
</Dialog.Root>
