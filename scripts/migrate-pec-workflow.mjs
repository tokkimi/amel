// Reviewed additive migrations only. Choose the target environment explicitly with node --env-file.
import {neon} from '@neondatabase/serverless';
import {MIGRATIONS,statements} from '../server/migrations.mjs';
if(!process.env.DATABASE_URL)throw new Error('Production database configuration missing');
const sql=neon(process.env.DATABASE_URL);
const columns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name IN ('initial_patient_share','initial_mutual_amount','billing_status','source_estimation_id')`;
console.log('PEC migration preflight:',columns.map(c=>c.column_name).join(',')||'new columns absent');
for(const id of ['2026-10-13-003-pec-financial-breakdown','2026-10-13-004-pec-workflow']){
 const migration=MIGRATIONS.find(m=>m.id===id);if(!migration)throw new Error('Missing reviewed migration');
 const [done]=await sql`SELECT 1 FROM platform_state WHERE key='schema' AND value->'applied' ? ${id}`;
 if(done){console.log('Already applied:',id);continue;}
 await sql.transaction([sql`SELECT pg_advisory_xact_lock(778899)`,...statements(migration.sql).map(s=>sql.query(s)),sql`INSERT INTO platform_state(key,value,updated_at) VALUES('schema',jsonb_build_object('applied',jsonb_build_array(${id}::text)),now()) ON CONFLICT(key) DO UPDATE SET value=jsonb_set(platform_state.value,'{applied}',coalesce(platform_state.value->'applied','[]'::jsonb)||to_jsonb(${id}::text)),updated_at=now()`]);
 console.log('Applied reviewed additive migration:',id);
}
const [{count}]=await sql`SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='tasks' AND column_name IN ('initial_patient_share','initial_mutual_amount','billing_status','source_estimation_id')`;
if(count!==4)throw new Error('Migration verification failed');console.log('Production PEC columns verified.');
