import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { actions } from './+page.server';
import { refreshFeed, refreshAll } from '#lib/server/scheduler.ts';
import { FeedValidationError } from '#lib/server/feeds/subscribe.ts';

// Action wiring tests never open the application database. Ownership and actual
// refresh behavior are exercised with a migrated in-memory DB in scheduler.test.
vi.mock('#lib/server/db/index.ts', () => ({ db: {} }));
vi.mock('#lib/server/scheduler.ts', () => ({ refreshFeed: vi.fn(), refreshAll: vi.fn() }));

function event(authenticated = true, feedId = 'feed-one') {
	const data = new FormData();
	data.set('feedId', feedId);
	data.set('userId', 'attacker-selected-user');
	return {
		locals: authenticated ? { user: { id: 'signed-in-user' } } : {},
		request: new Request('https://reader.example/feeds', { method: 'POST', body: data })
	} as Parameters<NonNullable<typeof actions.refreshFeed>>[0];
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.mocked(refreshFeed).mockResolvedValue({ status: 'refreshed' });
	vi.mocked(refreshAll).mockResolvedValue({ refreshed: 1, skipped: 0, failed: 0 });
});

describe('manual refresh authorization', () => {
	it.each(['refreshFeed', 'refreshAll'])('requires a session for %s', async (name) => {
		try {
			await actions[name](event(false));
			throw new Error('Expected login redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			expect(error).toMatchObject({ status: 303, location: '/login' });
		}
		expect(refreshFeed).not.toHaveBeenCalled();
		expect(refreshAll).not.toHaveBeenCalled();
	});
	it('uses only locals.user for one-feed and all-feed refreshes', async () => {
		await actions.refreshFeed(event());
		await actions.refreshAll(event());
		expect(refreshFeed).toHaveBeenCalledExactlyOnceWith('feed-one', 'signed-in-user');
		expect(refreshAll).toHaveBeenCalledExactlyOnceWith('signed-in-user');
	});
	it('returns a validation failure for a foreign or unknown feed', async () => {
		vi.mocked(refreshFeed).mockRejectedValue(new FeedValidationError('Feed not found.'));
		expect(await actions.refreshFeed(event(true, 'foreign'))).toMatchObject({
			status: 400,
			data: { success: false, message: 'Feed not found.' }
		});
	});
	it('reports recent single-feed skips instead of claiming a refresh', async () => {
		vi.mocked(refreshFeed).mockResolvedValue({ status: 'skipped', reason: 'recent' });
		expect(await actions.refreshFeed(event())).toMatchObject({
			message: 'Refreshed recently, try again in a moment.'
		});
	});
	it('reports failed single-feed refreshes accurately', async () => {
		vi.mocked(refreshFeed).mockResolvedValue({ status: 'failed' });
		expect(await actions.refreshFeed(event())).toMatchObject({
			message: 'Feed refresh failed. See the error below.'
		});
	});
	it.each([
		{ refreshed: 2, skipped: 1, failed: 1 },
		{ refreshed: 0, skipped: 3, failed: 0 },
		{ refreshed: 0, skipped: 0, failed: 0 }
	])('reports batch counts accurately for %j', async (summary) => {
		vi.mocked(refreshAll).mockResolvedValue(summary);
		const result = await actions.refreshAll(event());
		expect(result).toMatchObject({
			message: expect.stringContaining(
				`Refreshed: ${summary.refreshed}. Skipped: ${summary.skipped}. Failed: ${summary.failed}.`
			)
		});
		if (summary.skipped)
			expect(result).toMatchObject({
				message: expect.stringContaining('Refreshed recently, try again in a moment.')
			});
	});
});
