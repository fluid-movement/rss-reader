/** Dev seed definition: the dev login, topic folders and REAL feeds the app pulls itself. */

export const DEV_USER = { email: 'test@example.com', name: 'user', password: 'LHXZi8y$L2WfV5' };

export const SEED_FOLDERS = [
	'Tech',
	'Dev blogs',
	'News',
	'Science',
	'Security',
	'Culture'
] as const;
export type SeedFolder = (typeof SEED_FOLDERS)[number];

export interface SeedFeed {
	url: string;
	folder: SeedFolder | null;
	title: string;
	refreshIntervalMinutes?: number;
	/** Excerpt-only feeds: the app fetches the article page for new items. */
	extractFullText?: boolean;
}

export const SEED_FEEDS: SeedFeed[] = [
	// Tech
	{
		url: 'https://news.ycombinator.com/rss',
		folder: 'Tech',
		title: 'Hacker News',
		refreshIntervalMinutes: 15
	},
	{ url: 'https://lobste.rs/rss', folder: 'Tech', title: 'Lobsters' },
	{ url: 'https://feeds.arstechnica.com/arstechnica/index', folder: 'Tech', title: 'Ars Technica' },
	{ url: 'https://www.theverge.com/rss/index.xml', folder: 'Tech', title: 'The Verge' },
	{
		url: 'https://techcrunch.com/feed/',
		folder: 'Tech',
		title: 'TechCrunch',
		extractFullText: true
	},
	{ url: 'https://www.wired.com/feed/rss', folder: 'Tech', title: 'Wired', extractFullText: true },
	{ url: 'https://www.phoronix.com/rss.php', folder: 'Tech', title: 'Phoronix' },
	{ url: 'https://hackaday.com/blog/feed/', folder: 'Tech', title: 'Hackaday' },
	// Dev blogs
	{
		url: 'https://simonwillison.net/atom/everything/',
		folder: 'Dev blogs',
		title: 'Simon Willison'
	},
	{ url: 'https://jvns.ca/atom.xml', folder: 'Dev blogs', title: 'Julia Evans' },
	{ url: 'https://overreacted.io/rss.xml', folder: 'Dev blogs', title: 'Overreacted' },
	{ url: 'https://martinfowler.com/feed.atom', folder: 'Dev blogs', title: 'Martin Fowler' },
	{ url: 'https://www.joelonsoftware.com/feed/', folder: 'Dev blogs', title: 'Joel on Software' },
	{ url: 'https://svelte.dev/blog/rss.xml', folder: 'Dev blogs', title: 'Svelte blog' },
	{ url: 'https://blog.rust-lang.org/feed.xml', folder: 'Dev blogs', title: 'Rust blog' },
	{ url: 'https://go.dev/blog/feed.atom', folder: 'Dev blogs', title: 'Go blog' },
	{ url: 'https://github.blog/feed/', folder: 'Dev blogs', title: 'GitHub blog' },
	{ url: 'https://blog.cloudflare.com/rss/', folder: 'Dev blogs', title: 'Cloudflare blog' },
	{ url: 'https://stackoverflow.blog/feed/', folder: 'Dev blogs', title: 'Stack Overflow blog' },
	{ url: 'https://css-tricks.com/feed/', folder: 'Dev blogs', title: 'CSS-Tricks' },
	{
		url: 'https://www.smashingmagazine.com/feed/',
		folder: 'Dev blogs',
		title: 'Smashing Magazine'
	},
	{ url: 'https://alistapart.com/main/feed/', folder: 'Dev blogs', title: 'A List Apart' },
	// News
	{
		url: 'https://feeds.bbci.co.uk/news/rss.xml',
		folder: 'News',
		title: 'BBC News',
		extractFullText: true
	},
	{
		url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
		folder: 'News',
		title: 'BBC Technology'
	},
	{ url: 'https://feeds.npr.org/1001/rss.xml', folder: 'News', title: 'NPR News' },
	{
		url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
		folder: 'News',
		title: 'New York Times'
	},
	{ url: 'https://www.theguardian.com/world/rss', folder: 'News', title: 'The Guardian World' },
	{ url: 'https://www.aljazeera.com/xml/rss/all.xml', folder: 'News', title: 'Al Jazeera' },
	// Science
	{ url: 'https://api.quantamagazine.org/feed/', folder: 'Science', title: 'Quanta Magazine' },
	{ url: 'https://www.nature.com/nature.rss', folder: 'Science', title: 'Nature' },
	{ url: 'https://www.nasa.gov/feed/', folder: 'Science', title: 'NASA' },
	{ url: 'https://www.sciencedaily.com/rss/all.xml', folder: 'Science', title: 'ScienceDaily' },
	// Security
	{ url: 'https://krebsonsecurity.com/feed/', folder: 'Security', title: 'Krebs on Security' },
	{ url: 'https://www.schneier.com/feed/atom/', folder: 'Security', title: 'Schneier on Security' },
	{ url: 'https://www.bleepingcomputer.com/feed/', folder: 'Security', title: 'BleepingComputer' },
	// Culture and misc
	{ url: 'https://daringfireball.net/feeds/main', folder: 'Culture', title: 'Daring Fireball' },
	{
		url: 'https://daringfireball.net/feeds/json',
		folder: 'Culture',
		title: 'Daring Fireball (JSON Feed)'
	},
	{ url: 'https://feeds.kottke.org/main', folder: 'Culture', title: 'Kottke' },
	{ url: 'https://xkcd.com/atom.xml', folder: null, title: 'xkcd' },
	{ url: 'https://www.eurogamer.net/feed', folder: null, title: 'Eurogamer' },
	{ url: 'https://www.polygon.com/rss/index.xml', folder: null, title: 'Polygon' },
	// Intentionally dead (404) so the broken-feed state is real.
	{ url: 'https://kottke.org/feed', folder: 'Culture', title: 'Kottke (dead URL)' }
];
