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

// CSS supplies spacing in many publisher bylines, but it is lost in reader HTML.
// Only repair identified bylines: inserting spaces in arbitrary inline markup
// would corrupt split words, punctuation, code and languages without word spaces.
for (const byline of document.querySelectorAll('[data-testid="multi-byline"], [rel="author"], .byline, .bylines')) {
  let previous = '';
  const visit = (node) => {
    if (node.nodeType === 3) {
      const text = node.textContent;
      if (/[\\p{L}\\p{N}]$/u.test(previous) && /^[\\p{L}\\p{N}]/u.test(text)) node.textContent = ' ' + text;
      if (text) previous = text;
    } else for (const child of node.childNodes) visit(child);
  };
  visit(byline);
}
for (const label of document.querySelectorAll('figcaption .visually-hidden')) {
  if (/^Figure caption,?$/i.test(label.textContent.trim())) label.remove();
}
// The reader cannot play embedded video. Drop the media and its fallback error but
// keep a meaningful caption as a plain paragraph; retain image captions and text-only figures.
for (const figure of document.querySelectorAll('figure')) {
  if (figure.querySelector('img') || !figure.querySelector('video, iframe, [data-testid^="media-player-container"]')) continue;
  const caption = figure.querySelector('figcaption');
  const text = (caption?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  if (caption && text.length > 40 && !/^Figure caption,?$/i.test(text)) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    figure.replaceWith(paragraph);
  } else figure.remove();
}
const article = new Readability(document).parse();
if (article) {
  const { document: result } = parseHTML((article.content ?? '').slice(0, workerData.maxChars));
  for (const figure of result.querySelectorAll('figure')) {
    if (!figure.textContent.trim() && !figure.querySelector('img[src]')) figure.remove();
  }
  // Entity escaping can expand a small input several-fold. Bound the message
  // BEFORE main-thread sanitization, including the otherwise unused full text.
  parentPort.postMessage({ content: result.toString().slice(0, workerData.maxChars), text: (article.textContent ?? '').slice(0, workerData.maxChars) });
} else parentPort.postMessage(null);
`;

export const PARSE_TIMEOUT_MS = 5_000;
export const MAX_WORKERS = 2;
export const MAX_PARSED_CHARS = 500_000;
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
// linkedom actually nests repeated thead/tbody, despite their optional end tags.
const IMPLIED = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'option']);

/** Linear scan rejecting markup with too many tags or too deep nesting before any DOM work. */
export function assertReasonableMarkup(html: string) {
	const stack: string[] = [];
	let close = -2;
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
				// A cached '>' at or after `end` is still the first one after it, so the scan stays linear.
				if (close !== -1 && close < end) close = html.indexOf('>', end);
				if (close === -1 || html.charCodeAt(close - 1) !== 47) stack.push(name);
				if (stack.length > MAX_DEPTH) throw new DomParseError('The article page is too complex.');
			}
		}
		index = html.indexOf('<', start);
	}
}

/** Observable for tests: occupied slots, peak occupancy and queued waiters. */
export const workerStats = { active: 0, peak: 0, queued: 0 };
let running = 0;
const waiting: Array<() => void> = [];
async function acquire(signal?: AbortSignal) {
	while (running >= MAX_WORKERS) {
		await new Promise<void>((resolve, reject) => {
			const cleanup = () => {
				signal?.removeEventListener('abort', onAbort);
				workerStats.queued = waiting.length;
			};
			const wake = () => {
				cleanup();
				resolve();
			};
			const onAbort = () => {
				const index = waiting.indexOf(wake);
				if (index !== -1) waiting.splice(index, 1);
				cleanup();
				reject(new DomParseError('Extraction was cancelled.'));
			};
			waiting.push(wake);
			workerStats.queued = waiting.length;
			signal?.addEventListener('abort', onAbort, { once: true });
		});
		if (signal?.aborted) {
			// A wake already delivered before the abort must reach the next waiter.
			waiting.shift()?.();
			signal.throwIfAborted();
		}
	}
	signal?.throwIfAborted();
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
		signal?.throwIfAborted();
		return await new Promise<ParsedArticle | null>((resolve, reject) => {
			const worker = new Worker(WORKER_SOURCE, {
				eval: true,
				workerData: { html, base: import.meta.url, maxChars: MAX_PARSED_CHARS },
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
				const code = (error as NodeJS.ErrnoException).code;
				// Hostile floods hit known worker limits; log one line without a stack.
				if (code === 'ERR_WORKER_OUT_OF_MEMORY' || code === 'ERR_WORKER_INIT_FAILED')
					console.warn(`Article parse worker stopped: ${code}`);
				else console.error('Article parse worker failed', error);
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
