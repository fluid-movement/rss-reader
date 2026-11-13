/** Canonical HTTP(S) identity without discarding meaningful path/query differences. */
export function normalizeFeedUrl(value: string) {
	const url = new URL(value);
	if (!['http:', 'https:'].includes(url.protocol) || value.length > 4096)
		throw new Error('Enter a valid HTTP(S) feed URL.');
	url.hash = '';
	return url.href;
}
