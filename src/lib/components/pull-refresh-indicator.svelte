<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import { ArrowDown } from '@lucide/svelte';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { PULL_COMMIT_DISTANCE } from '#lib/pull-refresh.ts';

	let {
		offset,
		armed,
		refreshing
	}: {
		/** Indicator travel in px while a pull is in progress, null when no pull is active. */
		offset: number | null;
		armed: boolean;
		refreshing: boolean;
	} = $props();

	const reduced = new MediaQuery('prefers-reduced-motion: reduce');
	let pulling = $derived(offset !== null);
	let visible = $derived(refreshing || pulling);
	// Elastic travel follows the finger and rests at the commit distance while refreshing.
	// Reduced motion keeps the indicator still (no elastic movement), fading in and out only.
	let travel = $derived(
		reduced.current ? PULL_COMMIT_DISTANCE / 2 : refreshing ? PULL_COMMIT_DISTANCE : (offset ?? 0)
	);
</script>

<div
	class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
	aria-hidden={!visible}
	data-testid="pull-indicator"
	data-state={refreshing ? 'refreshing' : armed ? 'armed' : pulling ? 'pulling' : 'idle'}
>
	<div
		class="flex size-9 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm will-change-transform {pulling
			? ''
			: 'transition-[transform,opacity] duration-200 motion-reduce:transition-opacity'}"
		style="transform: translateY({visible ? travel - 44 : -44}px); opacity: {visible ? 1 : 0};"
	>
		{#if refreshing}
			<Spinner class="size-5" aria-label="Refreshing" />
		{:else}
			<ArrowDown
				class="size-5 transition-transform duration-150 {armed ? 'rotate-180 text-primary' : ''}"
			/>
		{/if}
	</div>
</div>
