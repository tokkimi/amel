import {readFileSync,readdirSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
// Applies the idempotent base schema, then every versioned migration in scripts/migrations (lexical order).
// Rollback scripts (*.down.sql) are never applied automatically.
const sql=process.env.AMELIB_LOCAL_PG?(await import('./pg-neon.mjs')).pgNeon(process.env.DATABASE_URL):neon(process.env.DATABASE_URL);
const run=async file=>{for(const statement of readFileSync(file,'utf8').replace(/^﻿/,'').split(';').filter(s=>s.trim())) await sql.query(statement);};
await run(new URL('./schema.sql',import.meta.url));
for(const name of readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')&&!f.endsWith('.down.sql')).sort()){await run(new URL('./migrations/'+name,import.meta.url));console.log('Migration applied:',name);}
console.log('Amelib database schema ready.');
sql.end?.();
