/** Deterministic offline fixture for the mobile tests: inserted through the service layer. */
export const FIXTURE_USER = {
	email: 'mobile-tests@example.test',
	name: 'Mobile tests',
	password: 'mobile-test-password'
};
export const ARTICLE_COUNT = 40;
export const WIDE_ARTICLE_NUMBER = 5;
export const articleTitle = (n: number) =>
	n === WIDE_ARTICLE_NUMBER ? 'Article 05 with wide code' : `Article ${String(n).padStart(2, '0')}`;
