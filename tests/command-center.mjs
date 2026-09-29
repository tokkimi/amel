// Command Center integration tests (real handler, real SQL). Temporary records are removed at the end.
// Local: AMELIB_LOCAL_PG=1 DATABASE_URL=postgres://… node tests/command-center.mjs
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { sql } from './db.mjs';
import handler from '../api/index.mjs';
import { passwordHash, hash } from '../server/security.mjs';

const ids = { owner: randomUUID(), agent: randomUUID(), cabinet: randomUUID(), other: randomUUID(), patient: randomUUID() };
const tokens = Object.fromEntries(Object.keys(ids).map((k) => [k, randomBytes(32).toString('hex')]));
const email = (k) => `amelib-cc-test-${ids[k]}@example.invalid`;
async function call(who, action, body, query = {}) {
  let status = 200, result;
  await handler({ method: body ? 'POST' : 'GET', url: '/api', query: { action, ...query }, headers: { host: 'amelib.vercel.app', origin: 'https://amelib.vercel.app', 'content-type': 'application/json', cookie: who ? 'amelib_session=' + tokens[who] : '' }, body },
    { setHeader() {}, status(s) { status = s; return this; }, json(r) { result = r; } });
  return { status, result };
}
const ok = async (...args) => { const r = await call(...args); assert.equal(r.status, 200, `${args[1]} → ${r.status} ${JSON.stringify(r.result)}`); return r.result; };

try {
  const password = await passwordHash(randomBytes(24).toString('hex'));
  const roles = { owner: 'admin', agent: 'admin', cabinet: 'professional', other: 'professional', patient: 'patient' };
  for (const [k, role] of Object.entries(roles)) {
    await sql`INSERT INTO accounts(id,email,password_hash,recovery_hash,name,role,created_at) VALUES(${ids[k]},${email(k)},${password},${hash(ids[k])},${'CC Test ' + k + ' Dupont'},${role},now()-interval '30 days')`;
    await sql`INSERT INTO profiles(account_id,identifier,clinic_name,city) VALUES(${ids[k]},${role === 'professional' ? 'RPPS-' + k : ''},${role === 'professional' ? 'Cabinet CCTest ' + k : ''},'Paris')`;
    await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(tokens[k])},${ids[k]},now()+interval '1 hour')`;
  }
  await sql`INSERT INTO admin_members(account_id,internal_role) VALUES(${ids.agent},'support_agent')`;
  await sql`INSERT INTO patient_records(id,owner_id,patient_id,allergies,medications,medical_alerts,mutual_provider) VALUES(${randomUUID()},${ids.cabinet},${ids.patient},'Pénicilline','Aspirine','Diabète','MGEN')`;
  const invoice = randomUUID();
  await sql`INSERT INTO business_documents(id,owner_id,patient_id,doc_type,number,status,due_date,total) VALUES(${invoice},${ids.cabinet},${ids.patient},'invoice',${'CCTEST-' + ids.cabinet.slice(0, 8)},'sent',current_date-40,4800)`;
  await sql`INSERT INTO business_documents(id,owner_id,patient_id,doc_type,number,status,due_date,total) VALUES(${randomUUID()},${ids.cabinet},${ids.patient},'invoice',${'CCTEST2-' + ids.cabinet.slice(0, 8)},'paid',current_date-5,200)`;

  // Permissions: a cabinet can never reach the admin API.
  for (const action of ['cc-home', 'cc-inbox', 'cc-cabinets', 'cc-search', 'cc-finance', 'cc-audit']) assert.equal((await call('cabinet', action, undefined, { q: 'Dupont' })).status, 403, action);
  assert.equal((await call('cabinet', 'cc-event-create', { title: 'x' })).status, 403);
  assert.equal((await call(null, 'cc-home')).status, 401);

  // Internal RBAC: support agent cannot read finance, suspend accounts or use legacy admin actions it lacks.
  const me = await ok('agent', 'cc-me');
  assert.equal(me.role, 'support_agent'); assert(!me.permissions.includes('billing.read'));
  assert.equal((await call('agent', 'cc-finance')).status, 403);
  assert.equal((await call('agent', 'admin-suspend', { id: ids.cabinet, suspended: true, note: 'no' })).status, 403);
  assert.equal((await call('agent', 'cc-role-assign', { account_id: ids.agent, internal_role: 'platform_owner', reason: 'x' })).status, 403);
  assert.equal((await ok('owner', 'cc-me')).role, 'platform_owner', 'legacy admin without row keeps full rights');

  // Support: private notes never reach the cabinet.
  await ok('cabinet', 'support-create', { subject: 'Impossible d’accéder au dossier CCTEST', body: 'Bonjour, erreur.' });
  const [ticket] = await sql`SELECT id,status FROM support_tickets WHERE account_id=${ids.cabinet}`;
  assert.equal(ticket.status, 'new');
  await ok('owner', 'cc-ticket-reply', { id: ticket.id, visibility: 'internal', body: 'NOTE-PRIVEE-CCTEST ne pas transmettre' });
  assert.equal((await call('owner', 'cc-ticket-reply', { id: ticket.id, body: 'sans visibilité' })).status, 400, 'visibility must be explicit');
  await ok('owner', 'cc-ticket-reply', { id: ticket.id, visibility: 'public', body: 'Réponse publique CCTEST' });
  const cabinetView = JSON.stringify(await ok('cabinet', 'support'));
  assert(!cabinetView.includes('NOTE-PRIVEE-CCTEST')); assert(cabinetView.includes('Réponse publique CCTEST'));
  const adminTicket = await ok('agent', 'cc-ticket', undefined, { id: ticket.id });
  assert.equal(adminTicket.messages.filter((m) => m.visibility === 'internal').length, 1);
  assert.equal(adminTicket.ticket.status, 'waiting_customer');
  await ok('owner', 'cc-ticket-update', { id: ticket.id, status: 'open', priority: 'critical', owner_id: ids.agent });

  // Inbox: rules generate events for the critical ticket, overdue invoice and pending verification.
  await ok('owner', 'cc-automations-run', {});
  const inbox = await ok('owner', 'cc-inbox');
  const mine = inbox.items.filter((e) => e.cabinet_id === ids.cabinet);
  const ticketEvent = mine.find((e) => e.dedupe_key === 'support:' + ticket.id);
  assert(ticketEvent && ticketEvent.severity === 'critical' && ticketEvent.owner_id === ids.agent, 'critical ticket event assigned to ticket owner');
  const financeEvent = mine.find((e) => e.dedupe_key === 'finance_overdue:' + ids.cabinet);
  assert(financeEvent && financeEvent.severity === 'high' && financeEvent.description.includes('4800'));
  assert(inbox.items.some((e) => e.dedupe_key === 'verification:' + ids.cabinet && e.severity === 'high'));
  const [notified] = await sql`SELECT count(*)::int AS n FROM notifications WHERE account_id=${ids.owner} AND href=${'/admin?tab=Support&ticket=' + ticket.id}`;
  assert.equal(notified.n, 1, 'critical ticket notifies admins once');
  await ok('owner', 'cc-automations-run', {});
  const [again] = await sql`SELECT count(*)::int AS n FROM operational_events WHERE dedupe_key=${'support:' + ticket.id}`;
  assert.equal(again.n, 1, 'rules are idempotent');

  // Snooze hides, then it comes back automatically once the date passes.
  await ok('owner', 'cc-event-update', { id: financeEvent.id, snoozed_until: new Date(Date.now() + 86400000).toISOString() });
  assert(!(await ok('owner', 'cc-inbox')).items.some((e) => e.id === financeEvent.id));
  assert((await ok('owner', 'cc-inbox', undefined, { view: 'snoozed' })).items.some((e) => e.id === financeEvent.id));
  await sql`UPDATE operational_events SET snoozed_until=now()-interval '1 minute' WHERE id=${financeEvent.id}`;
  assert((await ok('owner', 'cc-inbox')).items.some((e) => e.id === financeEvent.id));
  // Paying the invoice auto-resolves the finance alert.
  await sql`UPDATE business_documents SET status='paid' WHERE id=${invoice}`;
  await ok('owner', 'cc-automations-run', {});
  const [resolved] = await sql`SELECT status,auto_resolved FROM operational_events WHERE id=${financeEvent.id}`;
  assert.equal(resolved.status, 'resolved'); assert.equal(resolved.auto_resolved, true);
  await sql`UPDATE business_documents SET status='sent' WHERE id=${invoice}`;

  // Finance: calculations separate paid / outstanding / overdue and aging.
  const finance = await ok('owner', 'cc-finance');
  const row = finance.cabinets.find((c) => c.id === ids.cabinet);
  assert.deepEqual([row.invoiced, row.paid, row.outstanding, row.overdue, row.overdue_count], [5000, 200, 4800, 4800, 1]);
  assert(finance.aging['31-60'].amount >= 4800);
  assert('invoiced' in finance.platform, 'platform revenue is reported separately');

  // Cabinet 360: need-to-know, no clinical data.
  const cab = await ok('owner', 'cc-cabinet', undefined, { id: ids.cabinet });
  const serialized = JSON.stringify(cab);
  for (const secret of ['Pénicilline', 'Aspirine', 'Diabète', 'password', 'recovery_hash']) assert(!serialized.includes(secret), secret);
  assert.equal(cab.patients[0].initials, 'C. T.');
  assert.equal(typeof cab.cabinet.health.score, 'number'); assert.equal(cab.cabinet.health.dimensions.length, 5);
  assert.equal(JSON.stringify(await ok('agent', 'cc-cabinet', undefined, { id: ids.cabinet })).includes('MGEN'), false, 'mutual provider requires billing.read');

  // Internal notes are admin-only.
  await ok('owner', 'cc-note-add', { entity_type: 'cabinet', entity_id: ids.cabinet, body: 'NOTE-CABINET-CCTEST à rappeler', mentions: [ids.agent] });
  assert.equal((await call('agent', 'cc-note-add', { entity_type: 'cabinet', entity_id: ids.cabinet, body: 'x' })).status, 403, 'support agent cannot annotate cabinets');
  const cabinetDashboard = JSON.stringify(await ok('cabinet', 'dashboard'));
  assert(!cabinetDashboard.includes('NOTE-CABINET-CCTEST'));

  // Search: grouped and permission-filtered.
  const search = await ok('owner', 'cc-search', undefined, { q: 'CCTest' });
  assert(search.groups.find((g) => g.key === 'cabinets').items.some((i) => i.id === ids.cabinet));
  const agentSearch = await ok('agent', 'cc-search', undefined, { q: 'CCTEST' });
  assert(!agentSearch.groups.some((g) => g.key === 'finance'), 'finance hidden without billing.read');
  assert((await ok('owner', 'cc-search', undefined, { q: '%' })).groups.every((g) => g.items.every((i) => String(i.title + i.subtitle).includes('%'))), 'wildcards are escaped');

  // View as cabinet: logged, read-only, and cannot write into the cabinet.
  assert.equal((await call('owner', 'cc-assist-view')).status, 403, 'requires an open assistance session');
  assert.equal((await call('owner', 'cc-assist-start', { cabinet_id: ids.cabinet })).status, 400, 'reason required');
  await ok('owner', 'cc-assist-start', { cabinet_id: ids.cabinet, reason: 'Aide ticket CCTEST' });
  const snapshot = await ok('owner', 'cc-assist-view');
  assert.equal(snapshot.session.mode, 'readonly');
  assert(!JSON.stringify(snapshot).includes('Pénicilline'));
  assert.equal((await call('owner', 'task-save', {title:'Incomplete test'})).status,403);
  const [leak] = await sql`SELECT count(*)::int AS n FROM tasks WHERE owner_id=${ids.cabinet}`;
  assert.equal(leak.n, 0, 'admin writes never land in the viewed cabinet');
  await ok('owner', 'cc-assist-end', {});
  assert.equal((await call('owner', 'cc-assist-view')).status, 403);

  // Isolation: one cabinet never sees another cabinet's data.
  const otherDash = JSON.stringify(await ok('other', 'dashboard'));
  assert(!otherDash.includes('CCTEST-')); assert(!otherDash.includes('MGEN'));
  assert(!JSON.stringify(await ok('other', 'support')).includes('CCTEST'));

  // Verification workflow + audit of sensitive actions.
  assert.equal((await call('owner', 'cc-verification-update', { id: ids.cabinet, status: 'approved', checklist: { identity: true } })).status, 400, 'checklist must be complete');
  assert.equal((await call('owner', 'cc-verification-update', { id: ids.cabinet, status: 'rejected' })).status, 400, 'rejection needs a reason');
  await ok('owner', 'cc-verification-update', { id: ids.cabinet, status: 'approved', checklist: { identity: true, professional_id: true, cabinet: true, documents: true, contact: true } });
  const [profile] = await sql`SELECT verified FROM profiles WHERE account_id=${ids.cabinet}`;
  assert.equal(profile.verified, true);
  await ok('owner', 'cc-role-assign', { account_id: ids.agent, internal_role: 'read_only_analyst', reason: 'Test de changement de rôle' });
  await ok('owner', 'admin-suspend', { id: ids.other, suspended: true, note: 'Test suspension CCTEST' });
  const actions = (await sql`SELECT action,ip,request_id FROM audit_log WHERE actor_id=${ids.owner}`).map((r) => r.action);
  assert(actions.includes('automation_run'), 'automation runs that change data are audited');
  for (const a of ['support_internal_note', 'support_replied', 'assist_started', 'assist_ended', 'profile_verified', 'admin_role_assigned', 'account_suspended', 'internal_note_added']) assert(actions.includes(a), 'audited: ' + a);
  const [entry] = await sql`SELECT id,detail FROM audit_log WHERE actor_id=${ids.owner} AND action='assist_started'`;
  await sql`UPDATE audit_log SET detail='tampered' WHERE id=${entry.id}`;
  assert.equal((await sql`SELECT detail FROM audit_log WHERE id=${entry.id}`)[0].detail, entry.detail, 'audit log is append-only');
  assert(!JSON.stringify(await sql`SELECT before,after FROM audit_log WHERE actor_id=${ids.owner}`).match(/password|token_hash/));

  // Bulk actions are validated, applied and audited.
  const bulkIds = (await ok('owner', 'cc-inbox')).items.filter((e) => e.cabinet_id === ids.cabinet || e.cabinet_id === ids.other).map((e) => e.id);
  await ok('owner', 'cc-bulk', { entity: 'events', ids: bulkIds, patch: { owner_id: ids.owner, status: 'in_progress' }, reason: 'Test bulk' });
  assert((await sql.query(`SELECT owner_id,status FROM operational_events WHERE id=ANY($1::uuid[])`, [bulkIds])).every((e) => e.owner_id === ids.owner && e.status === 'in_progress'));
  assert.equal((await call('owner', 'cc-bulk', { entity: 'events', ids: bulkIds, patch: { status: 'hacked' } })).status, 400);
  await ok('owner', 'cc-bulk', { entity: 'cabinets', ids: [ids.cabinet, ids.other, ids.patient], patch: { tag: 'pilote', lifecycle: 'active' } });
  const crm = await sql.query(`SELECT cabinet_id,lifecycle,tags FROM cabinet_crm WHERE cabinet_id=ANY($1::uuid[])`, [[ids.cabinet, ids.other, ids.patient]]);
  assert.equal(crm.length, 2, 'non-cabinet ids are ignored'); assert(crm.every((c) => c.lifecycle === 'active' && c.tags.includes('pilote')));
  const flags = await ok('cabinet', 'feature-flags'); assert.equal(typeof flags.flags, 'object');

  // Appointments: admin can consult and manage; narrower roles cannot modify; changes are audited.
  const slotId = randomUUID(), apId = randomUUID();
  await sql`INSERT INTO slots(id,professional_id,starts_at,duration,available) VALUES(${slotId},${ids.cabinet},now()+interval '3 days',45,false)`;
  await sql`INSERT INTO appointments(id,slot_id,patient_id,professional_id,reason) VALUES(${apId},${slotId},${ids.patient},${ids.cabinet},'MOTIF-SOIN-CCTEST')`;
  const apView = await ok('owner', 'cc-appointment', undefined, { id: apId });
  assert.equal(apView.appointment.patient_name, 'CC Test patient Dupont'); assert(!JSON.stringify(apView).includes('MOTIF-SOIN-CCTEST'), 'care reason hidden');
  assert.equal((await call('agent', 'cc-appointment-update', { id: apId, status: 'cancelled', reason: 'x' })).status, 403);
  assert.equal((await call('owner', 'cc-appointment-update', { id: apId, status: 'cancelled' })).status, 400, 'reason required');
  const newStart = new Date(Date.now() + 5 * 86400000); newStart.setUTCMinutes(0, 0, 0);
  await ok('owner', 'cc-appointment-update', { id: apId, starts_at: newStart.toISOString(), duration: 60, reason: 'Demande du cabinet' });
  const [moved] = await sql`SELECT s.starts_at,s.duration FROM appointments ap JOIN slots s ON s.id=ap.slot_id WHERE ap.id=${apId}`;
  assert.equal(new Date(moved.starts_at).getTime(), newStart.getTime()); assert.equal(moved.duration, 60);
  assert.equal((await sql`SELECT available FROM slots WHERE id=${slotId}`)[0].available, true, 'old slot released');
  await ok('owner', 'cc-appointment-update', { id: apId, status: 'cancelled', reason: 'Patient indisponible' });
  assert.equal((await sql`SELECT status FROM appointments WHERE id=${apId}`)[0].status, 'cancelled');
  assert.equal((await call('owner', 'cc-appointment-update', { id: apId, status: 'completed', reason: 'x' })).status, 409, 'future appointment cannot be completed');
  assert((await sql`SELECT 1 FROM audit_log WHERE action='appointment_updated' AND entity_id=${apId}`).length === 2);
  assert((await sql`SELECT 1 FROM notifications WHERE account_id=${ids.patient} AND kind='appointment'`).length >= 2, 'patient notified');

  // Ask Amelib is grounded: unknown questions are declined, supported ones use data.
  assert.equal((await ok('owner', 'cc-ask', undefined, { q: 'Quelle est la météo ?' })).intent, null);
  assert.equal((await ok('owner', 'cc-ask', undefined, { q: 'Résume Cabinet CCTest cabinet' })).intent, 'cabinet_summary');
  const home = await ok('owner', 'cc-home');
  assert(home.brief.length >= 1 && typeof home.counts.todo === 'number');
  console.log('PASS: admin isolation, internal RBAC, private support notes, inbox rules (idempotent, snooze, auto-resolve), finance maths, need-to-know 360°, notes, search scoping, read-only view-as, verification workflow, append-only audit, grounded Ask.');
} finally {
  const all = Object.values(ids);
  await sql.query(`DELETE FROM audit_log WHERE actor_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM internal_notes WHERE author_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM support_messages WHERE author_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM support_tickets WHERE account_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM assist_sessions WHERE admin_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM operational_events WHERE cabinet_id=ANY($1::uuid[]) OR created_by=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM business_documents WHERE owner_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM appointments WHERE professional_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM slots WHERE professional_id=ANY($1::uuid[])`, [all]);
  await sql.query(`DELETE FROM accounts WHERE id=ANY($1::uuid[]) AND email LIKE 'amelib-cc-test-%@example.invalid'`, [all]);
  await sql.query(`DELETE FROM rate_limits WHERE key LIKE 'write:%' AND key=ANY($1::text[])`, [all.map((i) => 'write:' + i)]);
  console.log('Temporary Command Center test records removed.');
  sql.end?.();
}
