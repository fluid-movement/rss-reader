<script lang="ts">
	import type { Snippet } from 'svelte';
	import ReaderWorkspace from '#lib/components/reader-workspace.svelte';
	import type { ReaderData } from '#lib/reader.ts';
	let { data, children }: { data: ReaderData; children: Snippet } = $props();
</script>

<!-- The list lives in this layout so it keeps its scroll position while articles open and close. -->
{#key data.listPath}
	<ReaderWorkspace {data}>{@render children()}</ReaderWorkspace>
{/key}
