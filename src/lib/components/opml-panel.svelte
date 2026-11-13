<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';

	type ImportSummary = {
		added: number;
		skippedDuplicates: number;
		invalid: number;
		foldersCreated: number;
	};

	const maxBytes = 2 * 1024 * 1024;
	let files = $state<FileList>();
	let pending = $state(false);
	let error = $state('');
	let refreshError = $state('');
	let summary = $state.raw<ImportSummary | null>(null);
	let file = $derived(files?.[0]);
	let validationError = $derived(
		file && file.size > maxBytes
			? 'Choose a file no larger than 2 MiB.'
			: file && file.size === 0
				? 'Choose a non-empty OPML or XML file.'
				: file && !/\.(opml|xml)$/i.test(file.name)
					? 'Choose an OPML (.opml) or XML (.xml) file.'
					: ''
	);

	async function importFile() {
		if (pending) return;
		error = '';
		refreshError = '';
		summary = null;
		if (!file || validationError) {
			error = validationError || 'Choose an OPML or XML file to import.';
			return;
		}

		pending = true;
		try {
			const response = await fetch('/feeds/opml', {
				method: 'POST',
				headers: { 'Content-Type': 'application/xml', Accept: 'application/json' },
				body: file
			});
			const result = await response.json();
			if (!response.ok) {
				throw new Error(
					typeof result?.message === 'string' ? result.message : 'Could not import this file.'
				);
			}
			summary = result as ImportSummary;
			files = new DataTransfer().files;
			try {
				await invalidateAll();
			} catch {
				refreshError =
					'Your import was saved, but the feed list could not refresh. Reload the page to see your changes.';
			}
		} catch (cause) {
			error =
				cause instanceof Error ? cause.message : 'Could not import this file. Please try again.';
		} finally {
			pending = false;
		}
	}
</script>

<Card.Root aria-busy={pending}>
	<Card.Header>
		<Card.Title><h2>Import / Export</h2></Card.Title>
		<Card.Description>
			Import subscriptions from another reader or export your feeds and folders as OPML.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<form
			id="import-opml"
			onsubmit={(event) => {
				event.preventDefault();
				void importFile();
			}}
		>
			<Field.Group>
				<Field.Field
					data-disabled={pending || undefined}
					data-invalid={!!validationError || undefined}
				>
					<Field.Label for="opml-file">OPML file</Field.Label>
					<Input
						id="opml-file"
						type="file"
						accept=".opml,.xml,application/xml,text/xml,text/x-opml,application/opml+xml"
						bind:files
						disabled={pending}
						aria-invalid={!!validationError}
						aria-describedby="opml-file-help"
						onchange={() => {
							error = '';
							summary = null;
							refreshError = '';
						}}
					/>
					<Field.Description id="opml-file-help"
						>OPML or XML, up to 2 MiB. Existing subscriptions are skipped.</Field.Description
					>
				</Field.Field>
			</Field.Group>
		</form>
		<div role="status" aria-live="polite">
			{#if error || validationError}
				<Alert.Root variant="destructive">
					<Alert.Title>Could not import feeds</Alert.Title>
					<Alert.Description>{error || validationError}</Alert.Description>
				</Alert.Root>
			{:else if summary}
				<Alert.Root>
					<Alert.Title>Import complete</Alert.Title>
					<Alert.Description>
						{summary.added} feeds added, {summary.skippedDuplicates} duplicates skipped,
						{summary.invalid} invalid entries skipped, and {summary.foldersCreated} folders created.
						{#if refreshError}<p>{refreshError}</p>{/if}
					</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</Card.Content>
	<Card.Footer class="flex-wrap gap-2">
		<Button type="submit" form="import-opml" disabled={pending || !file || !!validationError}>
			{pending ? 'Importing…' : 'Import OPML'}
		</Button>
		<Button href="/feeds/opml" download data-sveltekit-reload variant="outline" disabled={pending}>
			Export OPML
		</Button>
	</Card.Footer>
</Card.Root>
