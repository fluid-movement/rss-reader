import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { WIDE_ARTICLE_NUMBER, articleTitle } from './fixture';
import {
	centerOf,
	horizontalOverflow,
	listViewport,
	login,
	row,
	swipe,
	swipeAcross
} from './helpers';

// The server's private database (see playwright.config.ts). Reads and stars are reset per test.
const DATABASE = '.e2e/mobile.db';

test.beforeEach(async ({ page }) => {
	const db = new Database(DATABASE);
	try {
		db.pragma('busy_timeout = 5000');
		db.prepare('DELETE FROM item_state').run();
	} finally {
		db.close();
	}
	await login(page);
});

const heading = (page: Page, n: number) =>
	page.getByRole('heading', { level: 1, name: articleTitle(n) });

async function openArticle(page: Page, n: number) {
	await page.getByRole('link', { name: new RegExp(articleTitle(n)) }).tap();
	await expect(heading(page, n)).toBeVisible();
}

test.describe('navigation drawer', () => {
	test('opens from the header, navigates and closes', async ({ page }) => {
		await page.getByRole('button', { name: 'Open navigation' }).tap();
		const drawer = page.getByRole('dialog', { name: 'Reader navigation' });
		await expect(drawer).toBeVisible();
		await drawer.getByRole('link', { name: /^Unread/ }).tap();
		await expect(page).toHaveURL(/\/unread$/);
		await expect(drawer).toBeHidden();
	});
});

test.describe('list and article', () => {
	test('returns to the list with its scroll position kept', async ({ page }) => {
		const viewport = listViewport(page);
		const from = await centerOf(viewport);
		for (let i = 0; i < 3; i++)
			await swipe(page, { x: from.x, y: from.y + 150 }, { x: from.x, y: from.y - 150 });
		await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
		// Touch flings keep scrolling after the finger lifts: wait until the list settles.
		let before = -1;
		await expect
			.poll(async () => {
				const now = await viewport.evaluate((el) => el.scrollTop);
				const settled = now === before;
				before = now;
				return settled;
			})
			.toBe(true);

		// Tap a row that is on screen: Playwright would otherwise scroll an off-screen one into view.
		const links = page.getByRole('link', { name: /Article \d\d/ });
		const index = await links.evaluateAll(
			(els, area) => {
				const bounds = (area as HTMLElement).getBoundingClientRect();
				return els.findIndex((el) => {
					const r = el.getBoundingClientRect();
					return r.top >= bounds.top + 20 && r.bottom <= bounds.bottom - 20;
				});
			},
			await viewport.elementHandle()
		);
		expect(index).toBeGreaterThan(5);
		const visible = links.nth(index);
		const title = (await visible.innerText()).match(/Article \d\d[^\n]*/)![0];
		await visible.tap();
		await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await expect(page).toHaveURL(/\/item\//);

		await page.getByRole('link', { name: /^Back to/ }).tap();
		await expect(page).not.toHaveURL(/\/item\//);
		await expect(viewport).toBeVisible();
		await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBeGreaterThan(before - 3);
		expect(Math.abs((await viewport.evaluate((el) => el.scrollTop)) - before)).toBeLessThan(3);
	});
});

test.describe('article swipes', () => {
	test('left goes to the next article, right to the previous one', async ({ page }) => {
		await openArticle(page, 2);
		const scroller = page.locator('[data-reader-scroller]');
		await swipeAcross(page, scroller, -200);
		await expect(heading(page, 3)).toBeVisible();
		// Wait for the slide-in animation of the new article to finish.
		await expect.poll(() => scroller.evaluate((el) => el.getAnimations().length)).toBe(0);
		await swipeAcross(page, scroller, 200);
		await expect(heading(page, 2)).toBeVisible();
	});

	test('does nothing past the first article', async ({ page }) => {
		await openArticle(page, 1);
		await swipeAcross(page, page.locator('[data-reader-scroller]'), 200);
		await page.waitForTimeout(500);
		await expect(heading(page, 1)).toBeVisible();
	});

	test('ignores swipes that start at the screen edge', async ({ page }) => {
		await openArticle(page, 2);
		const c = await centerOf(page.locator('[data-reader-scroller]'));
		await swipe(page, { x: 8, y: c.y }, { x: 220, y: c.y });
		const width = page.viewportSize()!.width;
		await swipe(page, { x: width - 8, y: c.y }, { x: width - 220, y: c.y });
		await page.waitForTimeout(500);
		await expect(heading(page, 2)).toBeVisible();
	});

	test('ignores swipes that start inside horizontally scrolling content', async ({ page }) => {
		await openArticle(page, WIDE_ARTICLE_NUMBER);
		const pre = page
			.locator(
				'[data-reader-scroller] .article-prose pre, [data-reader-scroller] .article-prose .article-scroll-region'
			)
			.first();
		await pre.scrollIntoViewIfNeeded();
		const c = await centerOf(pre);
		await swipe(page, { x: c.x + 100, y: c.y }, { x: c.x - 100, y: c.y });
		await page.waitForTimeout(500);
		await expect(heading(page, WIDE_ARTICLE_NUMBER)).toBeVisible();
		expect(await horizontalOverflow(page)).toBe(0);
	});
});

test.describe('row swipes', () => {
	const unreadDot = (page: Page, n: number) => row(page, articleTitle(n)).getByLabel('Unread');

	test('right swipe marks read and Undo restores it', async ({ page }) => {
		const target = row(page, articleTitle(3));
		await expect(unreadDot(page, 3)).toBeVisible();
		await swipeAcross(page, target, 180);
		await expect(page.getByText('Marked as read')).toBeVisible();
		await expect(unreadDot(page, 3)).toHaveCount(0);
		await expect(page).not.toHaveURL(/\/item\//);
		await page.getByRole('button', { name: 'Undo' }).tap();
		await expect(unreadDot(page, 3)).toBeVisible();
	});

	test('left swipe stars and Undo removes the star', async ({ page }) => {
		const target = row(page, articleTitle(3));
		await swipeAcross(page, target, -180);
		await expect(page.getByText('Starred', { exact: true }).first()).toBeVisible();
		await expect(target.getByLabel('Starred')).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).tap();
		await expect(target.getByLabel('Starred')).toHaveCount(0);
	});
});

test.describe('pull to refresh', () => {
	test('pulling down at the top refreshes the list', async ({ page }) => {
		// Offline: the refresh action is answered locally with the shape SvelteKit uses.
		await page.route(/\/feeds\?\/refreshAll/, (route) =>
			route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({
					type: 'success',
					status: 200,
					data: JSON.stringify([
						{ success: 1, message: 2 },
						true,
						'Refreshed: 2. Skipped: 0. Failed: 0.'
					])
				})
			})
		);
		const request = page.waitForRequest(/\/feeds\?\/refreshAll/);
		const c = await centerOf(listViewport(page));
		await swipe(page, { x: c.x, y: c.y - 100 }, { x: c.x, y: c.y + 160 });
		await request;
		await expect(page.getByText('Refreshed: 2.').first()).toBeVisible();
	});

	test('a short pull does not refresh', async ({ page }) => {
		let refreshed = false;
		await page.route(/\/feeds\?\/refreshAll/, (route) => {
			refreshed = true;
			return route.abort();
		});
		const c = await centerOf(listViewport(page));
		await swipe(page, { x: c.x, y: c.y }, { x: c.x, y: c.y + 40 });
		await page.waitForTimeout(600);
		expect(refreshed).toBe(false);
	});
});

test.describe('layout', () => {
	for (const width of [360, 390, 430]) {
		test(`no horizontal overflow at ${width}px, safe areas respected`, async ({
			page
		}, testInfo) => {
			// Notch and home indicator, as on an iPhone in portrait.
			const session = await page.context().newCDPSession(page);
			await session.send('Emulation.setSafeAreaInsetsOverride', {
				insets: { top: 47, bottom: 34, left: 0, right: 0 }
			});
			await page.setViewportSize({ width, height: 780 });
			await page.reload();
			await expect(page.getByRole('link', { name: /Article 01/ })).toBeVisible();

			expect(await horizontalOverflow(page)).toBe(0);
			expect(
				await page
					.locator('.app-header')
					.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
			).toBe(47);
			await testInfo.attach(`list-${width}`, {
				body: await page.screenshot(),
				contentType: 'image/png'
			});

			await page.getByRole('button', { name: 'Open navigation' }).tap();
			await expect(page.getByRole('dialog', { name: 'Reader navigation' })).toBeVisible();
			expect(await horizontalOverflow(page)).toBe(0);
			await testInfo.attach(`drawer-${width}`, {
				body: await page.screenshot(),
				contentType: 'image/png'
			});
			await page.keyboard.press('Escape');

			await page.goto('/');
			await openArticle(page, WIDE_ARTICLE_NUMBER);
			expect(await horizontalOverflow(page)).toBe(0);
			const bar = page.getByRole('toolbar', { name: 'Article actions' });
			await expect(bar).toBeVisible();
			const box = (await bar.boundingBox())!;
			// The action bar sits above the home indicator.
			expect(box.y + box.height).toBeLessThanOrEqual(780 - 34 + 1);
			await testInfo.attach(`article-${width}`, {
				body: await page.screenshot(),
				contentType: 'image/png'
			});
		});
	}
});
