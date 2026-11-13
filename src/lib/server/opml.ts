import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { AppDatabase } from './db/connect';
import { createFeedService } from './feeds/subscribe';
import { normalizeFeedUrl } from './feeds/normalize-url';

export const MAX_OPML_BYTES = 2 * 1024 * 1024;
export class OpmlError extends Error {}
type Outline = { title: string; url: string; folder?: string };
type XmlNode = { [key: string]: unknown; outline?: unknown[] };
export type ImportSummary = {
	added: number;
	skippedDuplicates: number;
	invalid: number;
	foldersCreated: number;
};

/** DTDs are unnecessary for OPML: reject them before any XML processing. */
export function parseOpml(xml: string) {
	if (Buffer.byteLength(xml, 'utf8') > MAX_OPML_BYTES)
		throw new OpmlError('OPML files must be 2 MB or smaller.');
	if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml))
		throw new OpmlError('OPML must not contain DTDs or entity declarations.');
	if (XMLValidator.validate(xml) !== true) throw new OpmlError('Invalid OPML XML.');
	let document;
	try {
		document = new XMLParser({
			ignoreAttributes: false,
			attributeNamePrefix: '@',
			parseAttributeValue: false,
			processEntities: true,
			htmlEntities: true,
			maxNestedTags: 100,
			isArray: (name) => name === 'outline'
		}).parse(xml);
	} catch {
		throw new OpmlError('Invalid OPML XML.');
	}
	if (!document.opml || typeof document.opml !== 'object' || !('body' in document.opml))
		throw new OpmlError('Choose an OPML document with a body.');
	const result: {
		feeds: Outline[];
		folders: string[];
		invalid: number;
		skippedDuplicates: number;
	} = {
		feeds: [],
		folders: [],
		invalid: 0,
		skippedDuplicates: 0
	};
	const seen = new Set<string>();
	const stack: { node: unknown; folder?: string; depth: number }[] = (
		document.opml.body?.outline ?? []
	)
		.map((node: unknown) => ({ node, depth: 0 }))
		.reverse();
	while (stack.length) {
		const { node: value, folder, depth } = stack.pop()!;
		if (depth > 100) throw new OpmlError('OPML nesting is too deep.');
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			result.invalid++;
			continue;
		}
		const node = value as XmlNode;
		const title = stripXmlControls(String(node['@text'] ?? node['@title'] ?? '')).trim();
		let nextFolder = folder;
		if ('@xmlUrl' in node) {
			try {
				const url = normalizeFeedUrl(stripXmlControls(String(node['@xmlUrl'])).trim());
				if (seen.has(url)) result.skippedDuplicates++;
				else {
					seen.add(url);
					result.feeds.push({ title: title || url, url, folder });
				}
			} catch {
				result.invalid++;
			}
		} else if (!folder && title) {
			if (title.length > 200) throw new OpmlError('Folder names must be 200 characters or fewer.');
			nextFolder = title;
			result.folders.push(title);
		} else if (!node.outline?.length && !title) {
			result.invalid++;
		}
		for (const child of [...(node.outline ?? [])].reverse())
			stack.push({ node: child, folder: nextFolder, depth: depth + 1 });
	}
	return result;
}

export function createOpmlService(db: AppDatabase) {
	const service = createFeedService(db);
	return {
		import(userId: string, xml: string): ImportSummary {
			const parsed = parseOpml(xml);
			return db.transaction(() => {
				const existing = service.list(userId);
				const folders = new Map(
					existing.folders.map((folder) => [folder.name.toLowerCase(), folder.id])
				);
				const urls = new Set(
					existing.feeds.flatMap((feed) => {
						try {
							return [normalizeFeedUrl(feed.url)];
						} catch {
							return [];
						}
					})
				);
				const summary = {
					added: 0,
					skippedDuplicates: parsed.skippedDuplicates,
					invalid: parsed.invalid,
					foldersCreated: 0
				};
				for (const name of parsed.folders) {
					if (!folders.has(name.toLowerCase())) {
						folders.set(name.toLowerCase(), service.createFolder(userId, name).id);
						summary.foldersCreated++;
					}
				}
				for (const feed of parsed.feeds) {
					if (urls.has(feed.url)) {
						summary.skippedDuplicates++;
						continue;
					}
					if (
						service.queueFeed(
							userId,
							feed.url,
							feed.title,
							feed.folder ? folders.get(feed.folder.toLowerCase()) : undefined
						)
					) {
						summary.added++;
						urls.add(feed.url);
					} else summary.skippedDuplicates++;
				}
				return summary;
			});
		},
		export(userId: string) {
			const { feeds, folders } = service.list(userId);
			const outline = (feed: (typeof feeds)[number]) =>
				`<outline type="rss" text="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"/>`;
			const body =
				folders
					.map(
						(folder) =>
							`<outline text="${escapeXml(folder.name)}">${feeds
								.filter((feed) => feed.folderId === folder.id)
								.map(outline)
								.join('')}</outline>`
					)
					.join('') +
				feeds
					.filter((feed) => !feed.folderId)
					.map(outline)
					.join('');
			return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>RSS Reader feeds</title></head><body>${body}</body></opml>`;
		}
	};
}

function escapeXml(value: string) {
	return stripXmlControls(value).replace(
		/[&<>"'\r\n\t]/g,
		(character) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&apos;',
				'\r': '&#13;',
				'\n': '&#10;',
				'\t': '&#9;'
			})[character]!
	);
}

function stripXmlControls(value: string) {
	// XML 1.0 permits tab, newline and carriage return, but no other C0 controls.
	// eslint-disable-next-line no-control-regex
	return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}
