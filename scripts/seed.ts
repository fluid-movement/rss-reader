import { connectDatabase } from '../src/lib/server/db/connect';
import { migrateDatabase } from '../src/lib/server/db/migrate';
import { assertSafeToSeed } from './seed-guard';
import { DEV_USER } from './seed-data';
import { refreshSeededFeeds, seedDatabase } from './seed-lib';

try {
	// Guard first: nothing is opened before the environment is known to be local development.
	assertSafeToSeed(process.env);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
	const { client, db } = connectDatabase(process.env.DATABASE_URL);
	try {
		migrateDatabase(db);
		const summary = await seedDatabase(db);
		console.log(
			`Queued ${summary.feeds} real feeds in ${summary.folders} folders for ${DEV_USER.email}. ` +
				'See scripts/seed-data.ts for the dev login. Start the dev server: its scheduler pulls them within a minute.'
		);
		if (process.argv.includes('--refresh')) {
			console.log('Refreshing once (network access)...');
			const result = await refreshSeededFeeds(db, summary.userId);
			console.log(
				`Refresh done: ${result.refreshed} refreshed, ${result.failed} failed, ${result.skipped} skipped.`
			);
			for (const feed of result.failures) console.log(`  failed: ${feed.title} (${feed.error})`);
		}
	} finally {
		client.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Could not seed the database.');
	process.exitCode = 1;
}
