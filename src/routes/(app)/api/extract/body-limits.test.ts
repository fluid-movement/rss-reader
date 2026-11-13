import { describe, expect, it, vi } from 'vitest';
import { safeFetch } from '#lib/server/feeds/fetch.ts';
import { POST } from './+server';

vi.mock('#lib/server/db/index.ts', async () => {
	const { connectDatabase } = await import('#lib/server/db/connect.ts');
	const { migrateDatabase } = await import('#lib/server/db/migrate.ts');
	const connection = connectDatabase(':memory:');
	migrateDatabase(connection.db);
	return { db: connection.db };
});
vi.mock('#lib/server/feeds/fetch.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('#lib/server/feeds/fetch.ts')>()),
	safeFetch: vi.fn()
}));

const headers = { 'content-type': 'application/json' };
const url = 'https://reader.example/api/extract';
async function status(request: Request) {
	try {
		const response = await POST({
			locals: { user: { id: 'a' } },
			request,
			url: new URL(request.url)
		} as Parameters<typeof POST>[0]);
		return response.status;
	} catch (thrown) {
		return (thrown as { status: number }).status;
	}
}

describe('extract endpoint body limits', () => {
	it('rejects a large declared body', async () => {
		const body = JSON.stringify({ itemId: 'ia', pad: 'x'.repeat(2000) });
		expect(await status(new Request(url, { method: 'POST', headers, body }))).toBe(413);
		expect(safeFetch).not.toHaveBeenCalled();
	});
	it('rejects when a Content-Length header lies low or is huge', async () => {
		const request = new Request(url, {
			method: 'POST',
			headers: { ...headers, 'content-length': '6000000' },
			body: '{}'
		});
		expect(await status(request)).toBe(413);
	});
	it('enforces the cap on chunked bodies without reading them all', async () => {
		let pulled = 0;
		const stream = new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new TextEncoder().encode('x'.repeat(400)));
				if (pulled > 1000) controller.close();
			}
		});
		const request = new Request(url, {
			method: 'POST',
			headers,
			body: stream,
			duplex: 'half'
		} as RequestInit);
		expect(await status(request)).toBe(413);
		expect(pulled).toBeLessThan(20);
	});
	it('bounds the item id length', async () => {
		const body = JSON.stringify({ itemId: 'x'.repeat(500) });
		expect(await status(new Request(url, { method: 'POST', headers, body }))).toBe(400);
	});
});
