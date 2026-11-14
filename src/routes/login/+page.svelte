<script lang="ts">
	import { authClient } from '#lib/auth-client.ts';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let passkeyLoading = $state(false);
	let passkeyError = $state('');

	async function signInWithPasskey() {
		if (passkeyLoading) return;
		passkeyLoading = true;
		passkeyError = '';
		try {
			const result = await authClient.signIn.passkey();
			if (result.error) {
				passkeyError =
					result.error.message || 'Unable to sign in with a passkey. Please try again.';
				return;
			}
			window.location.assign('/');
		} catch {
			passkeyError = 'Passkey sign-in was cancelled or failed. Please try again.';
		} finally {
			passkeyLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in · RSS Reader</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center p-6">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title><h1>Sign in to RSS Reader</h1></Card.Title>
			<Card.Description>Use your username and password or an existing passkey.</Card.Description>
		</Card.Header>
		<Card.Content>
			<form method="POST">
				<Field.FieldGroup>
					{#if form?.message}
						<Alert.Root variant="destructive">
							<Alert.Title>Sign-in failed</Alert.Title>
							<Alert.Description>{form.message}</Alert.Description>
						</Alert.Root>
					{/if}
					<Field.Field>
						<Field.FieldLabel for="username">Username</Field.FieldLabel>
						<Input id="username" name="username" type="text" autocomplete="username" required />
					</Field.Field>
					<Field.Field>
						<Field.FieldLabel for="password">Password</Field.FieldLabel>
						<Input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
						/>
					</Field.Field>
					<Field.Field>
						<Button type="submit" disabled={passkeyLoading}>Sign in</Button>
					</Field.Field>
				</Field.FieldGroup>
			</form>
		</Card.Content>
		<Card.Footer class="flex-col gap-4">
			{#if passkeyError}
				<Alert.Root variant="destructive">
					<Alert.Title>Passkey sign-in failed</Alert.Title>
					<Alert.Description>{passkeyError}</Alert.Description>
				</Alert.Root>
			{/if}
			<Button
				type="button"
				variant="outline"
				class="w-full"
				disabled={passkeyLoading}
				aria-busy={passkeyLoading}
				onclick={signInWithPasskey}
			>
				{passkeyLoading ? 'Signing in…' : 'Sign in with a passkey'}
			</Button>
		</Card.Footer>
	</Card.Root>
</main>
