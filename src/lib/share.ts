interface ShareEnvironment {
	share?: (data: ShareData) => Promise<void>;
	clipboard?: { writeText: (text: string) => Promise<void> };
}

/** Aborting the system sheet is not an error and must not copy unexpectedly. */
export async function shareArticle(
	article: { title: string; url: string },
	environment: ShareEnvironment = navigator
): Promise<'shared' | 'copied' | 'cancelled'> {
	if (environment.share) {
		try {
			await environment.share({ title: article.title, url: article.url });
			return 'shared';
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
			// Some browsers expose Web Share but deny it (permissions or platform support).
		}
	}
	if (!environment.clipboard) throw new Error('Sharing and clipboard are unavailable');
	await environment.clipboard.writeText(article.url);
	return 'copied';
}
