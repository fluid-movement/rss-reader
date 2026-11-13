<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Search } from '@lucide/svelte';
	import { Input } from '#lib/components/ui/input/index.js';

	let {
		value = '',
		autofocus = false,
		class: className = ''
	}: { value?: string; autofocus?: boolean; class?: string } = $props();
	let text = $derived(value);
	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (autofocus) input?.focus();
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const query = text.trim();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved base path plus an encoded query string.
		void goto(`${resolve('/(app)/search')}${query ? `?q=${encodeURIComponent(query)}` : ''}`);
	}
</script>

<!-- Without JavaScript the form still works as a plain GET to /search. -->
<form
	method="GET"
	action={resolve('/(app)/search')}
	role="search"
	onsubmit={submit}
	class="relative {className}"
>
	<Search
		class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
		aria-hidden="true"
	/>
	<Input
		bind:ref={input}
		type="search"
		name="q"
		bind:value={text}
		maxlength={200}
		placeholder="Search articles"
		aria-label="Search articles"
		autocomplete="off"
		class="pl-8"
	/>
</form>
