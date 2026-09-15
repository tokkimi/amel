import {readFileSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
const sql=neon(process.env.DATABASE_URL);
for(const statement of readFileSync(new URL('./schema.sql',import.meta.url),'utf8').replace(/^\uFEFF/,'').split(';').filter(s=>s.trim())) await sql.query(statement);
console.log('Amelib database schema ready.');
