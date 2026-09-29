import { randomUUID, randomBytes } from 'node:crypto';
import { MIGRATIONS, statements } from './migrations.mjs';
import { hash } from './security.mjs';
// Runs once per server instance: applies pending migrations inside one locked transaction, then the optional
// admin bootstrap. Failures are logged and never block requests (the rest of the app keeps working).
let ready = null;
export function ensureSchema(sql) {
  if (!ready) ready = run(sql).catch((error) => { ready = null; console.error('Amelib schema bootstrap failed:', error?.code || error?.message); });
  return ready;
}
async function run(sql) {
  const [{ t }] = await sql`SELECT to_regclass('public.platform_state') AS t`;
  const applied = t ? ((await sql`SELECT value FROM platform_state WHERE key='schema'`)[0]?.value?.applied || []) : [];
  for (const m of MIGRATIONS.filter((x) => !applied.includes(x.id))) {
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(778899)`,
      ...statements(m.sql).map((s) => sql.query(s)),
      sql`INSERT INTO platform_state(key,value,updated_at) VALUES('schema',jsonb_build_object('applied',jsonb_build_array(${m.id}::text)),now())
        ON CONFLICT(key) DO UPDATE SET value=jsonb_set(platform_state.value,'{applied}',coalesce(platform_state.value->'applied','[]'::jsonb)||to_jsonb(${m.id}::text)),updated_at=now()`,
    ]);
    console.log('Amelib migration applied:', m.id);
  }
  await bootstrapAdmin(sql);
}
// Optional: AMELIB_BOOTSTRAP_ADMIN_EMAIL + AMELIB_BOOTSTRAP_ADMIN_PASSWORD_HASH (scrypt hash from server/security.mjs)
// create a dedicated admin account, or reset its password when the hash changes. Existing non-admin accounts are never promoted.
async function bootstrapAdmin(sql) {
  const email = String(process.env.AMELIB_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const passwordHash = String(process.env.AMELIB_BOOTSTRAP_ADMIN_PASSWORD_HASH || '').trim();
  if (!email || !/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash)) return;
  const marker = 'bootstrap-admin:' + email;
  const [done] = await sql`SELECT 1 FROM platform_state WHERE key=${marker} AND value->>'hash'=${hash(passwordHash)}`;
  if (done) return;
  const [existing] = await sql`SELECT id,role FROM accounts WHERE email=${email}`;
  if (existing && existing.role !== 'admin') { console.error('Amelib admin bootstrap skipped: account exists with another role.'); return; }
  const id = existing?.id || randomUUID();
  await sql.transaction([
    existing
      ? sql`UPDATE accounts SET password_hash=${passwordHash},suspended=false WHERE id=${id}`
      : sql`INSERT INTO accounts(id,email,password_hash,recovery_hash,name,role) VALUES(${id},${email},${passwordHash},${hash(randomBytes(24).toString('hex'))},${String(process.env.AMELIB_BOOTSTRAP_ADMIN_NAME || 'Administration Amelib').slice(0, 80)},'admin')`,
    existing ? sql`DELETE FROM sessions WHERE account_id=${id}` : sql`INSERT INTO profiles(account_id) VALUES(${id}) ON CONFLICT DO NOTHING`,
    sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail,entity_type,entity_id) VALUES(${randomUUID()},${id},'admin_bootstrap',${id},${existing ? 'Mot de passe administrateur réinitialisé par configuration' : 'Compte administrateur créé par configuration'},'account',${id})`,
    sql`INSERT INTO platform_state(key,value,updated_at) VALUES(${marker},jsonb_build_object('hash',${hash(passwordHash)}::text),now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`,
  ]);
  console.log('Amelib admin bootstrap applied.');
}
