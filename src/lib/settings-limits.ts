/** Validation limits shared by the settings forms and the server-side checks. */
export const FONT_SIZE_RANGE = { min: 14, max: 24 } as const;
export const READER_WIDTH_RANGE = { min: 480, max: 1000 } as const;
export const RETENTION_DAYS_MAX = 3650;
export const FEED_TITLE_MAX = 200;
export const PASSKEY_NAME_MAX = 60;
export const REFRESH_PRESETS = [
	{ minutes: 15, label: '15 minutes' },
	{ minutes: 30, label: '30 minutes' },
	{ minutes: 60, label: '1 hour' },
	{ minutes: 180, label: '3 hours' },
	{ minutes: 360, label: '6 hours' },
	{ minutes: 1440, label: '24 hours' }
] as const;
