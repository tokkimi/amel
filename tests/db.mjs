import {neon} from '@neondatabase/serverless';
import {useDatabase} from '../server/db.mjs';
export const sql=process.env.AMELIB_TEST_DB==='1'?(await (await import('../scripts/local-test-db.mjs')).createTestDatabase()).sql:process.env.AMELIB_LOCAL_PG?(await import('../scripts/pg-neon.mjs')).pgNeon(process.env.DATABASE_URL):neon(process.env.DATABASE_URL);
useDatabase(sql);
