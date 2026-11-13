/** Static fake fixtures for the dev seed. No real feeds, people or network access. */

export const DEV_USER = { email: 'test@example.com', name: 'user', password: 'LHXZi8y$L2WfV5' };

export interface SeedFeed {
	slug: string;
	title: string;
	folder: 'Tech' | 'News' | 'Design' | null;
	itemCount: number;
	authors: string[];
	titles: string[];
	/** Minutes since last fetch; null means never fetched. */
	fetchedMinutesAgo: number | null;
	refreshIntervalMinutes?: number;
	extractFullText?: boolean;
	errorCount?: number;
	lastError?: string;
	/** Index of the item that gets full_content. */
	fullContentIndex?: number;
	/** Index of an item with hostile markup, to exercise the sanitizer. */
	hostileIndex?: number;
}

export const SEED_FOLDERS = ['Tech', 'News', 'Design'] as const;

export const SEED_FEEDS: SeedFeed[] = [
	{
		slug: 'byte-weekly',
		title: 'Byte Weekly',
		folder: 'Tech',
		itemCount: 36,
		authors: ['Mara Linden', 'Joss Okafor'],
		titles: [
			'Why your build is slow and what to do about it',
			'A gentle tour of SQLite internals',
			'Static typing is not a religion',
			'Ten small shell tricks that save hours',
			'Understanding async iterators the easy way',
			'Postmortem: the cache that ate our weekend',
			'Notes on designing a tiny job queue',
			'What happens when you type a URL',
			'Reading flame graphs without fear',
			'The case for boring technology'
		],
		fetchedMinutesAgo: 12,
		fullContentIndex: 0
	},
	{
		slug: 'rustacean-notes',
		title: 'Rustacean Notes',
		folder: 'Tech',
		itemCount: 18,
		authors: ['Ines Varga'],
		titles: [
			'Lifetimes explained with a library card',
			'Zero-cost abstractions in practice',
			'Choosing between channels and shared state',
			'Profiling allocations on a budget',
			'Error handling patterns that scale'
		],
		fetchedMinutesAgo: 9,
		refreshIntervalMinutes: 15
	},
	{
		slug: 'kernel-dispatch',
		title: 'Kernel Dispatch',
		folder: 'Tech',
		itemCount: 22,
		authors: ['Dev Rao', 'Tamsin Hale'],
		titles: [
			'Scheduler changes in the latest release',
			'How page faults really work',
			'Tracing syscalls with eBPF',
			'Filesystem journaling, demystified',
			'A field guide to memory ordering'
		],
		fetchedMinutesAgo: 25,
		extractFullText: true
	},
	{
		slug: 'daily-ledger',
		title: 'The Daily Ledger',
		folder: 'News',
		itemCount: 40,
		authors: ['Priya Nand', 'Luca Ferrante', 'Edith Wray'],
		titles: [
			'Council approves new riverside park plan',
			'Markets close mixed after quiet session',
			'Regional rail timetable to change in spring',
			'Harvest forecast brighter than expected',
			'Library extends opening hours',
			'Opinion: the case for slower cities',
			'Volunteers clean up the old harbour',
			'Weather outlook for the long weekend'
		],
		fetchedMinutesAgo: 6
	},
	{
		slug: 'world-brief',
		title: 'World Brief',
		folder: 'News',
		itemCount: 14,
		authors: ['Noor Haddad'],
		titles: [
			'Summit ends with modest agreement',
			'Shipping lanes reopen after repairs',
			'Explainer: how trade tariffs work',
			'Energy grid upgrade enters final phase'
		],
		fetchedMinutesAgo: 60 * 30,
		errorCount: 5,
		lastError:
			'HTTP 503 Service Unavailable while fetching https://world-brief.example.com/feed.xml'
	},
	{
		slug: 'local-dispatch',
		title: 'Local Dispatch (new)',
		folder: 'News',
		itemCount: 0,
		authors: [],
		titles: [],
		fetchedMinutesAgo: null
	},
	{
		slug: 'pixel-and-grain',
		title: 'Pixel & Grain',
		folder: 'Design',
		itemCount: 24,
		authors: ['Sofia Marchetti'],
		titles: [
			'Spacing systems that survive redesigns',
			'The quiet power of a limited palette',
			'Notes from a week of icon drawing',
			'Why grids still matter',
			'Motion that explains instead of decorates',
			'Case study: simplifying a settings page'
		],
		fetchedMinutesAgo: 200,
		refreshIntervalMinutes: 360
	},
	{
		slug: 'type-notes',
		title: 'Type Notes',
		folder: 'Design',
		itemCount: 15,
		authors: ['Henrik Aalto', 'Chidi Eze'],
		titles: [
			'Choosing a text face for long reading',
			'Optical sizes and why they help',
			'Pairing serif and sans without drama',
			'A short history of the ampersand'
		],
		fetchedMinutesAgo: 41
	},
	{
		slug: 'cooking-slowly',
		title: 'Cooking Slowly',
		folder: null,
		itemCount: 12,
		authors: ['Rosa Delgado'],
		titles: [
			'Sunday braise with root vegetables',
			'Sourdough for the impatient',
			'A pantry guide for tired weeknights',
			'Soup season starts now'
		],
		fetchedMinutesAgo: 33,
		hostileIndex: 1
	},
	{
		slug: 'space-weekly',
		title: 'Space Weekly',
		folder: null,
		itemCount: 10,
		authors: ['Kai Brennan'],
		titles: [
			'A new look at the outer moons',
			'How telescopes cool down',
			'Launch window opens next month',
			'What a day on a slow-spinning planet feels like'
		],
		fetchedMinutesAgo: 600,
		refreshIntervalMinutes: 1440
	}
];

/** Small deterministic PRNG so every run produces the same dataset. */
export function createRng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shortArticle(title: string, slug: string) {
	return `<p>${title}. A quick note with the essentials and a pointer to the <a href="https://${slug}.example.com/more">longer discussion</a>.</p>`;
}

export function longArticle(title: string, slug: string, n: number) {
	return `<p>${title} deserves more than a headline, so here is the full picture.</p>
<img src="https://images.example.com/${slug}/${n}.jpg" alt="Illustration for ${title}" width="1200" height="630">
<h2>Background</h2>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
<blockquote><p>Good defaults are a form of kindness to the next person.</p></blockquote>
<h2>Key points</h2>
<ul><li>Start small and measure before changing anything.</li><li>Prefer plain, readable solutions.</li><li>Write down what you learned.</li></ul>
<h3>An example</h3>
<pre><code>const items = feed.items.filter((item) =&gt; !item.read);
console.log(items.length);</code></pre>
<p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore. Inline <code>code</code>, <em>emphasis</em> and <strong>strong text</strong> appear throughout. Read more at <a href="https://${slug}.example.com/posts/${n}">the original post</a>.</p>
<ol><li>First step</li><li>Second step</li><li>Third step</li></ol>
<p>Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>`;
}

export function fullTextArticle(title: string, slug: string) {
	return `<h2>${title} (full text)</h2>
<p>This body was extracted from the original page rather than the feed excerpt.</p>
<h3>Details</h3>
<p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos.</p>
<ul><li>Extracted paragraph one</li><li>Extracted paragraph two</li></ul>
<blockquote><p>Full content takes priority over the feed's own summary.</p></blockquote>
<p>Source: <a href="https://${slug}.example.com/full">full article</a>.</p>`;
}

export function hostileArticle() {
	return `<p>Sanitizer check.</p><script>alert('xss')</script><img src="https://images.example.com/x.jpg" onerror="alert(1)" alt="x"><a href="javascript:alert(1)">click me</a><p onclick="alert(2)">Safe text remains.</p>`;
}
