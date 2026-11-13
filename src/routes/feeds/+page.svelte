<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);

	const submit: SubmitFunction = ({ cancel, action }) => {
		if (pending) {
			cancel();
			return;
		}
		pending = true;
		return async ({ update }) => {
			try {
				await update({
					reset: action.search === '?/subscribe' || action.search === '?/createFolder'
				});
			} finally {
				pending = false;
			}
		};
	};
</script>

<svelte:head>
	<title>Manage feeds · RSS Reader</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6" aria-busy={pending}>
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-semibold tracking-tight">Manage feeds</h1>
		<p class="text-muted-foreground">Subscribe to RSS feeds and organize them into folders.</p>
	</header>

	<div role="status" aria-live="polite">
		{#if pending}
			<p class="text-sm text-muted-foreground">Saving changes…</p>
		{:else if form?.message || form?.success}
			<Alert.Root variant={form?.success ? 'default' : 'destructive'}>
				<Alert.Title>{form?.success ? 'Changes saved' : 'Could not save changes'}</Alert.Title>
				<Alert.Description
					>{form?.message ?? 'Your feeds and folders are up to date.'}</Alert.Description
				>
			</Alert.Root>
		{/if}
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title><h2>Add a feed</h2></Card.Title>
			<Card.Description
				>Enter a website URL to discover its feed automatically, or a direct RSS, Atom, or JSON Feed
				URL.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<form id="subscribe-feed" method="POST" action="?/subscribe" use:enhance={submit}>
				<Field.Group class="sm:flex-row sm:items-end">
					<Field.Field class="min-w-0 flex-1">
						<Field.Label for="feed-url">Feed URL</Field.Label>
						<Input
							id="feed-url"
							name="url"
							type="url"
							maxlength={4096}
							placeholder="https://example.com/feed.xml"
							required
						/>
					</Field.Field>
					<Field.Field class="sm:w-auto">
						<Field.Label for="subscribe-folder">Folder (optional)</Field.Label>
						<NativeSelect.Root id="subscribe-folder" name="folderId" value="" class="w-full">
							<NativeSelect.Option value="">No folder</NativeSelect.Option>
							{#each data.folders as folder (folder.id)}
								<NativeSelect.Option value={folder.id}>{folder.name}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</Field.Field>
				</Field.Group>
			</form>
		</Card.Content>
		<Card.Footer>
			<Button type="submit" form="subscribe-feed" disabled={pending}>Subscribe</Button>
		</Card.Footer>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title><h2>Your feeds ({data.feeds.length})</h2></Card.Title>
			<Card.Description
				>Choose a folder and save to move a feed. Removing a feed unsubscribes you and deletes its
				articles.</Card.Description
			>
		</Card.Header>
		<Card.Content>
			<ul class="flex flex-col gap-6">
				{#each data.feeds as feed (feed.id)}
					<li class="flex min-w-0 flex-col gap-3">
						<div class="min-w-0">
							<h3 class="font-medium break-words">{feed.title || feed.url}</h3>
							<p class="text-sm break-all text-muted-foreground">{feed.url}</p>
						</div>
						<div class="flex flex-wrap items-end gap-3">
							<form method="POST" action="?/moveFeed" use:enhance={submit} class="min-w-0 flex-1">
								<input type="hidden" name="feedId" value={feed.id} />
								<Field.Group class="flex-row items-end gap-3">
									<Field.Field class="min-w-0 flex-1">
										<Field.Label for={`feed-folder-${feed.id}`}
											>Folder for {feed.title || feed.url}</Field.Label
										>
										<NativeSelect.Root
											id={`feed-folder-${feed.id}`}
											name="folderId"
											value={feed.folderId ?? ''}
											class="w-full"
										>
											<NativeSelect.Option value="">No folder</NativeSelect.Option>
											{#each data.folders as folder (folder.id)}
												<NativeSelect.Option value={folder.id}>{folder.name}</NativeSelect.Option>
											{/each}
										</NativeSelect.Root>
									</Field.Field>
									<Button
										type="submit"
										variant="outline"
										disabled={pending}
										aria-label={`Save folder for ${feed.title || feed.url}`}>Save folder</Button
									>
								</Field.Group>
							</form>
							<form method="POST" action="?/removeFeed" use:enhance={submit}>
								<input type="hidden" name="feedId" value={feed.id} />
								<Button
									type="submit"
									variant="destructive"
									disabled={pending}
									aria-label={`Remove feed ${feed.title || feed.url}`}>Remove feed</Button
								>
							</form>
						</div>
					</li>
				{:else}
					<li class="text-sm text-muted-foreground">
						No feeds yet. Subscribe to your first feed above.
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title><h2>Folders</h2></Card.Title>
			<Card.Description
				>Deleting a folder keeps its feeds subscribed and moves them to “No folder”.</Card.Description
			>
		</Card.Header>
		<Card.Content class="flex flex-col gap-6">
			<form method="POST" action="?/createFolder" use:enhance={submit}>
				<Field.Group class="sm:flex-row sm:items-end">
					<Field.Field class="min-w-0 flex-1">
						<Field.Label for="new-folder-name">New folder name</Field.Label>
						<Input
							id="new-folder-name"
							name="name"
							maxlength={200}
							required
							placeholder="e.g. Technology"
						/>
					</Field.Field>
					<Button type="submit" disabled={pending}>Create folder</Button>
				</Field.Group>
			</form>
			<ul class="flex flex-col gap-6">
				{#each data.folders as folder (folder.id)}
					<li class="flex flex-wrap items-end gap-3">
						<form method="POST" action="?/renameFolder" use:enhance={submit} class="min-w-0 flex-1">
							<input type="hidden" name="folderId" value={folder.id} />
							<Field.Group class="flex-row items-end gap-3">
								<Field.Field class="min-w-0 flex-1">
									<Field.Label for={`folder-name-${folder.id}`}>Rename {folder.name}</Field.Label>
									<Input
										id={`folder-name-${folder.id}`}
										name="name"
										value={folder.name}
										maxlength={200}
										required
									/>
								</Field.Field>
								<Button
									type="submit"
									variant="outline"
									disabled={pending}
									aria-label={`Rename folder ${folder.name}`}>Rename</Button
								>
							</Field.Group>
						</form>
						<form method="POST" action="?/deleteFolder" use:enhance={submit}>
							<input type="hidden" name="folderId" value={folder.id} />
							<Button
								type="submit"
								variant="destructive"
								disabled={pending}
								aria-label={`Delete folder ${folder.name}, keep its feeds`}
								>Delete folder (keep feeds)</Button
							>
						</form>
					</li>
				{:else}
					<li class="text-sm text-muted-foreground">
						No folders yet. Create one to organize your feeds.
					</li>
				{/each}
			</ul>
		</Card.Content>
	</Card.Root>
</div>
