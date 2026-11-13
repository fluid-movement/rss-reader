import { Worker } from 'node:worker_threads';
import type { EventEmitter as EventEmitterType } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { parseArticleInWorker, workerStats } from './dom-worker';

// Control slot release independently of parser speed; worker integration lives
// in dom-worker.test.ts. No timers or network are needed to occupy a slot.
vi.mock('node:worker_threads', async () => {
	const { EventEmitter } = await import('node:events');
	return {
		Worker: class extends EventEmitter {
			static instances: EventEmitterType[] = [];
			constructor() {
				super();
				(Worker as unknown as { instances: EventEmitterType[] }).instances.push(this);
			}
			terminate() {
				return Promise.resolve(0);
			}
		}
	};
});
const instances = (Worker as unknown as { instances: InstanceType<typeof Worker>[] }).instances;
const content = { content: '<p>Article</p>', text: 'Article' };
const finish = (index: number) => instances[index].emit('message', content);

beforeEach(() => {
	expect(workerStats.active).toBe(0);
	expect(workerStats.queued).toBe(0);
	instances.length = 0;
});

it('removes an aborted queued job promptly and gives the next job the freed slot', async () => {
	const first = parseArticleInWorker('<p>one</p>');
	const second = parseArticleInWorker('<p>two</p>');
	const controller = new AbortController();
	const cancelled = parseArticleInWorker('<p>cancelled</p>', controller.signal);
	const survivor = parseArticleInWorker('<p>survivor</p>');
	const rejection = expect(cancelled).rejects.toThrow('cancelled');
	expect(workerStats.queued).toBe(2);
	controller.abort();
	await rejection;
	expect(workerStats.active).toBe(2);
	expect(workerStats.queued).toBe(1);
	finish(0);
	await first;
	await vi.waitFor(() => expect(instances).toHaveLength(3));
	finish(2);
	await expect(survivor).resolves.toEqual(content);
	// The second worker has never released its slot.
	expect(workerStats.active).toBe(1);
	expect(workerStats.queued).toBe(0);
	finish(1);
	await second;
});

it('passes on a wake if the signalled waiter aborts before resuming', async () => {
	const first = parseArticleInWorker('<p>one</p>');
	const second = parseArticleInWorker('<p>two</p>');
	const controller = new AbortController();
	const cancelled = parseArticleInWorker('<p>cancelled</p>', controller.signal);
	const rejection = expect(cancelled).rejects.toThrow();
	const survivor = parseArticleInWorker('<p>survivor</p>');
	await Promise.resolve(); // workers are now constructed
	finish(0);
	// finish -> finally -> await termination -> release/wake -> acquire resumes.
	// Abort in the gap between that wake and acquire's continuation.
	let queuedAtAbort = -1;
	queueMicrotask(() =>
		queueMicrotask(() => {
			queuedAtAbort = workerStats.queued;
			controller.abort();
		})
	);
	await first;
	await rejection;
	expect(queuedAtAbort).toBe(1);
	await vi.waitFor(() => expect(instances).toHaveLength(3));
	finish(2);
	await expect(survivor).resolves.toEqual(content);
	expect(workerStats.queued).toBe(0);
	finish(1);
	await second;
});
