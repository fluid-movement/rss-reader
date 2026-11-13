import { defineConfig, devices } from '@playwright/test';

// Dedicated port and a private database inside the project (the seed guard requires that).
const port = Number(process.env.E2E_PORT ?? 4399);
const origin = `http://localhost:${port}`;

/** Chromium only: touches are driven through CDP. Device profiles supply size, scale and UA. */
const chromium = (profile: (typeof devices)[string]) => ({
	...profile,
	defaultBrowserType: 'chromium' as const,
	hasTouch: true,
	isMobile: true
});

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	outputDir: '.e2e/results',
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: { baseURL: origin, serviceWorkers: 'block', trace: 'retain-on-failure' },
	projects: [
		{ name: 'iphone', use: chromium(devices['iPhone 14']) },
		{ name: 'pixel', use: chromium(devices['Pixel 7']) }
	],
	webServer: {
		// Seed the private database (the build opens it), build, then serve the production build. No network is used.
		command: 'pnpm exec tsx e2e/seed.ts && pnpm build && node build',
		url: `${origin}/health`,
		env: {
			DATABASE_URL: '.e2e/mobile.db',
			ORIGIN: origin,
			PORT: String(port),
			HOST: '127.0.0.1',
			BETTER_AUTH_SECRET: 'mobile-test-secret-mobile-test-secret-0123'
		},
		reuseExistingServer: false,
		timeout: 240_000
	}
});
