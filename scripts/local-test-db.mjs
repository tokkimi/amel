import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {useDatabase} from '../server/db.mjs';
export async function createTestDatabase(){
 const db=new PGlite();
 const lazy=(text,values)=>({text,values,then(ok,fail){return db.query(text,values).then(r=>r.rows).then(ok,fail)},catch(fail){return this.then(undefined,fail)}});
 const sql=(parts,...values)=>lazy(parts.reduce((s,p,i)=>s+p+(i<values.length?'$'+(i+1):''),''),values);
 sql.query=(text,values=[])=>lazy(text,values);
 sql.transaction=queries=>db.transaction(async tx=>{const rows=[];for(const q of queries)rows.push((await tx.query(q.text,q.values)).rows);return rows});
 sql.end=()=>db.close();
 for(const file of ['schema.sql','pec-billing.sql','pec-plans.sql','migrations/2026-09-28-001-command-center.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
 useDatabase(sql);process.env.DATABASE_URL='local-isolated-test';
 return {sql,db};
}
