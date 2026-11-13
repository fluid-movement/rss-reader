import { parseArgs } from 'node:util';
import { connectDatabase } from '../src/lib/server/db/connect';
import { migrateDatabase } from '../src/lib/server/db/migrate';
import { createConsoleUser } from '../src/lib/server/create-user';

try {
	const { values } = parseArgs({
		options: {
			email: { type: 'string' },
			name: { type: 'string' },
			password: { type: 'string' }
		}
	});
	if (!values.email || !values.name || !values.password) {
		throw new Error('Usage: pnpm user:create --email EMAIL --name NAME --password PASSWORD');
	}
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set.');
	const { client, db } = connectDatabase(process.env.DATABASE_URL);
	try {
		migrateDatabase(db);
		const user = await createConsoleUser(db, {
			email: values.email,
			name: values.name,
			password: values.password
		});
		console.log(`Created user ${user.email} (${user.id}).`);
	} finally {
		client.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Could not create user.');
	process.exitCode = 1;
}
