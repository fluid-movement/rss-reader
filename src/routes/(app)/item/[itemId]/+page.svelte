<script lang="ts">
	import ReaderWorkspace from '#lib/components/reader-workspace.svelte';
	import type { ReaderData } from '#lib/reader.ts';
	let { data }: { data: ReaderData } = $props();
</script>

<ReaderWorkspace {data} />
