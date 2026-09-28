// Shared SQL client for tests: real Neon by default, local PostgreSQL when AMELIB_LOCAL_PG=1.
import { neon } from '@neondatabase/serverless';
import { useDatabase } from '../server/db.mjs';
export const sql = process.env.AMELIB_LOCAL_PG ? (await import('../scripts/pg-neon.mjs')).pgNeon(process.env.DATABASE_URL) : neon(process.env.DATABASE_URL);
useDatabase(sql);
