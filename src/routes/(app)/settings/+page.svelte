<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '#lib/auth-client.ts';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import {
		FEED_TITLE_MAX,
		FONT_SIZE_RANGE,
		PASSKEY_NAME_MAX,
		READER_WIDTH_RANGE,
		REFRESH_PRESETS,
		RETENTION_DAYS_MAX
	} from '#lib/settings-limits.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// One notice per form key; a successful save elsewhere never hides another form's error.
	let notices = $state<Record<string, { ok: boolean; message: string }>>({});
	let busy = $state<string | null>(null);

	function save(key: string): SubmitFunction {
		return () => {
			busy = key;
			return async ({ result, update }) => {
				try {
					if (result.type === 'success' || result.type === 'failure') {
						notices[key] = {
							ok: result.type === 'success',
							message: typeof result.data?.message === 'string' ? result.data.message : 'Saved.'
						};
					} else if (result.type === 'error') {
						notices[key] = { ok: false, message: 'Could not save. Try again.' };
					}
					await update({ reset: false });
				} finally {
					busy = null;
				}
			};
		};
	}

	// Live preview of the reader preferences before saving.
	// Initial values only: the inputs own the draft until it is saved.
	// svelte-ignore state_referenced_locally
	let fontSize = $state(data.prefs.readerFontSize);
	// svelte-ignore state_referenced_locally
	let width = $state(data.prefs.readerWidth);
	const previewFont = $derived(
		Number.isInteger(+fontSize) &&
			+fontSize >= FONT_SIZE_RANGE.min &&
			+fontSize <= FONT_SIZE_RANGE.max
			? +fontSize
			: data.prefs.readerFontSize
	);
	const previewWidth = $derived(
		Number.isInteger(+width) && +width >= READER_WIDTH_RANGE.min && +width <= READER_WIDTH_RANGE.max
			? +width
			: data.prefs.readerWidth
	);

	// Passkeys go straight through the Better Auth client; the server list is then reloaded.
	let passkeyName = $state('');
	let passkeyBusy = $state(false);
	let passkeyNotice = $state<{ ok: boolean; message: string } | null>(null);
	let renaming = $state<Record<string, string>>({});
	let deleting = $state<{ id: string; name: string } | null>(null);

	function dateLabel(time: number | null) {
		return time
			? new Date(time).toLocaleDateString('en', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
					timeZone: 'UTC'
				})
			: 'Unknown date';
	}

	async function passkeyAction(
		run: () => Promise<{ error?: { message?: string } | null }>,
		ok: string
	) {
		if (passkeyBusy) return false;
		passkeyBusy = true;
		passkeyNotice = null;
		try {
			const result = await run();
			if (result.error) {
				passkeyNotice = {
					ok: false,
					message: result.error.message || 'That did not work. Try again.'
				};
				return false;
			}
			passkeyNotice = { ok: true, message: ok };
			await invalidateAll();
			return true;
		} catch {
			passkeyNotice = { ok: false, message: 'The passkey prompt was cancelled or failed.' };
			return false;
		} finally {
			passkeyBusy = false;
		}
	}

	async function addPasskey(event: SubmitEvent) {
		event.preventDefault();
		const name = passkeyName.trim();
		if (!name) {
			passkeyNotice = { ok: false, message: 'Give the passkey a name first.' };
			return;
		}
		if (await passkeyAction(() => authClient.passkey.addPasskey({ name }), 'Passkey added.'))
			passkeyName = '';
	}
	async function renamePasskey(event: SubmitEvent, id: string) {
		event.preventDefault();
		const name = (renaming[id] ?? '').trim();
		if (!name) {
			passkeyNotice = { ok: false, message: 'Enter a name for the passkey.' };
			return;
		}
		if (
			await passkeyAction(() => authClient.passkey.updatePasskey({ id, name }), 'Passkey renamed.')
		)
			delete renaming[id];
	}
	async function deletePasskey() {
		const target = deleting;
		if (!target) return;
		await passkeyAction(
			() => authClient.passkey.deletePasskey({ id: target.id }),
			'Passkey deleted.'
		);
		deleting = null;
	}
</script>

<svelte:head>
	<title>Settings · RSS Reader</title>
</svelte:head>

{#snippet notice(key: string)}
	<div role="status" aria-live="polite">
		{#if notices[key]}
			<Alert.Root variant={notices[key].ok ? 'default' : 'destructive'}>
				<Alert.Description>{notices[key].message}</Alert.Description>
			</Alert.Root>
		{/if}
	</div>
{/snippet}

<div class="h-full overflow-y-auto">
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
		<header class="flex flex-col gap-2">
			<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>
			<p class="text-muted-foreground">
				Reading preferences, retention, passkeys and per-feed options.
			</p>
		</header>

		<Tabs.Root value="reader" class="min-w-0">
			<Tabs.List class="w-full justify-start overflow-x-auto sm:w-fit">
				<Tabs.Trigger value="reader">Reader</Tabs.Trigger>
				<Tabs.Trigger value="feeds">Feeds</Tabs.Trigger>
				<Tabs.Trigger value="retention">Retention</Tabs.Trigger>
				<Tabs.Trigger value="security">Security</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="reader" class="mt-4">
				<Card.Root>
					<Card.Header>
						<Card.Title><h2>Reader</h2></Card.Title>
						<Card.Description>Font size and content width of the article pane.</Card.Description>
					</Card.Header>
					<Card.Content>
						<form method="POST" action="?/reader" use:enhance={save('reader')} class="contents">
							<Field.Group>
								<div class="grid gap-4 sm:grid-cols-2">
									<Field.Field>
										<Field.Label for="reader-font-size">Font size (px)</Field.Label>
										<Input
											id="reader-font-size"
											name="fontSize"
											type="number"
											inputmode="numeric"
											min={FONT_SIZE_RANGE.min}
											max={FONT_SIZE_RANGE.max}
											step="1"
											bind:value={fontSize}
											required
										/>
										<Field.Description
											>{FONT_SIZE_RANGE.min} to {FONT_SIZE_RANGE.max}.</Field.Description
										>
									</Field.Field>
									<Field.Field>
										<Field.Label for="reader-width">Content width (px)</Field.Label>
										<Input
											id="reader-width"
											name="width"
											type="number"
											inputmode="numeric"
											min={READER_WIDTH_RANGE.min}
											max={READER_WIDTH_RANGE.max}
											step="10"
											bind:value={width}
											required
										/>
										<Field.Description
											>{READER_WIDTH_RANGE.min} to {READER_WIDTH_RANGE.max}. Narrower screens always
											use the full width.</Field.Description
										>
									</Field.Field>
								</div>
								<div
									class="min-w-0 rounded-lg border p-4"
									style="font-size: {previewFont}px; max-width: {previewWidth}px;"
									data-testid="reader-preview"
								>
									<p class="mb-1 text-xs text-muted-foreground">Preview</p>
									<p class="leading-relaxed">
										The quick brown fox jumps over the lazy dog, then settles down to read a long
										article in comfort.
									</p>
								</div>
								{@render notice('reader')}
								<div>
									<Button type="submit" disabled={busy === 'reader'}>Save reader settings</Button>
								</div>
							</Field.Group>
						</form>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>

			<Tabs.Content value="feeds" class="mt-4">
				<Card.Root>
					<Card.Header>
						<Card.Title><h2>Feed settings</h2></Card.Title>
						<Card.Description>
							Rename a feed, choose how often it refreshes, and fetch full articles. To subscribe,
							remove, organize into folders or import and export OPML, use
							<a href={resolve('/(app)/feeds')} class="underline underline-offset-4">Manage feeds</a
							>.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<ul class="flex flex-col gap-6">
							{#each data.feeds as feed, index (feed.id)}
								{#if index > 0}<Separator />{/if}
								<li class="min-w-0">
									<form
										method="POST"
										action="?/feed"
										use:enhance={save(`feed-${feed.id}`)}
										class="contents"
									>
										<input type="hidden" name="feedId" value={feed.id} />
										<Field.Group>
											<p class="text-sm break-all text-muted-foreground">{feed.url}</p>
											<div class="grid gap-4 sm:grid-cols-2">
												<Field.Field>
													<Field.Label for={`feed-title-${feed.id}`}
														>Title<span class="sr-only"> for {feed.title}</span></Field.Label
													>
													<Input
														id={`feed-title-${feed.id}`}
														name="title"
														value={feed.title}
														maxlength={FEED_TITLE_MAX}
														required
													/>
												</Field.Field>
												<Field.Field>
													<Field.Label for={`feed-interval-${feed.id}`}
														>Refresh every<span class="sr-only">
															for {feed.title}</span
														></Field.Label
													>
													<NativeSelect.Root
														id={`feed-interval-${feed.id}`}
														name="refreshIntervalMinutes"
														value={String(feed.refreshIntervalMinutes)}
														class="w-full"
													>
														{#if !REFRESH_PRESETS.some((preset) => preset.minutes === feed.refreshIntervalMinutes)}
															<NativeSelect.Option value={String(feed.refreshIntervalMinutes)}
																>{feed.refreshIntervalMinutes} minutes (current)</NativeSelect.Option
															>
														{/if}
														{#each REFRESH_PRESETS as preset (preset.minutes)}
															<NativeSelect.Option value={String(preset.minutes)}
																>{preset.label}</NativeSelect.Option
															>
														{/each}
													</NativeSelect.Root>
												</Field.Field>
											</div>
											<div class="flex min-w-0 items-start gap-3">
												<Switch
													id={`feed-fulltext-${feed.id}`}
													name="extractFullText"
													class="mt-0.5"
													checked={feed.extractFullText}
												/>
												<div class="flex min-w-0 flex-col gap-0.5">
													<Field.Label for={`feed-fulltext-${feed.id}`}
														>Fetch full articles<span class="sr-only">
															for {feed.title}</span
														></Field.Label
													>
													<p class="text-sm text-muted-foreground">
														Extracts the first 10 new articles per refresh; use Load full article
														for others.
													</p>
												</div>
											</div>
											{@render notice(`feed-${feed.id}`)}
											<div>
												<Button
													type="submit"
													variant="outline"
													disabled={busy === `feed-${feed.id}`}
													aria-label={`Save settings for ${feed.title}`}>Save feed</Button
												>
											</div>
										</Field.Group>
									</form>
								</li>
							{:else}
								<li class="text-sm text-muted-foreground">
									No feeds yet. Subscribe to one on
									<a href={resolve('/(app)/feeds')} class="underline underline-offset-4"
										>Manage feeds</a
									>.
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>

			<Tabs.Content value="retention" class="mt-4">
				<Card.Root>
					<Card.Header>
						<Card.Title><h2>Retention</h2></Card.Title>
						<Card.Description>
							Only articles that are read and not starred, and older than this many days, are
							removed (checked daily). Unread and starred articles are always kept. Enter 0 to keep
							everything. Removed articles cannot be restored.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<form
							method="POST"
							action="?/retention"
							use:enhance={save('retention')}
							class="contents"
						>
							<Field.Group>
								<Field.Field class="max-w-xs">
									<Field.Label for="retention-days">Keep read articles for (days)</Field.Label>
									<Input
										id="retention-days"
										name="retentionDays"
										type="number"
										inputmode="numeric"
										min="0"
										max={RETENTION_DAYS_MAX}
										step="1"
										value={data.prefs.retentionDays}
										required
									/>
									<Field.Description
										>0 to {RETENTION_DAYS_MAX}. 0 keeps everything.</Field.Description
									>
								</Field.Field>
								{@render notice('retention')}
								<div>
									<Button type="submit" disabled={busy === 'retention'}>Save retention</Button>
								</div>
							</Field.Group>
						</form>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>

			<Tabs.Content value="security" class="mt-4">
				<Card.Root>
					<Card.Header>
						<Card.Title><h2>Passkeys</h2></Card.Title>
						<Card.Description>
							Sign in with your device instead of a password. Adding a passkey needs a recent
							sign-in; if it is refused, sign out and in again.
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-6">
						<ul class="flex flex-col gap-4" aria-label="Registered passkeys">
							{#each data.passkeys as passkey (passkey.id)}
								<li class="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
									<div class="flex flex-wrap items-center gap-2">
										<span class="font-medium break-words">{passkey.name || 'Unnamed passkey'}</span>
										<Badge variant="secondary">Added {dateLabel(passkey.createdAt)}</Badge>
									</div>
									<form
										class="flex flex-wrap items-end gap-2"
										onsubmit={(event) => renamePasskey(event, passkey.id)}
									>
										<Field.Field class="min-w-0 flex-1">
											<Field.Label for={`passkey-name-${passkey.id}`}
												>Rename {passkey.name || 'passkey'}</Field.Label
											>
											<Input
												id={`passkey-name-${passkey.id}`}
												maxlength={PASSKEY_NAME_MAX}
												placeholder={passkey.name || 'Passkey name'}
												bind:value={
													() => renaming[passkey.id] ?? '', (v) => (renaming[passkey.id] = v)
												}
											/>
										</Field.Field>
										<Button type="submit" variant="outline" disabled={passkeyBusy}>Rename</Button>
										<Button
											type="button"
											variant="destructive"
											disabled={passkeyBusy}
											onclick={() =>
												(deleting = { id: passkey.id, name: passkey.name || 'Unnamed passkey' })}
											aria-label={`Delete passkey ${passkey.name || 'Unnamed passkey'}`}
											>Delete</Button
										>
									</form>
								</li>
							{:else}
								<li class="text-sm text-muted-foreground">No passkeys registered yet.</li>
							{/each}
						</ul>

						<Separator />

						<form onsubmit={addPasskey}>
							<Field.Group class="sm:flex-row sm:items-end">
								<Field.Field class="min-w-0 flex-1">
									<Field.Label for="new-passkey-name">New passkey name</Field.Label>
									<Input
										id="new-passkey-name"
										maxlength={PASSKEY_NAME_MAX}
										placeholder="e.g. Laptop"
										autocomplete="off"
										bind:value={passkeyName}
									/>
								</Field.Field>
								<Button type="submit" disabled={passkeyBusy}
									>{passkeyBusy ? 'Waiting…' : 'Add a passkey'}</Button
								>
							</Field.Group>
						</form>
						<div role="status" aria-live="polite">
							{#if passkeyNotice}
								<Alert.Root variant={passkeyNotice.ok ? 'default' : 'destructive'}>
									<Alert.Description>{passkeyNotice.message}</Alert.Description>
								</Alert.Root>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
		</Tabs.Root>
	</div>
</div>

<AlertDialog.Root
	open={deleting !== null}
	onOpenChange={(open) => {
		if (!open) deleting = null;
	}}
>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this passkey?</AlertDialog.Title>
			<AlertDialog.Description>
				“{deleting?.name}” will stop working for sign-in on every device that uses it. This cannot
				be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={deletePasskey}>Delete passkey</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
