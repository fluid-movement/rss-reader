import { connectDatabase } from '../src/lib/server/db/connect';
import { migrateDatabase } from '../src/lib/server/db/migrate';
import { assertSafeToSeed } from './seed-guard';
import { DEV_USER } from './seed-data';
import { seedDatabase } from './seed-lib';

try {
	// Guard first: nothing is opened before the environment is known to be local development.
	assertSafeToSeed(process.env);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
	const { client, db } = connectDatabase(process.env.DATABASE_URL);
	try {
		migrateDatabase(db);
		const summary = await seedDatabase(db);
		console.log(
			`Seeded ${summary.folders} folders, ${summary.feeds} feeds, ${summary.items} items ` +
				`(${summary.read} read, ${summary.starred} starred) for ${DEV_USER.email}. ` +
				'See scripts/seed-data.ts for the dev login.'
		);
	} finally {
		client.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Could not seed the database.');
	process.exitCode = 1;
}
