/**
 * Creates the private fixture database for the mobile tests (run by the Playwright webServer
 * command, before the app boots). No network: feeds are never due, so the scheduler stays idle.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { connectDatabase } from '../src/lib/server/db/connect';
import { migrateDatabase } from '../src/lib/server/db/migrate';
import { createConsoleUser } from '../src/lib/server/create-user';
import { feeds, folders } from '../src/lib/server/db/schema';
import { createFeedService } from '../src/lib/server/feeds';
import { assertSafeToSeed } from '../scripts/seed-guard';
import { ARTICLE_COUNT, FIXTURE_USER, WIDE_ARTICLE_NUMBER, articleTitle } from './fixture';

// The same guard as the dev seed: local ORIGIN, database inside the project.
assertSafeToSeed(process.env);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
mkdirSync(dirname(databaseUrl), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) rmSync(databaseUrl + suffix, { force: true });

const { client, db } = connectDatabase(databaseUrl);
try {
	migrateDatabase(db);
	const owner = await createConsoleUser(db, FIXTURE_USER);
	const folder = db
		.insert(folders)
		.values({ userId: owner.id, name: 'Fixtures' })
		.returning()
		.get();
	const never = new Date('2100-01-01T00:00:00Z');
	const feedRows = ['Alpha', 'Beta'].map((name, index) =>
		db
			.insert(feeds)
			.values({
				userId: owner.id,
				url: `https://${name.toLowerCase()}.example.test/feed.xml`,
				title: `${name} Feed`,
				folderId: index === 0 ? folder.id : null,
				nextFetchAt: never
			})
			.returning()
			.get()
	);
	const service = createFeedService(db);
	const paragraph =
		'<p>The quick brown fox jumps over the lazy dog while the reader scrolls through a long fixture article that needs enough text to scroll on a phone.</p>';
	const line =
		'const aVeryLongLineOfCode = "far wider than any phone screen so the block scrolls";';
	const wide = `<pre>${line.repeat(4)}</pre>`;
	const hour = 3_600_000;
	for (let n = 1; n <= ARTICLE_COUNT; n++) {
		service.ingestItems(feedRows[n % 2].id, [
			{
				guid: `fixture-${n}`,
				link: `https://example.test/articles/${n}`,
				title: articleTitle(n),
				content: paragraph.repeat(12) + (n === WIDE_ARTICLE_NUMBER ? wide : ''),
				summary: `Summary of article ${n}.`,
				author: 'Fixture Author',
				publishedAt: new Date(Date.now() - n * hour)
			}
		]);
	}
	console.log(`Fixture ready: ${ARTICLE_COUNT} articles for ${FIXTURE_USER.email}.`);
} finally {
	client.close();
}
