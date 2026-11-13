import { Worker } from 'node:worker_threads';

/**
 * linkedom + Readability parse synchronously with super-linear cost on deeply nested
 * markup, so they never run on the server's main thread: each job gets a short-lived
 * worker that is terminated after a deadline. The worker source is an inline CommonJS
 * string resolved from node_modules at runtime (relative to this module), so it works
 * the same in vite dev, vitest, `node build` and a runtime image without src/.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const load = createRequire(workerData.base);
const { parseHTML } = load('linkedom');
const { Readability } = load('@mozilla/readability');
const { document } = parseHTML(workerData.html);
const article = new Readability(document).parse();
parentPort.postMessage(article ? { content: article.content ?? '', text: article.textContent ?? '' } : null);
`;

export const PARSE_TIMEOUT_MS = 5_000;
export const MAX_WORKERS = 2;
const MAX_TAGS = 50_000;
const MAX_DEPTH = 150;

/** Thrown for hostile or unreadable markup; messages are safe for users. */
export class DomParseError extends Error {}

export interface ParsedArticle {
	content: string;
	text: string;
}

const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'source',
	'track',
	'wbr'
]);
// Closing tags are optional for these, so they must not inflate the depth estimate.
const IMPLIED = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'thead', 'tbody']);

/** Linear scan rejecting markup with too many tags or too deep nesting before any DOM work. */
export function assertReasonableMarkup(html: string) {
	const stack: string[] = [];
	let tags = 0;
	let index = html.indexOf('<');
	while (index !== -1) {
		const closing = html.charCodeAt(index + 1) === 47;
		const start = index + (closing ? 2 : 1);
		let end = start;
		for (; end < html.length; end++) {
			const code = html.charCodeAt(end) | 32;
			if (!(
				(code >= 97 && code <= 122) ||
				(end > start && ((code >= 48 && code <= 57) || code === 45))
			))
				break;
		}
		if (end > start) {
			const name = html.slice(start, end).toLowerCase();
			if (++tags > MAX_TAGS) throw new DomParseError('The article page is too complex.');
			if (closing) {
				const at = stack.lastIndexOf(name);
				if (at !== -1) stack.length = at;
			} else if (!VOID.has(name) && !IMPLIED.has(name)) {
				const close = html.indexOf('>', end);
				if (close === -1 || html.charCodeAt(close - 1) !== 47) stack.push(name);
				if (stack.length > MAX_DEPTH) throw new DomParseError('The article page is too complex.');
			}
		}
		index = html.indexOf('<', start);
	}
}

/** Observable for tests: worker slots in use and the peak since start. */
export const workerStats = { active: 0, peak: 0 };
let running = 0;
const waiting: Array<() => void> = [];
async function acquire(signal?: AbortSignal) {
	while (running >= MAX_WORKERS) {
		await new Promise<void>((resolve) => waiting.push(resolve));
		signal?.throwIfAborted();
	}
	running++;
	workerStats.active = running;
	workerStats.peak = Math.max(workerStats.peak, running);
}
function release() {
	running--;
	workerStats.active = running;
	waiting.shift()?.();
}

/** Parse in a bounded worker. Resolves null when Readability finds nothing. */
export async function parseArticleInWorker(
	html: string,
	signal?: AbortSignal,
	timeoutMs = PARSE_TIMEOUT_MS
): Promise<ParsedArticle | null> {
	assertReasonableMarkup(html);
	signal?.throwIfAborted();
	await acquire(signal);
	let terminated: Promise<number> = Promise.resolve(0);
	try {
		return await new Promise<ParsedArticle | null>((resolve, reject) => {
			const worker = new Worker(WORKER_SOURCE, {
				eval: true,
				workerData: { html, base: import.meta.url },
				resourceLimits: { maxOldGenerationSizeMb: 256 }
			});
			let settled = false;
			const finish = (action: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				terminated = worker.terminate();
				action();
			};
			const onAbort = () => finish(() => reject(new DomParseError('Extraction was cancelled.')));
			const timer = setTimeout(
				() => finish(() => reject(new DomParseError('The article page took too long to read.'))),
				timeoutMs
			);
			signal?.addEventListener('abort', onAbort, { once: true });
			worker.once('message', (message: ParsedArticle | null) => finish(() => resolve(message)));
			worker.once('error', (error) => {
				console.error('Article parse worker failed', error);
				finish(() => reject(new DomParseError('Could not read the article page.')));
			});
			worker.once('exit', () =>
				finish(() => reject(new DomParseError('Could not read the article page.')))
			);
		});
	} finally {
		await terminated;
		release();
	}
}
