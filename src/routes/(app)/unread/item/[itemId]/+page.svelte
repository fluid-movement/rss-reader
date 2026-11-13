<script lang="ts">
	import ReaderArticle from '#lib/components/reader-article.svelte';
	import type { ReaderItemData } from '#lib/reader.ts';
	let { data }: { data: ReaderItemData } = $props();
</script>

<ReaderArticle {data} />
