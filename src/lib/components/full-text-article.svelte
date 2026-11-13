<script lang="ts">
	import type { Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { FileText, Rss } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import type { ReaderItem } from '#lib/reader.ts';

	let { item, body }: { item: ReaderItem; body: Snippet<[string]> } = $props();

	let loadingId = $state<string | null>(null);
	let fetched = $state<{ id: string; html: string } | null>(null);
	let feedVersionId = $state<string | null>(null);

	let loading = $derived(loadingId === item.id);
	let full = $derived(
		(fetched?.id === item.id ? fetched.html : null) ?? item.sanitizedFullContent ?? null
	);
	let showFull = $derived(full !== null && feedVersionId !== item.id);

	async function load() {
		const id = item.id;
		if (loadingId) return;
		loadingId = id;
		try {
			const response = await fetch('/api/extract', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ itemId: id })
			});
			if (!response.ok) {
				const problem = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(problem?.message ?? 'Could not load the full article.');
			}
			const result = (await response.json()) as { content: string };
			fetched = { id, html: result.content };
			feedVersionId = null;
			void invalidate('app:item');
		} catch (error) {
			toast.error(
				error instanceof Error && error.message
					? `${error.message} Showing the feed version.`
					: 'Could not load the full article. Showing the feed version.'
			);
		} finally {
			loadingId = null;
		}
	}
</script>

{#if item.link || full !== null}
	<div
		class="flex min-w-0 flex-wrap items-center gap-2 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal"
	>
		{#if full === null}
			<Button variant="outline" size="sm" onclick={load} disabled={loading} aria-busy={loading}>
				{#if loading}<Spinner data-icon="inline-start" />Loading full article…{:else}<FileText
						data-icon="inline-start"
					/>Load full article{/if}
			</Button>
		{:else}
			<Button
				variant="outline"
				size="sm"
				aria-pressed={showFull}
				onclick={() => (feedVersionId = showFull ? item.id : null)}
			>
				{#if showFull}<Rss data-icon="inline-start" />Show feed version{:else}<FileText
						data-icon="inline-start"
					/>Show full article{/if}
			</Button>
		{/if}
	</div>
{/if}
{@render body(showFull && full !== null ? full : item.sanitizedContent)}
