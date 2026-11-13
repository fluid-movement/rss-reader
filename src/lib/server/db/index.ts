import { connectDatabase } from './connect';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

export const { db } = connectDatabase(DATABASE_URL);
