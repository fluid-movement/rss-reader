<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
</script>

<svelte:head>
	<title>RSS Reader</title>
</svelte:head>

<main class="flex flex-col items-start gap-4 p-6">
	<h1>RSS Reader</h1>
	<form method="POST" action="?/logout">
		<Button type="submit" variant="outline">Log out</Button>
	</form>
</main>
