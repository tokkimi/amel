// Amelib Command Center — admin-only API actions (prefix "cc-").
// Every action checks the internal permission it needs; every mutation is audited.
import { randomUUID } from 'node:crypto';
import { clean } from './security.mjs';
import { adminContext, INTERNAL_ROLES, PERMISSIONS } from './rbac.mjs';
import { auditEntry } from './audit.mjs';
import { healthScore, onboarding, slaState, agingBucket, SLA_HOURS } from './health.mjs';
import { runAutomations, ruleConfig, ALL_RULES, CABINETS_CTE, CABINET_STATS } from './automations.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const isUuid = (x) => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const dateOrNull = (x) => (x && Number.isFinite(new Date(x).getTime()) ? new Date(x).toISOString() : null);
const like = (q) => '%' + String(q).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
const EVENT_TYPES = ['verification', 'finance', 'support', 'document', 'onboarding', 'appointment', 'operational', 'security'];
const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const TICKET_STATUSES = ['new', 'open', 'in_progress', 'waiting_customer', 'resolved', 'closed'];
const TICKET_PRIORITIES = ['low', 'normal', 'high', 'critical'];
const TICKET_CATEGORIES = ['general', 'access', 'billing', 'tiers_payant', 'bug', 'onboarding', 'data', 'other'];
const VERIFICATION_STATUSES = ['new', 'documents_received', 'reviewing', 'missing_information', 'approved', 'rejected'];
const VERIFICATION_CHECKS = ['identity', 'professional_id', 'cabinet', 'documents', 'contact'];
const LIFECYCLES = ['lead', 'contacted', 'demo', 'onboarding', 'active', 'at_risk', 'churned'];
const VIEW_SCOPES = ['inbox', 'cabinets', 'support', 'finance', 'verifications'];

// Action → required permission. Unknown cc-* actions are rejected.
const REQUIRED = {
  'cc-me': null, 'cc-badges': null, 'cc-home': null, 'cc-inbox': null, 'cc-event': null, 'cc-search': null, 'cc-notifications': null, 'cc-views': null, 'cc-ask': null,
  'cc-event-create': 'inbox.manage', 'cc-event-update': 'inbox.manage', 'cc-bulk': null, 'cc-note-add': null, 'cc-view-save': null, 'cc-view-delete': null,
  'cc-cabinets': 'cabinet.read', 'cc-cabinet': 'cabinet.read', 'cc-timeline': null, 'cc-crm-update': 'cabinet.update',
  'cc-support': 'support.read', 'cc-ticket': 'support.read', 'cc-ticket-reply': 'support.reply', 'cc-ticket-update': 'support.reply',
  'cc-verifications': 'verification.read', 'cc-verification-update': null, 'cc-accounts': 'account.read',
  'cc-finance': 'billing.read', 'cc-operations': 'cabinet.read', 'cc-analytics': 'analytics.read', 'cc-audit': 'audit.read',
  'cc-config': 'settings.read', 'cc-system': 'settings.read', 'cc-rule-update': 'settings.update', 'cc-automations-run': 'settings.update',
  'cc-flag-save': 'settings.update', 'cc-flag-override': 'settings.update', 'cc-role-assign': 'rbac.manage',
  'cc-assist-start': 'impersonation.readonly', 'cc-assist-view': 'impersonation.readonly', 'cc-assist-end': 'impersonation.readonly',
  'cc-export-log': 'export.bulk', 'cc-appointment': 'cabinet.read', 'cc-appointment-update': 'appointment.manage',
};

const cabinetName = (r) => (r?.clinic_name || r?.name || '');
async function cabinetStats(sql, id = null) {
  const rows = id
    ? await sql.query(`WITH ${CABINETS_CTE} ${CABINET_STATS} WHERE cab.id=$1`, [id])
    : await sql.query(`WITH ${CABINETS_CTE} ${CABINET_STATS} ORDER BY cab.created_at DESC LIMIT 2000`, []);
  return rows.map((r) => {
    const health = healthScore(r);
    const lifecycle = r.lifecycle || (health.onboarding.completed < health.onboarding.total - 1 ? 'onboarding' : 'active');
    return { ...r, lifecycle, lifecycle_derived: !r.lifecycle, health };
  });
}
async function eventsWithNames(sql, where, params, limit = 500) {
  return sql.query(`SELECT e.*,o.name AS owner_name,c.name AS cabinet_owner_name,nullif(p.clinic_name,'') AS clinic_name,
    (SELECT count(*)::int FROM internal_notes n WHERE n.entity_type='event' AND n.entity_id=e.id::text) AS note_count
    FROM operational_events e LEFT JOIN accounts o ON o.id=e.owner_id LEFT JOIN accounts c ON c.id=e.cabinet_id LEFT JOIN profiles p ON p.account_id=e.cabinet_id
    WHERE ${where} ORDER BY CASE e.severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC,e.created_at ASC LIMIT ${Number(limit)}`, params);
}
const ACTIVE = `e.status IN('open','in_progress') AND (e.snoozed_until IS NULL OR e.snoozed_until<=now())`;
function categoryOf(e) {
  const set = ['all'];
  if (['high', 'critical'].includes(e.severity)) set.push('urgent');
  if (e.type === 'verification') set.push('validate');
  if (e.type === 'support') set.push('support');
  if (e.type === 'finance') set.push('finance');
  if (e.cabinet_id && ['onboarding', 'operational', 'appointment', 'document'].includes(e.type)) set.push('cabinets');
  if (e.type === 'security' || (e.source === 'rule' && ['operational', 'onboarding', 'appointment', 'document'].includes(e.type))) set.push('alerts');
  return set;
}
async function timeline(sql, { cabinetId = null, entityType = null, entityId = null, limit = 80 }) {
  if (cabinetId) {
    return sql.query(`WITH people AS (SELECT $1::uuid AS id UNION SELECT member_id FROM clinic_members WHERE owner_id=$1 AND active AND accepted)
      SELECT * FROM (
       SELECT l.created_at AS at,'audit' AS kind,l.action AS code,coalesce(nullif(l.reason,''),l.detail) AS label,a.name AS actor,a.role AS actor_role FROM audit_log l JOIN accounts a ON a.id=l.actor_id
        WHERE l.tenant_id=$1 OR l.target_id IN(SELECT id FROM people) OR (l.entity_type='cabinet' AND l.entity_id=$1::text)
       UNION ALL SELECT ap.created_at,'appointment','appointment_created','Rendez-vous planifié',NULL,NULL FROM appointments ap WHERE ap.professional_id=$1
       UNION ALL SELECT d.created_at,'document',d.doc_type||'_created',CASE d.doc_type WHEN 'quote' THEN 'Devis ' ELSE 'Facture ' END||d.number||' créé ('||to_char(d.total,'FM999999990.00')||' €)',NULL,NULL FROM business_documents d WHERE d.owner_id=$1
       UNION ALL SELECT d.sent_at,'document',d.doc_type||'_sent',CASE d.doc_type WHEN 'quote' THEN 'Devis ' ELSE 'Facture ' END||d.number||' envoyé',NULL,NULL FROM business_documents d WHERE d.owner_id=$1 AND d.sent_at IS NOT NULL
       UNION ALL SELECT t.created_at,'support','ticket_created','Ticket support : '||t.subject,a.name,a.role FROM support_tickets t JOIN accounts a ON a.id=t.account_id WHERE t.account_id IN(SELECT id FROM people)
       UNION ALL SELECT n.created_at,'note','note_added','Note interne ajoutée',a.name,a.role FROM internal_notes n JOIN accounts a ON a.id=n.author_id WHERE n.cabinet_id=$1
       UNION ALL SELECT e.created_at,'event','event_created',e.title,NULL,NULL FROM operational_events e WHERE e.cabinet_id=$1
       UNION ALL SELECT cm.created_at,'team','member_invited','Membre d’équipe invité'||CASE WHEN cm.job_title<>'' THEN ' ('||cm.job_title||')' ELSE '' END,NULL,NULL FROM clinic_members cm WHERE cm.owner_id=$1
       UNION ALL SELECT r.created_at,'patient','patient_created','Nouvelle fiche patient',NULL,NULL FROM patient_records r WHERE r.owner_id=$1
       UNION ALL SELECT s.started_at,'assist','assist_started','Mode assistance (lecture seule) : '||s.reason,a.name,a.role FROM assist_sessions s JOIN accounts a ON a.id=s.admin_id WHERE s.cabinet_id=$1
      ) x WHERE at IS NOT NULL ORDER BY at DESC LIMIT ${Number(limit)}`, [cabinetId]);
  }
  return sql.query(`SELECT * FROM (
     SELECT l.created_at AS at,'audit' AS kind,l.action AS code,coalesce(nullif(l.reason,''),l.detail) AS label,a.name AS actor,a.role AS actor_role FROM audit_log l JOIN accounts a ON a.id=l.actor_id WHERE l.entity_type=$1 AND l.entity_id=$2
     UNION ALL SELECT n.created_at,'note','note_added',n.body,a.name,a.role FROM internal_notes n JOIN accounts a ON a.id=n.author_id WHERE n.entity_type=$1 AND n.entity_id=$2
     UNION ALL SELECT l.created_at,'audit',l.action,coalesce(nullif(l.reason,''),l.detail),a.name,a.role FROM audit_log l JOIN accounts a ON a.id=l.actor_id WHERE $1='account' AND l.target_id::text=$2 AND l.entity_type IS NULL
    ) x ORDER BY at DESC LIMIT ${Number(limit)}`, [entityType, String(entityId)]);
}

export async function commandCenterAction({ action, req, b, sql, account, send, ctx }) {
  if (!action?.startsWith('cc-')) return false;
  if (account.role !== 'admin') throw fail(403, 'Accès administrateur requis.');
  if (!(action in REQUIRED)) throw fail(404, 'Action introuvable.');
  const admin = await adminContext(sql, account);
  const can = (p) => admin.permissions.has(p);
  const need = (p) => { if (p && !can(p)) throw fail(403, 'Votre rôle interne ne permet pas cette action.'); };
  need(REQUIRED[action]);
  const q = req.query || {};
  const audit = (entry) => auditEntry(sql, ctx, { actorId: account.id, ...entry });
  const GET = req.method === 'GET', POST = req.method === 'POST';
  const sync = () => runAutomations(sql, { actorId: account.id, ctx }).catch(() => null);

  // ── Identity & team ──────────────────────────────────────────────────────────────────────────
  if (action === 'cc-me' && GET) {
    const team = await sql`SELECT a.id,a.name,a.email,coalesce(m.internal_role,'platform_owner') AS internal_role FROM accounts a LEFT JOIN admin_members m ON m.account_id=a.id WHERE a.role='admin' AND NOT a.suspended ORDER BY a.name`;
    const [assist] = await sql`SELECT s.id,s.cabinet_id,s.reason,s.started_at,coalesce(nullif(p.clinic_name,''),c.name) AS cabinet_name FROM assist_sessions s JOIN accounts c ON c.id=s.cabinet_id JOIN profiles p ON p.account_id=c.id WHERE s.admin_id=${account.id} AND s.ended_at IS NULL ORDER BY s.started_at DESC LIMIT 1`;
    send({ account: { id: account.id, name: account.name, email: account.email }, role: admin.role, role_label: admin.label, permissions: [...admin.permissions], team, roles: Object.entries(INTERNAL_ROLES).map(([key, r]) => ({ key, label: r.label, permissions: r.permissions })), assist: assist || null });
    return true;
  }

  if (action === 'cc-badges' && GET) {
    const [c] = await sql`SELECT (SELECT count(*)::int FROM operational_events e WHERE e.status IN('open','in_progress') AND (e.snoozed_until IS NULL OR e.snoozed_until<=now())) AS inbox,
      (SELECT count(*)::int FROM operational_events e WHERE e.status IN('open','in_progress') AND (e.snoozed_until IS NULL OR e.snoozed_until<=now()) AND e.severity IN('high','critical')) AS urgent,
      (SELECT count(*)::int FROM support_tickets WHERE status IN('new','open')) AS support,
      (SELECT count(*)::int FROM notifications WHERE account_id=${account.id} AND read_at IS NULL) AS notifications`;
    send({ inbox: c.inbox, urgent: c.urgent, support: can('support.read') ? c.support : 0, notifications: c.notifications });
    return true;
  }
  // ── Home / Command Center ────────────────────────────────────────────────────────────────────
  if (action === 'cc-home' && GET) {
    await sync();
    const [events, counts, team, recent] = await Promise.all([
      eventsWithNames(sql, ACTIVE, [], 300),
      sql`SELECT
        (SELECT count(*)::int FROM accounts a WHERE a.role='professional' AND a.created_at>now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM clinic_members m WHERE m.member_id=a.id AND m.accepted)) AS new_cabinets_7d,
        (SELECT count(*)::int FROM accounts a WHERE a.role='professional' AND a.created_at>now()-interval '1 day') AS signups_24h,
        (SELECT count(*)::int FROM accounts a JOIN profiles p ON p.account_id=a.id LEFT JOIN verifications v ON v.account_id=a.id WHERE a.role IN('professional','worker') AND NOT a.suspended AND NOT p.verified AND coalesce(v.status,CASE WHEN p.identifier<>'' THEN 'documents_received' ELSE 'new' END) IN('documents_received','reviewing')) AS verifications_pending,
        (SELECT count(*)::int FROM business_documents WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date=current_date-1) AS invoices_newly_overdue,
        (SELECT count(*)::int FROM business_documents WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date<current_date) AS invoices_overdue,
        (SELECT coalesce(sum(total),0)::float FROM business_documents WHERE doc_type='invoice' AND status IN('sent','accepted')) AS outstanding,
        (SELECT coalesce(sum(total),0)::float FROM business_documents WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date<current_date) AS overdue_amount,
        (SELECT count(*)::int FROM support_tickets WHERE status IN('new','open','in_progress')) AS tickets_open,
        (SELECT count(*)::int FROM support_tickets WHERE status IN('new','open','in_progress') AND priority IN('critical','high')) AS tickets_urgent,
        (SELECT count(*)::int FROM patient_records WHERE prosthesis_date BETWEEN current_date AND current_date+7) AS poses_week,
        (SELECT count(*)::int FROM operational_events WHERE status IN('open','in_progress') AND due_at BETWEEN now() AND now()+interval '7 days') AS deadlines_week,
        (SELECT count(DISTINCT cabinet_id)::int FROM operational_events WHERE status IN('open','in_progress') AND rule_key IN('cabinet_inactive','onboarding_stalled')) +
        (SELECT count(*)::int FROM cabinet_crm WHERE next_contact_at<=now() AND lifecycle NOT IN('churned') AND cabinet_id NOT IN(SELECT cabinet_id FROM operational_events WHERE status IN('open','in_progress') AND rule_key IN('cabinet_inactive','onboarding_stalled') AND cabinet_id IS NOT NULL)) AS cabinets_to_contact,
        (SELECT count(*)::int FROM operational_events WHERE status IN('open','in_progress') AND rule_key='onboarding_stalled') AS onboarding_stalled,
        (SELECT count(*)::int FROM operational_events WHERE status IN('open','in_progress') AND snoozed_until>now()) AS snoozed`,
      sql`SELECT a.id,a.name,count(e.id) FILTER(WHERE e.status IN('open','in_progress'))::int AS open_count,count(e.id) FILTER(WHERE e.status IN('open','in_progress') AND e.due_at<now())::int AS overdue,count(e.id) FILTER(WHERE e.status='resolved' AND e.resolved_at>current_date)::int AS resolved_today
        FROM accounts a LEFT JOIN operational_events e ON e.owner_id=a.id WHERE a.role='admin' AND NOT a.suspended GROUP BY a.id,a.name ORDER BY open_count DESC,a.name`,
      sql`SELECT l.created_at AS at,l.action AS code,coalesce(nullif(l.reason,''),l.detail) AS label,a.name AS actor,l.entity_type,l.entity_id FROM audit_log l JOIN accounts a ON a.id=l.actor_id ORDER BY l.created_at DESC LIMIT 12`,
    ]);
    const c = counts[0];
    const urgent = events.filter((e) => ['high', 'critical'].includes(e.severity));
    const unassigned = events.filter((e) => !e.owner_id).length;
    const brief = [
      `${events.length} élément(s) nécessitent ton attention${urgent.length ? `, dont ${urgent.length} urgent(s)` : ''}.`,
      c.new_cabinets_7d ? `${c.new_cabinets_7d} nouveau(x) cabinet(s) inscrit(s) cette semaine${c.signups_24h ? ` (${c.signups_24h} depuis hier)` : ''}.` : null,
      c.verifications_pending ? `${c.verifications_pending} vérification(s) en attente.` : null,
      c.invoices_overdue ? `${c.invoices_overdue} facture(s) cabinet en retard${c.invoices_newly_overdue ? `, dont ${c.invoices_newly_overdue} passée(s) en retard hier` : ''}.` : null,
      c.tickets_open ? `${c.tickets_open} ticket(s) ouvert(s)${c.tickets_urgent ? `, dont ${c.tickets_urgent} urgent(s)` : ''}.` : null,
      c.poses_week + c.deadlines_week ? `${c.poses_week} pose(s) et ${c.deadlines_week} échéance(s) prévues sur 7 jours.` : null,
      unassigned ? `${unassigned} élément(s) ne sont assignés à personne.` : null,
    ].filter(Boolean);
    const priorities = [...events].sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || new Date(x.created_at) - new Date(y.created_at)).slice(0, 3);
    send({ counts: { ...c, todo: events.length, urgent: urgent.length, unassigned }, brief, priorities, now: events.slice(0, 12), team, recent });
    return true;
  }

  // ── Inbox ────────────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-inbox' && GET) {
    await sync();
    const view = String(q.view || 'active');
    const where = view === 'snoozed' ? `e.status IN('open','in_progress') AND e.snoozed_until>now()`
      : view === 'resolved' ? `e.status IN('resolved','dismissed') AND coalesce(e.resolved_at,e.updated_at)>now()-interval '30 days'`
        : ACTIVE;
    let rows = await eventsWithNames(sql, where, [], 500);
    if (view === 'mine') rows = rows.filter((e) => e.owner_id === account.id);
    if (view === 'team') rows = rows.filter((e) => e.owner_id);
    if (view === 'unassigned') rows = rows.filter((e) => !e.owner_id);
    if (view === 'overdue') rows = rows.filter((e) => e.due_at && new Date(e.due_at) < new Date());
    const search = clean(q.q, 120).toLowerCase();
    if (search) rows = rows.filter((e) => [e.title, e.description, e.clinic_name, e.cabinet_owner_name, e.owner_name].join(' ').toLowerCase().includes(search));
    if (q.cabinet && isUuid(q.cabinet)) rows = rows.filter((e) => e.cabinet_id === q.cabinet);
    if (q.min_age_hours) rows = rows.filter((e) => Date.now() - new Date(e.created_at).getTime() >= Number(q.min_age_hours) * 3600000);
    if (q.type && EVENT_TYPES.includes(q.type)) rows = rows.filter((e) => e.type === q.type);
    const items = rows.map((e) => ({ ...e, categories: categoryOf(e) }));
    const counts = {};
    for (const e of items) for (const k of e.categories) counts[k] = (counts[k] || 0) + 1;
    const filter = String(q.filter || 'all');
    send({ items: items.filter((e) => e.categories.includes(filter)), counts, view, filter });
    return true;
  }
  if (action === 'cc-event' && GET) {
    if (!isUuid(q.id)) throw fail(400, 'Élément invalide.');
    const [event] = await eventsWithNames(sql, 'e.id=$1', [q.id], 1);
    if (!event) throw fail(404, 'Élément introuvable.');
    const [notes, history] = await Promise.all([
      sql`SELECT n.id,n.body,n.mentions,n.created_at,a.name AS author FROM internal_notes n JOIN accounts a ON a.id=n.author_id WHERE n.entity_type='event' AND n.entity_id=${q.id} ORDER BY n.created_at DESC`,
      timeline(sql, { entityType: 'event', entityId: q.id }),
    ]);
    const rule = event.rule_key ? ALL_RULES.find((r) => r.key === event.rule_key) : null;
    send({ event: { ...event, categories: categoryOf(event) }, notes, history, rule: rule ? { label: rule.label, condition: rule.condition, action: rule.action } : null });
    return true;
  }
  if (action === 'cc-event-create' && POST) {
    const title = clean(b.title, 200);
    if (!title) throw fail(400, 'Donnez un titre à la tâche.');
    const type = EVENT_TYPES.includes(b.type) ? b.type : 'operational';
    const severity = SEVERITIES.includes(b.severity) ? b.severity : 'medium';
    const cabinet = isUuid(b.cabinet_id) ? b.cabinet_id : null;
    const owner = isUuid(b.owner_id) ? b.owner_id : null;
    if (owner) { const [o] = await sql`SELECT 1 FROM accounts WHERE id=${owner} AND role='admin'`; if (!o) throw fail(400, 'Responsable invalide.'); }
    if (cabinet) { const [c] = await sql`SELECT 1 FROM accounts WHERE id=${cabinet}`; if (!c) throw fail(404, 'Cabinet introuvable.'); }
    const id = randomUUID();
    const row = { type, severity, title, description: clean(b.description, 3000), cabinet_id: cabinet, owner_id: owner, due_at: dateOrNull(b.due_at) };
    const writes = [
      sql`INSERT INTO operational_events(id,type,severity,cabinet_id,entity_type,entity_id,title,description,owner_id,due_at,source,created_by) VALUES(${id},${type},${severity},${cabinet},${cabinet ? 'cabinet' : null},${cabinet},${title},${row.description},${owner},${row.due_at},'manual',${account.id})`,
      audit({ action: 'event_created', entityType: 'event', entityId: id, tenantId: cabinet, after: row, detail: 'Tâche créée : ' + title }),
    ];
    if (owner && owner !== account.id) writes.push(sql`INSERT INTO notifications(id,account_id,kind,title,body,href,cabinet_id,category) VALUES(${randomUUID()},${owner},'task','Tâche assignée',${title},${'/admin?tab=Inbox&event=' + id},${cabinet},'action')`);
    await sql.transaction(writes);
    send({ ok: true, id });
    return true;
  }
  if (action === 'cc-event-update' && POST) {
    if (!isUuid(b.id)) throw fail(400, 'Élément invalide.');
    const [before] = await sql`SELECT * FROM operational_events WHERE id=${b.id}`;
    if (!before) throw fail(404, 'Élément introuvable.');
    const patch = await eventPatch(sql, b);
    const after = { ...before, ...patch };
    const writes = [
      sql`UPDATE operational_events SET status=${after.status},owner_id=${after.owner_id},due_at=${after.due_at},snoozed_until=${after.snoozed_until},severity=${after.severity},
        resolved_at=${['resolved', 'dismissed'].includes(after.status) ? before.resolved_at || new Date().toISOString() : null},resolved_by=${['resolved', 'dismissed'].includes(after.status) ? account.id : null},
        auto_resolved=false,updated_at=now() WHERE id=${b.id}`,
      audit({ action: 'event_updated', entityType: 'event', entityId: b.id, tenantId: before.cabinet_id, before: pick(before, Object.keys(patch)), after: patch, reason: clean(b.reason, 500), detail: describePatch(patch) }),
    ];
    if (before.entity_type === 'ticket' && 'owner_id' in patch && isUuid(before.entity_id)) writes.push(sql`UPDATE support_tickets SET owner_id=${patch.owner_id},updated_at=now() WHERE id=${before.entity_id}`);
    if (patch.owner_id && patch.owner_id !== before.owner_id && patch.owner_id !== account.id) writes.push(sql`INSERT INTO notifications(id,account_id,kind,title,body,href,cabinet_id,category) VALUES(${randomUUID()},${patch.owner_id},'task','Élément assigné',${before.title},${'/admin?tab=Inbox&event=' + b.id},${before.cabinet_id},'action')`);
    if (clean(b.note, 4000)) writes.push(sql`INSERT INTO internal_notes(id,entity_type,entity_id,cabinet_id,author_id,body) VALUES(${randomUUID()},'event',${b.id},${before.cabinet_id},${account.id},${clean(b.note, 4000)})`);
    await sql.transaction(writes);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-bulk' && POST) {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter(isUuid).slice(0, 200);
    if (!ids.length) throw fail(400, 'Aucun élément sélectionné.');
    if (b.entity === 'events') {
      need('inbox.manage');
      const patch = await eventPatch(sql, b.patch || {});
      if (!Object.keys(patch).length) throw fail(400, 'Aucune modification demandée.');
      const sets = [], values = [ids];
      for (const [k, v] of Object.entries(patch)) { values.push(v); sets.push(`${k}=$${values.length}`); }
      if (patch.status) { const closing = ['resolved', 'dismissed'].includes(patch.status); values.push(closing ? account.id : null); sets.push(`resolved_at=${closing ? 'now()' : 'NULL'}`, `resolved_by=$${values.length}::uuid`, 'auto_resolved=false'); }
      await sql.transaction([
        sql.query(`UPDATE operational_events SET ${sets.join(',')},updated_at=now() WHERE id=ANY($1::uuid[])`, values),
        audit({ action: 'bulk_events_updated', entityType: 'event', entityId: 'bulk', after: { ids, patch }, reason: clean(b.reason, 500), detail: `${ids.length} élément(s) modifié(s) : ${describePatch(patch)}` }),
      ]);
      send({ ok: true, count: ids.length });
      return true;
    }
    if (b.entity === 'cabinets') {
      need('cabinet.update');
      const lifecycle = LIFECYCLES.includes(b.patch?.lifecycle) ? b.patch.lifecycle : null;
      const tag = clean(b.patch?.tag, 40);
      const owner = isUuid(b.patch?.owner_id) ? b.patch.owner_id : null;
      if (!lifecycle && !tag && !owner) throw fail(400, 'Aucune modification demandée.');
      const valid = await sql.query(`SELECT a.id FROM accounts a WHERE a.id=ANY($1::uuid[]) AND a.role='professional'`, [ids]);
      const list = valid.map((r) => r.id);
      await sql.transaction([
        sql.query(`INSERT INTO cabinet_crm(cabinet_id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING`, [list]),
        ...(lifecycle ? [sql.query(`UPDATE cabinet_crm SET lifecycle=$2,updated_at=now() WHERE cabinet_id=ANY($1::uuid[])`, [list, lifecycle])] : []),
        ...(owner ? [sql.query(`UPDATE cabinet_crm SET owner_id=$2,updated_at=now() WHERE cabinet_id=ANY($1::uuid[])`, [list, owner])] : []),
        ...(tag ? [sql.query(`UPDATE cabinet_crm SET tags=CASE WHEN tags ? $2 THEN tags ELSE tags||to_jsonb($2::text) END,updated_at=now() WHERE cabinet_id=ANY($1::uuid[])`, [list, tag])] : []),
        audit({ action: 'bulk_cabinets_updated', entityType: 'cabinet', entityId: 'bulk', after: { ids: list, lifecycle, tag, owner }, reason: clean(b.reason, 500), detail: `${list.length} cabinet(s) modifié(s)` }),
      ]);
      send({ ok: true, count: list.length });
      return true;
    }
    throw fail(400, 'Type d’élément invalide.');
  }
  if (action === 'cc-note-add' && POST) {
    const body = clean(b.body, 4000);
    if (!body) throw fail(400, 'La note est vide.');
    if (!['cabinet', 'event', 'account'].includes(b.entity_type) || !isUuid(b.entity_id)) throw fail(400, 'Élément invalide.');
    let cabinet = null;
    if (b.entity_type === 'cabinet') { need('cabinet.update'); const [c] = await sql`SELECT id FROM accounts WHERE id=${b.entity_id} AND role IN('professional','admin')`; if (!c) throw fail(404, 'Cabinet introuvable.'); cabinet = c.id; }
    if (b.entity_type === 'event') { need('inbox.manage'); const [e] = await sql`SELECT cabinet_id FROM operational_events WHERE id=${b.entity_id}`; if (!e) throw fail(404, 'Élément introuvable.'); cabinet = e.cabinet_id; }
    if (b.entity_type === 'account') { need('account.read'); const [a] = await sql`SELECT id FROM accounts WHERE id=${b.entity_id}`; if (!a) throw fail(404, 'Compte introuvable.'); }
    const team = await sql`SELECT id FROM accounts WHERE role='admin'`;
    const mentions = (Array.isArray(b.mentions) ? b.mentions : []).filter((m) => team.some((t) => t.id === m)).slice(0, 10);
    const id = randomUUID();
    await sql.transaction([
      sql`INSERT INTO internal_notes(id,entity_type,entity_id,cabinet_id,author_id,body,mentions) VALUES(${id},${b.entity_type},${b.entity_id},${cabinet},${account.id},${body},${JSON.stringify(mentions)}::jsonb)`,
      ...mentions.filter((m) => m !== account.id).map((m) => sql`INSERT INTO notifications(id,account_id,kind,title,body,href,cabinet_id,category) VALUES(${randomUUID()},${m},'mention',${account.name + ' vous a mentionné'},${body.slice(0, 300)},${b.entity_type === 'cabinet' ? '/admin?tab=Cabinets&cabinet=' + b.entity_id : '/admin?tab=Inbox&event=' + b.entity_id},${cabinet},'info')`),
      audit({ action: 'internal_note_added', entityType: b.entity_type, entityId: b.entity_id, tenantId: cabinet, detail: 'Note interne ajoutée' }),
    ]);
    send({ ok: true, id });
    return true;
  }

  // ── Universal search ────────────────────────────────────────────────────────────────────────
  if (action === 'cc-search' && GET) {
    const term = clean(q.q, 80);
    if (term.length < 2) { send({ groups: [] }); return true; }
    const p = like(term);
    const [cabinets, people, tickets, documents, events] = await Promise.all([
      can('cabinet.read') ? sql`SELECT a.id,coalesce(nullif(p.clinic_name,''),a.name) AS title,concat_ws(' · ',a.name,nullif(p.city,'')) AS subtitle FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.role='professional' AND NOT EXISTS(SELECT 1 FROM clinic_members m WHERE m.member_id=a.id AND m.active AND m.accepted) AND (p.clinic_name ILIKE ${p} OR a.name ILIKE ${p} OR p.city ILIKE ${p} OR a.email ILIKE ${p}) ORDER BY a.name LIMIT 6` : [],
      can('account.read') ? sql`SELECT a.id,a.name AS title,a.role,CASE WHEN a.role='patient' THEN 'Patient' ELSE a.email END AS subtitle FROM accounts a WHERE (a.name ILIKE ${p} OR (a.role<>'patient' AND a.email ILIKE ${p})) ORDER BY CASE a.role WHEN 'professional' THEN 1 WHEN 'worker' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END,a.name LIMIT 8` : [],
      can('support.read') ? sql`SELECT t.id,t.subject AS title,a.name||' · '||t.status AS subtitle FROM support_tickets t JOIN accounts a ON a.id=t.account_id WHERE t.subject ILIKE ${p} OR a.name ILIKE ${p} OR t.id::text ILIKE ${p} ORDER BY t.updated_at DESC LIMIT 5` : [],
      can('billing.read') ? sql`SELECT d.id,d.owner_id,d.number AS title,coalesce(nullif(pr.clinic_name,''),o.name)||' · '||to_char(d.total,'FM999999990.00')||' € · '||d.status AS subtitle FROM business_documents d JOIN accounts o ON o.id=d.owner_id JOIN profiles pr ON pr.account_id=o.id WHERE d.number ILIKE ${p} OR pr.clinic_name ILIKE ${p} OR o.name ILIKE ${p} ORDER BY d.created_at DESC LIMIT 5` : [],
      sql`SELECT e.id,e.title,e.type||' · '||e.status AS subtitle FROM operational_events e WHERE e.title ILIKE ${p} OR e.description ILIKE ${p} ORDER BY e.created_at DESC LIMIT 5`,
    ]);
    const people_ = people.filter((x) => x.role !== 'patient' || can('cabinet.read'));
    send({ groups: [
      { key: 'cabinets', label: 'Cabinets', items: cabinets },
      { key: 'professionals', label: 'Professionnels', items: people_.filter((x) => ['professional', 'worker'].includes(x.role)) },
      { key: 'users', label: 'Utilisateurs', items: people_.filter((x) => !['professional', 'worker'].includes(x.role)) },
      { key: 'support', label: 'Support', items: tickets },
      { key: 'finance', label: 'Finance', items: documents },
      { key: 'inbox', label: 'Inbox', items: events },
    ].filter((g) => g.items.length) });
    return true;
  }

  // ── Cabinets ────────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-cabinets' && GET) {
    const rows = await cabinetStats(sql);
    send({ cabinets: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, clinic_name: r.clinic_name, city: r.city, phone: r.phone, created_at: r.created_at, suspended: r.suspended, verified: r.verified, published: r.published, lifecycle: r.lifecycle, lifecycle_derived: r.lifecycle_derived, crm_owner_id: r.crm_owner_id, tags: r.tags, next_contact_at: r.next_contact_at, team_count: r.team_count, patient_count: r.patient_count, open_tickets: r.open_tickets, open_events: r.open_events, invoiced: r.invoiced, outstanding: r.outstanding, overdue_amount: r.overdue_amount, overdue_count: r.overdue_count, last_activity_at: r.last_activity_at, health: { score: r.health.score, status: r.health.status, label: r.health.label }, onboarding: { percent: r.health.onboarding.percent, completed: r.health.onboarding.completed, total: r.health.onboarding.total } })) });
    return true;
  }
  if (action === 'cc-cabinet' && GET) {
    if (!isUuid(q.id)) throw fail(400, 'Cabinet invalide.');
    const [stats] = await cabinetStats(sql, q.id);
    if (!stats) throw fail(404, 'Cabinet introuvable.');
    const id = q.id;
    const [team, today, notes, events, tickets, documents, patients, history, flags, assist] = await Promise.all([
      sql`SELECT a.id,a.name,a.email,a.role,a.suspended,a.created_at,coalesce(cm.job_title,'Titulaire') AS job_title,coalesce(cm.permissions,'[]'::jsonb) AS permissions,coalesce(cm.accepted,true) AS accepted,coalesce(cm.active,true) AS active,p.verified,coalesce(v.status,CASE WHEN p.verified THEN 'approved' WHEN p.identifier<>'' THEN 'documents_received' ELSE 'new' END) AS verification_status,
        (SELECT max(s.expires_at)-interval '7 days' FROM sessions s WHERE s.account_id=a.id) AS last_login
        FROM accounts a JOIN profiles p ON p.account_id=a.id LEFT JOIN clinic_members cm ON cm.member_id=a.id AND cm.owner_id=${id} LEFT JOIN verifications v ON v.account_id=a.id
        WHERE a.id=${id} OR a.id IN(SELECT member_id FROM clinic_members WHERE owner_id=${id}) ORDER BY (a.id=${id}) DESC,a.name`,
      sql`SELECT (SELECT count(*)::int FROM appointments ap JOIN slots s ON s.id=ap.slot_id WHERE ap.professional_id=${id} AND ap.status<>'cancelled' AND s.starts_at::date=current_date) AS appointments,
        (SELECT count(*)::int FROM business_documents WHERE owner_id=${id} AND created_at::date=current_date) AS documents,
        (SELECT count(*)::int FROM patient_records WHERE owner_id=${id} AND created_at::date=current_date) AS patients,
        (SELECT coalesce(sum(total),0)::float FROM business_documents WHERE owner_id=${id} AND doc_type='invoice' AND status<>'cancelled' AND issue_date=current_date) AS invoiced,
        (SELECT count(*)::int FROM business_documents WHERE owner_id=${id} AND status='draft') AS drafts,
        (SELECT count(*)::int FROM tasks WHERE owner_id=${id} AND stage<>'Terminé' AND due_at<now()) AS overdue_tasks`,
      sql`SELECT n.id,n.body,n.mentions,n.created_at,a.name AS author FROM internal_notes n JOIN accounts a ON a.id=n.author_id WHERE n.entity_type='cabinet' AND n.entity_id=${id} ORDER BY n.created_at DESC LIMIT 100`,
      eventsWithNames(sql, `e.cabinet_id=$1 AND e.status IN('open','in_progress')`, [id], 100),
      can('support.read') ? sql`SELECT t.id,t.subject,t.status,t.priority,t.category,t.created_at,t.updated_at,a.name AS requester FROM support_tickets t JOIN accounts a ON a.id=t.account_id WHERE t.account_id=${id} OR t.account_id IN(SELECT member_id FROM clinic_members WHERE owner_id=${id} AND accepted) ORDER BY t.updated_at DESC LIMIT 50` : [],
      can('billing.read') ? sql`SELECT d.id,d.number,d.doc_type,d.status,d.total::float AS total,d.issue_date,d.due_date,d.sent_at,d.payment_method,(d.pdf_name<>'') AS has_pdf,CASE WHEN d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date THEN current_date-d.due_date ELSE 0 END AS days_late FROM business_documents d WHERE d.owner_id=${id} ORDER BY d.created_at DESC LIMIT 200` : [],
      // Need-to-know: no clinical data, no contact details, no identifiers. Name initials + operational fields only.
      sql`SELECT r.id,upper(left(split_part(pa.name,' ',1),1))||'. '||upper(left(split_part(pa.name,' ',2),1))||'.' AS initials,r.status,r.created_at,r.prosthesis_date,
        r.mutual_provider,(r.insurance_card_name<>'' OR r.insurance_card_data<>'') AS has_insurance_card,(r.billing_document_name<>'' OR r.billing_document_data<>'') AS has_billing_document,
        (SELECT d.status FROM business_documents d WHERE d.owner_id=r.owner_id AND d.patient_id=r.patient_id AND d.doc_type='quote' ORDER BY d.created_at DESC LIMIT 1) AS quote_status
        FROM patient_records r JOIN accounts pa ON pa.id=r.patient_id WHERE r.owner_id=${id} ORDER BY r.prosthesis_date NULLS LAST,r.created_at DESC LIMIT 100`,
      timeline(sql, { cabinetId: id, limit: 100 }),
      sql`SELECT f.key,f.label,f.rollout,o.enabled AS override FROM feature_flags f LEFT JOIN feature_flag_overrides o ON o.flag_key=f.key AND o.cabinet_id=${id} ORDER BY f.label`,
      sql`SELECT s.id,s.reason,s.started_at,s.ended_at,a.name AS admin FROM assist_sessions s JOIN accounts a ON a.id=s.admin_id WHERE s.cabinet_id=${id} ORDER BY s.started_at DESC LIMIT 20`,
    ]);
    const watch = [];
    if (stats.stale_quotes) watch.push({ severity: 'medium', text: `${stats.stale_quotes} devis sans réponse depuis plus de 9 jours.` });
    if (stats.overdue_count) watch.push({ severity: stats.overdue_max_days > 30 ? 'high' : 'medium', text: `${stats.overdue_count} facture(s) en retard (${Math.round(stats.overdue_amount)} €), jusqu’à ${stats.overdue_max_days} j.` });
    for (const t of tickets.filter((t) => !['resolved', 'closed', 'waiting_customer'].includes(t.status))) {
      const hours = Math.round((Date.now() - new Date(t.created_at).getTime()) / 3600000);
      if (hours >= 24) watch.push({ severity: t.priority === 'critical' ? 'critical' : 'medium', text: `Ticket support « ${t.subject} » ouvert depuis ${hours} h.` });
    }
    for (const m of team.filter((m) => !['approved'].includes(m.verification_status) && m.role !== 'admin')) watch.push({ severity: 'low', text: `Vérification ${m.verification_status === 'missing_information' ? 'incomplète' : 'en attente'} : ${m.name}.` });
    if (today[0].overdue_tasks) watch.push({ severity: 'low', text: `${today[0].overdue_tasks} tâche(s) interne(s) du cabinet en retard.` });
    const flagState = flags.map((f) => ({ ...f, enabled: f.override ?? (f.rollout === 'all' || (f.rollout === 'pilot' && (stats.tags || []).includes('pilote'))) }));
    const patientRows = patients.map((r) => ({ ...r, mutual_provider: can('billing.read') ? r.mutual_provider : '' }));
    send({ cabinet: stats, today: today[0], watch, team, notes, events, tickets, documents, patients: patientRows, history, flags: flagState, assist, onboarding: onboarding(stats) });
    return true;
  }
  if (action === 'cc-timeline' && GET) {
    if (q.entity_type === 'cabinet' && isUuid(q.entity_id)) { need('cabinet.read'); send({ items: await timeline(sql, { cabinetId: q.entity_id }) }); return true; }
    if (!['event', 'account', 'verification', 'ticket', 'invoice', 'cabinet'].includes(q.entity_type) || !q.entity_id) throw fail(400, 'Élément invalide.');
    need({ ticket: 'support.read', account: 'account.read', verification: 'verification.read', invoice: 'billing.read', cabinet: 'cabinet.read', event: null }[q.entity_type]);
    send({ items: await timeline(sql, { entityType: q.entity_type, entityId: clean(q.entity_id, 80) }) });
    return true;
  }
  if (action === 'cc-crm-update' && POST) {
    if (!isUuid(b.cabinet_id)) throw fail(400, 'Cabinet invalide.');
    const [cab] = await sql`SELECT a.id FROM accounts a WHERE a.id=${b.cabinet_id} AND a.role='professional'`;
    if (!cab) throw fail(404, 'Cabinet introuvable.');
    const [before] = await sql`SELECT * FROM cabinet_crm WHERE cabinet_id=${b.cabinet_id}`;
    const next = {
      lifecycle: LIFECYCLES.includes(b.lifecycle) ? b.lifecycle : before?.lifecycle || 'onboarding',
      owner_id: b.owner_id === null ? null : isUuid(b.owner_id) ? b.owner_id : before?.owner_id || null,
      tags: Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => clean(t, 40)).filter(Boolean))].slice(0, 20) : before?.tags || [],
      training_done_at: b.training_done === true ? before?.training_done_at || new Date().toISOString() : b.training_done === false ? null : before?.training_done_at || null,
      next_contact_at: b.next_contact_at === null ? null : dateOrNull(b.next_contact_at) || before?.next_contact_at || null,
    };
    await sql.transaction([
      sql`INSERT INTO cabinet_crm(cabinet_id,lifecycle,owner_id,tags,training_done_at,next_contact_at) VALUES(${b.cabinet_id},${next.lifecycle},${next.owner_id},${JSON.stringify(next.tags)}::jsonb,${next.training_done_at},${next.next_contact_at})
        ON CONFLICT(cabinet_id) DO UPDATE SET lifecycle=excluded.lifecycle,owner_id=excluded.owner_id,tags=excluded.tags,training_done_at=excluded.training_done_at,next_contact_at=excluded.next_contact_at,updated_at=now()`,
      audit({ action: 'cabinet_crm_updated', entityType: 'cabinet', entityId: b.cabinet_id, tenantId: b.cabinet_id, before: before || null, after: next, reason: clean(b.reason, 500), detail: 'Suivi commercial du cabinet mis à jour' }),
    ]);
    send({ ok: true });
    return true;
  }

  // ── Support Center ──────────────────────────────────────────────────────────────────────────
  if (action === 'cc-support' && GET) {
    const rows = await sql`SELECT t.id,t.subject,t.status,t.priority,t.category,t.owner_id,t.due_at,t.first_response_at,t.resolved_at,t.reopened_count,t.last_reply_at,t.created_at,t.updated_at,
      a.name AS requester,a.email AS requester_email,o.name AS owner_name,
      coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=a.id AND cm.active AND cm.accepted LIMIT 1),a.id) AS cabinet_id,
      coalesce((SELECT nullif(p.clinic_name,'') FROM profiles p WHERE p.account_id=coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=a.id AND cm.active AND cm.accepted LIMIT 1),a.id)),a.name) AS cabinet_name,
      (SELECT count(*)::int FROM support_messages m WHERE m.ticket_id=t.id AND m.visibility='internal') AS internal_count,
      (SELECT count(*)::int FROM support_messages m WHERE m.ticket_id=t.id AND m.visibility='public') AS public_count
      FROM support_tickets t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts o ON o.id=t.owner_id ORDER BY t.updated_at DESC LIMIT 500`;
    const tickets = rows.map((t) => ({ ...t, sla: slaState(t) }));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    send({ tickets, kpis: {
      new: tickets.filter((t) => t.status === 'new').length,
      open: tickets.filter((t) => ['open', 'in_progress'].includes(t.status)).length,
      waiting: tickets.filter((t) => t.status === 'waiting_customer').length,
      resolved_today: tickets.filter((t) => t.resolved_at && new Date(t.resolved_at) >= today).length,
      breached: tickets.filter((t) => t.sla.state === 'breached').length,
    }, sla_hours: SLA_HOURS, categories: TICKET_CATEGORIES, statuses: TICKET_STATUSES, priorities: TICKET_PRIORITIES });
    return true;
  }
  if (action === 'cc-ticket' && GET) {
    if (!isUuid(q.id)) throw fail(400, 'Ticket invalide.');
    const [ticket] = await sql`SELECT t.*,a.name AS requester,a.email AS requester_email,o.name AS owner_name,
      coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=a.id AND cm.active AND cm.accepted LIMIT 1),a.id) AS cabinet_id
      FROM support_tickets t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts o ON o.id=t.owner_id WHERE t.id=${q.id}`;
    if (!ticket) throw fail(404, 'Ticket introuvable.');
    const [messages, history, cabinet] = await Promise.all([
      sql`SELECT m.id,m.visibility,m.body,m.attachments,m.created_at,a.name AS author,a.role AS author_role FROM support_messages m JOIN accounts a ON a.id=m.author_id WHERE m.ticket_id=${q.id} ORDER BY m.created_at`,
      timeline(sql, { entityType: 'ticket', entityId: q.id }),
      sql`SELECT a.id,coalesce(nullif(p.clinic_name,''),a.name) AS name FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.id=${ticket.cabinet_id}`,
    ]);
    // Legacy replies written before support_messages existed are shown as the first public answer.
    const legacy = ticket.admin_reply && !messages.some((m) => m.visibility === 'public') ? [{ id: 'legacy', visibility: 'public', body: ticket.admin_reply, created_at: ticket.updated_at, author: 'Équipe SmilePec', author_role: 'admin', attachments: [] }] : [];
    send({ ticket: { ...ticket, sla: slaState(ticket), cabinet_name: cabinet[0]?.name || ticket.requester }, messages: [...legacy, ...messages], history });
    return true;
  }
  if (action === 'cc-ticket-reply' && POST) {
    if (!isUuid(b.id)) throw fail(400, 'Ticket invalide.');
    const body = clean(b.body, 5000);
    if (!body) throw fail(400, 'Le message est vide.');
    if (!['public', 'internal'].includes(b.visibility)) throw fail(400, 'Précisez s’il s’agit d’une réponse au cabinet ou d’une note interne.');
    const [ticket] = await sql`SELECT * FROM support_tickets WHERE id=${b.id}`;
    if (!ticket) throw fail(404, 'Ticket introuvable.');
    const isPublic = b.visibility === 'public';
    const status = TICKET_STATUSES.includes(b.status) ? b.status : isPublic && ['new', 'open'].includes(ticket.status) ? 'waiting_customer' : ticket.status;
    const writes = [
      sql`INSERT INTO support_messages(id,ticket_id,author_id,visibility,body) VALUES(${randomUUID()},${b.id},${account.id},${b.visibility},${body})`,
      isPublic
        ? sql`UPDATE support_tickets SET admin_reply=${body},status=${status},first_response_at=coalesce(first_response_at,now()),last_reply_at=now(),owner_id=coalesce(owner_id,${account.id}),resolved_at=CASE WHEN ${status} IN('resolved','closed') THEN now() ELSE NULL END,updated_at=now() WHERE id=${b.id}`
        : sql`UPDATE support_tickets SET status=${status},updated_at=now() WHERE id=${b.id}`,
      audit({ action: isPublic ? 'support_replied' : 'support_internal_note', entityType: 'ticket', entityId: b.id, tenantId: ticket.account_id, after: { visibility: b.visibility, status }, detail: isPublic ? 'Réponse envoyée au cabinet' : 'Note interne ajoutée au ticket' }),
    ];
    if (isPublic) writes.push(sql`INSERT INTO notifications(id,account_id,kind,title,body,href) VALUES(${randomUUID()},${ticket.account_id},'support','Réponse de SmilePec',${ticket.subject},'/pro?tab=SmilePec')`);
    await sql.transaction(writes);
    send({ ok: true, status });
    return true;
  }
  if (action === 'cc-ticket-update' && POST) {
    if (!isUuid(b.id)) throw fail(400, 'Ticket invalide.');
    const [before] = await sql`SELECT id,account_id,status,priority,category,owner_id,due_at FROM support_tickets WHERE id=${b.id}`;
    if (!before) throw fail(404, 'Ticket introuvable.');
    if ('owner_id' in b && b.owner_id !== before.owner_id) need('support.assign');
    const next = {
      status: TICKET_STATUSES.includes(b.status) ? b.status : before.status,
      priority: TICKET_PRIORITIES.includes(b.priority) ? b.priority : before.priority,
      category: TICKET_CATEGORIES.includes(b.category) ? b.category : before.category,
      owner_id: 'owner_id' in b ? (isUuid(b.owner_id) ? b.owner_id : null) : before.owner_id,
      due_at: 'due_at' in b ? dateOrNull(b.due_at) : before.due_at,
    };
    if (next.owner_id) { const [o] = await sql`SELECT 1 FROM accounts WHERE id=${next.owner_id} AND role='admin'`; if (!o) throw fail(400, 'Responsable invalide.'); }
    const reopened = ['resolved', 'closed'].includes(before.status) && !['resolved', 'closed'].includes(next.status);
    await sql.transaction([
      sql`UPDATE support_tickets SET status=${next.status},priority=${next.priority},category=${next.category},owner_id=${next.owner_id},due_at=${next.due_at},
        resolved_at=CASE WHEN ${next.status} IN('resolved','closed') THEN coalesce(resolved_at,now()) ELSE NULL END,reopened_count=reopened_count+${reopened ? 1 : 0},updated_at=now() WHERE id=${b.id}`,
      sql`UPDATE operational_events SET owner_id=${next.owner_id},updated_at=now() WHERE dedupe_key=${'support:' + b.id}`,
      audit({ action: 'support_updated', entityType: 'ticket', entityId: b.id, tenantId: before.account_id, before, after: next, detail: 'Ticket mis à jour' }),
    ]);
    await runAutomations(sql, { actorId: account.id, ctx, force: true }).catch(() => null);
    send({ ok: true });
    return true;
  }

  // ── Verifications & accounts ───────────────────────────────────────────────────────────────
  if (action === 'cc-verifications' && GET) {
    const rows = await sql`SELECT a.id,a.name,a.email,a.role,a.created_at,a.suspended,p.identifier,p.specialty,p.city,p.qualifications,p.verified,p.clinic_name,p.phone,p.address,
      coalesce(v.status,CASE WHEN p.verified THEN 'approved' WHEN p.identifier<>'' THEN 'documents_received' ELSE 'new' END) AS status,
      coalesce(v.checklist,'{}'::jsonb) AS checklist,v.reviewed_at,v.rejection_reason,v.missing_information,r.name AS reviewer,coalesce(v.updated_at,a.created_at) AS status_since,
      ${OWNER_SQL} AS cabinet_id
      FROM accounts a JOIN profiles p ON p.account_id=a.id LEFT JOIN verifications v ON v.account_id=a.id LEFT JOIN accounts r ON r.id=v.reviewer_id
      WHERE a.role IN('professional','worker') ORDER BY CASE coalesce(v.status,CASE WHEN p.verified THEN 'approved' WHEN p.identifier<>'' THEN 'documents_received' ELSE 'new' END) WHEN 'reviewing' THEN 1 WHEN 'documents_received' THEN 2 WHEN 'missing_information' THEN 3 WHEN 'new' THEN 4 WHEN 'rejected' THEN 5 ELSE 6 END,a.created_at DESC LIMIT 1000`;
    send({ items: rows, statuses: VERIFICATION_STATUSES, checks: VERIFICATION_CHECKS });
    return true;
  }
  if (action === 'cc-verification-update' && POST) {
    if (!isUuid(b.id) || !VERIFICATION_STATUSES.includes(b.status)) throw fail(400, 'Vérification invalide.');
    need(b.status === 'approved' ? 'verification.approve' : b.status === 'rejected' ? 'verification.reject' : 'verification.read');
    const [target] = await sql`SELECT a.id,p.identifier,p.verified,v.status,v.checklist FROM accounts a JOIN profiles p ON p.account_id=a.id LEFT JOIN verifications v ON v.account_id=a.id WHERE a.id=${b.id} AND a.role IN('professional','worker')`;
    if (!target) throw fail(404, 'Professionnel introuvable.');
    const checklist = Object.fromEntries(VERIFICATION_CHECKS.map((k) => [k, !!b.checklist?.[k]]));
    const reason = clean(b.reason, 500);
    if (b.status === 'approved') {
      if (!target.identifier) throw fail(400, 'Identifiant professionnel obligatoire pour la vérification.');
      if (!VERIFICATION_CHECKS.every((k) => checklist[k])) throw fail(400, 'Cochez tous les contrôles avant de valider.');
    }
    if (b.status === 'rejected' && !reason) throw fail(400, 'Indiquez la raison du refus.');
    if (b.status === 'missing_information' && !clean(b.missing_information, 1000)) throw fail(400, 'Précisez les informations manquantes.');
    const verified = b.status === 'approved';
    const decided = ['approved', 'rejected'].includes(b.status);
    await sql.transaction([
      sql`INSERT INTO verifications(account_id,status,checklist,reviewer_id,reviewed_at,rejection_reason,missing_information) VALUES(${b.id},${b.status},${JSON.stringify(checklist)}::jsonb,${account.id},${decided ? new Date().toISOString() : null},${b.status === 'rejected' ? reason : ''},${clean(b.missing_information, 1000)})
        ON CONFLICT(account_id) DO UPDATE SET status=excluded.status,checklist=excluded.checklist,reviewer_id=excluded.reviewer_id,reviewed_at=coalesce(excluded.reviewed_at,verifications.reviewed_at),rejection_reason=excluded.rejection_reason,missing_information=excluded.missing_information,updated_at=now()`,
      sql`UPDATE profiles SET verified=${verified} WHERE account_id=${b.id}`,
      audit({ action: verified ? 'profile_verified' : b.status === 'rejected' ? 'verification_rejected' : 'verification_status_changed', entityType: 'verification', entityId: b.id, tenantId: b.id, before: { status: target.status || (target.verified ? 'approved' : 'documents_received'), checklist: target.checklist }, after: { status: b.status, checklist }, reason, detail: `Vérification : ${b.status}` }),
    ]);
    if (['approved', 'rejected', 'missing_information'].includes(b.status)) await sql`INSERT INTO notifications(id,account_id,kind,title,body,href) VALUES(${randomUUID()},${b.id},'verification',${b.status === 'approved' ? 'Profil vérifié' : b.status === 'rejected' ? 'Vérification refusée' : 'Informations complémentaires demandées'},${b.status === 'missing_information' ? clean(b.missing_information, 1000) : reason},'/pro?tab=Mon%20profil')`;
    await runAutomations(sql, { actorId: account.id, ctx, force: true }).catch(() => null);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-accounts' && GET) {
    const page = Math.min(10000, Math.max(0, Math.floor(Number(q.page) || 0))), size = 50;
    const term = clean(q.q, 80);
    const role = ['patient', 'professional', 'worker', 'admin'].includes(q.role) ? q.role : null;
    const status = ['suspended', 'unverified', 'verified'].includes(q.status) ? q.status : null;
    const rows = await sql.query(`SELECT a.id,a.name,CASE WHEN a.role='patient' THEN '' ELSE a.email END AS email,a.role,a.created_at,a.suspended,p.verified,p.identifier,p.specialty,p.city,p.published,p.qualifications,
      ${OWNER_SQL} AS cabinet_id,count(*) OVER()::int AS total
      FROM accounts a JOIN profiles p ON p.account_id=a.id
      WHERE ($1::text IS NULL OR a.name ILIKE $1 OR (a.role<>'patient' AND a.email ILIKE $1) OR p.city ILIKE $1 OR p.identifier ILIKE $1)
      AND ($2::text IS NULL OR a.role=$2) AND ($3::text IS NULL OR ($3='suspended' AND a.suspended) OR ($3='unverified' AND a.role IN('professional','worker') AND NOT p.verified) OR ($3='verified' AND p.verified))
      ORDER BY a.created_at DESC LIMIT ${size} OFFSET ${page * size}`, [term ? like(term) : null, role, status]);
    send({ items: rows.map(({ total, ...r }) => r), total: rows[0]?.total || 0, page, size });
    return true;
  }

  // ── Finance ─────────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-finance' && GET) {
    const [totals, open, monthly, platform] = await Promise.all([
      sql`SELECT coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status NOT IN('draft','cancelled')),0)::float AS invoiced,
        coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status='paid'),0)::float AS paid,
        coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status IN('sent','accepted')),0)::float AS outstanding,
        coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date<current_date),0)::float AS overdue,
        count(*) FILTER(WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date<current_date)::int AS overdue_count,
        coalesce(sum(total) FILTER(WHERE doc_type='quote' AND status='sent'),0)::float AS quotes_pending,
        coalesce(sum(insurance_amount) FILTER(WHERE doc_type='invoice' AND status IN('sent','accepted')),0)::float AS insurance_expected
        FROM business_documents`,
      sql`SELECT d.id,d.number,d.owner_id,d.total::float AS total,d.status,d.issue_date,d.due_date,d.payment_method,current_date-coalesce(d.due_date,d.issue_date) AS days_late,coalesce(nullif(p.clinic_name,''),o.name) AS cabinet_name
        FROM business_documents d JOIN accounts o ON o.id=d.owner_id JOIN profiles p ON p.account_id=o.id WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') ORDER BY d.due_date NULLS LAST LIMIT 2000`,
      sql`SELECT to_char(date_trunc('month',issue_date),'YYYY-MM') AS month,coalesce(sum(total) FILTER(WHERE status NOT IN('draft','cancelled')),0)::float AS invoiced,coalesce(sum(total) FILTER(WHERE status='paid'),0)::float AS paid
        FROM business_documents WHERE doc_type='invoice' AND issue_date>=date_trunc('month',current_date)-interval '11 months' GROUP BY 1 ORDER BY 1`,
      sql`SELECT (SELECT count(*)::int FROM plans WHERE active) AS plans,(SELECT count(*)::int FROM subscriptions WHERE status IN('trial','active','past_due')) AS subscriptions,
        (SELECT coalesce(sum(total),0)::float FROM platform_invoices WHERE status IN('issued','paid')) AS invoiced,(SELECT coalesce(sum(amount),0)::float FROM platform_payments) AS collected,
        (SELECT coalesce(sum(total),0)::float FROM platform_invoices WHERE status='issued' AND due_date<current_date) AS overdue,(SELECT coalesce(sum(amount),0)::float FROM credits) AS credits`,
    ]);
    const aging = { '0-30': { amount: 0, count: 0 }, '31-60': { amount: 0, count: 0 }, '61-90': { amount: 0, count: 0 }, '90+': { amount: 0, count: 0 } };
    for (const d of open) if (d.due_date && d.days_late > 0) { const k = agingBucket(d.days_late); aging[k].amount += d.total; aging[k].count += 1; }
    const cabinets = await cabinetStats(sql);
    const byCabinet = cabinets.filter((c) => c.invoiced || c.outstanding).map((c) => ({ id: c.id, name: cabinetName(c), city: c.city, invoiced: c.invoiced, paid: c.paid, outstanding: c.outstanding, overdue: c.overdue_amount, overdue_count: c.overdue_count, max_days_late: c.overdue_max_days }));
    const alerts = [];
    if (totals[0].overdue_count) alerts.push({ severity: 'high', text: `${totals[0].overdue_count} facture(s) cabinet ont dépassé leur échéance.` });
    for (const c of byCabinet.filter((c) => c.overdue > 0).sort((x, y) => y.overdue - x.overdue).slice(0, 5)) alerts.push({ severity: c.max_days_late > 30 ? 'high' : 'medium', cabinet_id: c.id, text: `${c.name} : ${Math.round(c.overdue)} € en retard (${c.overdue_count} facture(s), jusqu’à ${c.max_days_late} j).` });
    send({ totals: totals[0], aging, cabinets: byCabinet, overdue: open.filter((d) => d.due_date && d.days_late > 0), monthly, alerts, platform: platform[0] });
    return true;
  }

  // ── Operations ──────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-operations' && GET) {
    const [tasks, poses, appointments, weekly, workload] = await Promise.all([
      sql`SELECT e.id,e.title,e.description,e.status,e.severity,e.due_at,e.owner_id,o.name AS owner_name,e.cabinet_id,coalesce(nullif(p.clinic_name,''),c.name) AS cabinet_name,e.created_at
        FROM operational_events e LEFT JOIN accounts o ON o.id=e.owner_id LEFT JOIN accounts c ON c.id=e.cabinet_id LEFT JOIN profiles p ON p.account_id=e.cabinet_id
        WHERE e.source='manual' AND e.status IN('open','in_progress') ORDER BY e.due_at NULLS LAST,e.created_at LIMIT 300`,
      sql`SELECT r.id,r.owner_id,r.prosthesis_date,r.status,upper(left(split_part(pa.name,' ',1),1))||'. '||upper(left(split_part(pa.name,' ',2),1))||'.' AS initials,coalesce(nullif(p.clinic_name,''),o.name) AS cabinet_name,
        EXISTS(SELECT 1 FROM business_documents d WHERE d.owner_id=r.owner_id AND d.patient_id=r.patient_id AND ((d.doc_type='quote' AND d.status IN('accepted','paid')) OR (d.doc_type='invoice' AND d.status<>'cancelled'))) AS ready
        FROM patient_records r JOIN accounts pa ON pa.id=r.patient_id JOIN accounts o ON o.id=r.owner_id JOIN profiles p ON p.account_id=o.id
        WHERE r.prosthesis_date>=current_date-7 ORDER BY r.prosthesis_date LIMIT 300`,
      sql`SELECT ap.id,ap.status,ap.created_at,s.starts_at,s.duration,upper(left(split_part(pa.name,' ',1),1))||'. '||upper(left(split_part(pa.name,' ',2),1))||'.' AS patient_initials,pa.name AS patient_name,pr.name AS professional_name,pr.id AS cabinet_id,coalesce(nullif(pp.clinic_name,''),pr.name) AS cabinet_name
        FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id JOIN profiles pp ON pp.account_id=pr.id
        WHERE s.starts_at>now()-interval '7 days' ORDER BY s.starts_at LIMIT 300`,
      sql`SELECT to_char(date_trunc('week',created_at),'YYYY-MM-DD') AS week,count(*)::int AS created,count(*) FILTER(WHERE status IN('resolved','dismissed'))::int AS resolved,
        coalesce(avg(extract(epoch FROM resolved_at-created_at)/3600) FILTER(WHERE resolved_at IS NOT NULL AND NOT auto_resolved),0)::float AS avg_hours
        FROM operational_events WHERE created_at>now()-interval '8 weeks' GROUP BY 1 ORDER BY 1`,
      sql`SELECT t.id,t.title,t.stage,t.priority,t.due_at,t.assignee,coalesce(nullif(p.clinic_name,''),pr.name) AS cabinet_name,t.owner_id AS cabinet_id FROM tasks t JOIN accounts pr ON pr.id=t.owner_id JOIN profiles p ON p.account_id=pr.id WHERE t.stage<>'Terminé' ORDER BY t.due_at NULLS LAST,t.created_at DESC LIMIT 300`,
    ]);
    send({ tasks, poses, appointments, weekly, cabinet_tasks: workload });
    return true;
  }

  // ── Analytics ───────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-analytics' && GET) {
    const [adoption, features, support, categories, perCabinet, tracking] = await Promise.all([
      sql`SELECT (SELECT count(DISTINCT account_id)::int FROM account_activity WHERE day=current_date) AS dau,
        (SELECT count(DISTINCT account_id)::int FROM account_activity WHERE day>current_date-7) AS wau,
        (SELECT count(DISTINCT account_id)::int FROM account_activity WHERE day>current_date-30) AS mau,
        (SELECT count(*)::int FROM sessions WHERE expires_at-interval '7 days'>now()-interval '30 days') AS sessions_30d,
        (SELECT count(*)::int FROM accounts WHERE role IN('professional','worker') AND NOT suspended) AS pro_accounts,
        (SELECT min(day) FROM account_activity) AS tracked_since`,
      sql`SELECT 'Rendez-vous' AS feature,count(*)::int AS count FROM appointments WHERE created_at>now()-interval '30 days'
        UNION ALL SELECT 'Devis & factures',count(*)::int FROM business_documents WHERE created_at>now()-interval '30 days'
        UNION ALL SELECT 'Fiches patient',count(*)::int FROM patient_records WHERE updated_at>now()-interval '30 days'
        UNION ALL SELECT 'Tâches cabinet',count(*)::int FROM tasks WHERE updated_at>now()-interval '30 days'
        UNION ALL SELECT 'Courses',count(*)::int FROM missions WHERE updated_at>now()-interval '30 days'
        UNION ALL SELECT 'Messagerie',count(*)::int FROM messages WHERE created_at>now()-interval '30 days'
        UNION ALL SELECT 'Comptabilité',count(*)::int FROM ledger WHERE created_at>now()-interval '30 days'`,
      sql`SELECT count(*)::int AS total,count(*) FILTER(WHERE created_at>now()-interval '30 days')::int AS last_30d,
        coalesce(avg(extract(epoch FROM first_response_at-created_at)/3600) FILTER(WHERE first_response_at IS NOT NULL),0)::float AS first_response_hours,
        coalesce(avg(extract(epoch FROM resolved_at-created_at)/3600) FILTER(WHERE resolved_at IS NOT NULL),0)::float AS resolution_hours,
        count(*) FILTER(WHERE reopened_count>0)::int AS reopened FROM support_tickets`,
      sql`SELECT category,count(*)::int AS count FROM support_tickets GROUP BY category ORDER BY count DESC`,
      cabinetStats(sql),
      sql`SELECT to_char(date_trunc('week',created_at),'YYYY-MM-DD') AS week,count(*)::int AS tickets FROM support_tickets WHERE created_at>now()-interval '12 weeks' GROUP BY 1 ORDER BY 1`,
    ]);
    const [finance] = await sql`SELECT coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status NOT IN('draft','cancelled')),0)::float AS invoiced,coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status='paid'),0)::float AS paid,coalesce(sum(total) FILTER(WHERE doc_type='invoice' AND status IN('sent','accepted') AND due_date<current_date),0)::float AS overdue FROM business_documents`;
    const monthly = await sql`SELECT to_char(date_trunc('month',issue_date),'YYYY-MM') AS month,coalesce(sum(total) FILTER(WHERE status NOT IN('draft','cancelled')),0)::float AS invoiced,coalesce(sum(total) FILTER(WHERE status='paid'),0)::float AS paid FROM business_documents WHERE doc_type='invoice' AND issue_date>=date_trunc('month',current_date)-interval '11 months' GROUP BY 1 ORDER BY 1`;
    const ops = await sql`SELECT count(*) FILTER(WHERE status IN('open','in_progress'))::int AS backlog,count(*) FILTER(WHERE status IN('open','in_progress') AND due_at<now())::int AS overdue,
      coalesce(avg(extract(epoch FROM resolved_at-created_at)/3600) FILTER(WHERE resolved_at IS NOT NULL AND NOT auto_resolved),0)::float AS avg_resolution_hours,
      count(*) FILTER(WHERE created_at>now()-interval '7 days')::int AS created_7d FROM operational_events`;
    const signups = await sql.query(`WITH ${CABINETS_CTE} SELECT to_char(date_trunc('month',created_at),'YYYY-MM') AS month,count(*)::int AS count FROM cab WHERE created_at>=date_trunc('month',current_date)-interval '11 months' GROUP BY 1 ORDER BY 1`, []);
    const cabinets = perCabinet;
    send({
      adoption: adoption[0], features, signups,
      cabinets: {
        total: cabinets.length,
        new_30d: cabinets.filter((c) => Date.now() - new Date(c.created_at).getTime() < 30 * 86400000).length,
        activated: cabinets.filter((c) => c.health.onboarding.completed >= 5).length,
        inactive: cabinets.filter((c) => !c.last_activity_at || Date.now() - new Date(c.last_activity_at).getTime() > 14 * 86400000).length,
        at_risk: cabinets.filter((c) => c.health.status === 'risk').length,
        onboarding_incomplete: cabinets.filter((c) => c.health.onboarding.percent < 100).length,
        lifecycle: LIFECYCLES.map((l) => ({ lifecycle: l, count: cabinets.filter((c) => c.lifecycle === l).length })),
      },
      operations: ops[0], weekly_tickets: tracking,
      support: { ...support[0], categories, per_cabinet: cabinets.filter((c) => c.open_tickets || c.tickets_14d).map((c) => ({ id: c.id, name: cabinetName(c), open: c.open_tickets, last_14d: c.tickets_14d })).sort((a, b) => b.open - a.open).slice(0, 10) },
      finance: { ...finance, monthly },
    });
    return true;
  }

  // ── Security & audit ───────────────────────────────────────────────────────────────────────
  if (action === 'cc-audit' && GET) {
    const page = Math.min(10000, Math.max(0, Math.floor(Number(q.page) || 0))), size = 100;
    const term = clean(q.q, 80);
    const rows = await sql.query(`SELECT l.id,l.action,l.detail,l.reason,l.entity_type,l.entity_id,l.target_id,l.tenant_id,l.before,l.after,l.request_id,l.ip,l.created_at,l.impersonated_by,a.name AS actor_name,count(*) OVER()::int AS total
      FROM audit_log l JOIN accounts a ON a.id=l.actor_id
      WHERE ($1::text IS NULL OR a.name ILIKE $1 OR l.action ILIKE $1 OR l.detail ILIKE $1 OR l.reason ILIKE $1) AND ($2::text IS NULL OR l.entity_type=$2)
      ORDER BY l.created_at DESC LIMIT ${size} OFFSET ${page * size}`, [term ? like(term) : null, clean(q.entity_type, 40) || null]);
    const sensitive = await sql`SELECT count(*) FILTER(WHERE action IN('account_suspended','admin_role_assigned','assist_started','bulk_export','bulk_cabinets_updated','bulk_events_updated') AND created_at>now()-interval '7 days')::int AS sensitive_7d,
      count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS last_24h FROM audit_log`;
    const assists = await sql`SELECT s.id,s.reason,s.started_at,s.ended_at,a.name AS admin,coalesce(nullif(p.clinic_name,''),c.name) AS cabinet FROM assist_sessions s JOIN accounts a ON a.id=s.admin_id JOIN accounts c ON c.id=s.cabinet_id JOIN profiles p ON p.account_id=c.id ORDER BY s.started_at DESC LIMIT 30`;
    send({ items: rows.map(({ total, ...r }) => r), total: rows[0]?.total || 0, page, size, stats: sensitive[0], assists });
    return true;
  }

  // ── Configuration ──────────────────────────────────────────────────────────────────────────
  if (action === 'cc-config' && GET) {
    const [settings, flags, team, state] = await Promise.all([
      sql`SELECT name,support_email,announcement,updated_at FROM platform_settings WHERE id=1`,
      sql`SELECT f.*,(SELECT count(*)::int FROM feature_flag_overrides o WHERE o.flag_key=f.key AND o.enabled) AS overrides_on,(SELECT count(*)::int FROM feature_flag_overrides o WHERE o.flag_key=f.key AND NOT o.enabled) AS overrides_off FROM feature_flags f ORDER BY f.label`,
      sql`SELECT a.id,a.name,a.email,coalesce(m.internal_role,'platform_owner') AS internal_role,(m.account_id IS NULL) AS legacy FROM accounts a LEFT JOIN admin_members m ON m.account_id=a.id WHERE a.role='admin' ORDER BY a.name`,
      sql`SELECT value,updated_at FROM platform_state WHERE key='automations'`,
    ]);
    send({ settings: settings[0], rules: await ruleConfig(sql), automation_state: state[0] || null, flags, team, roles: Object.entries(INTERNAL_ROLES).map(([key, r]) => ({ key, label: r.label, permissions: r.permissions })), permissions: PERMISSIONS });
    return true;
  }
  if (action === 'cc-system' && GET) {
    const started = Date.now();
    const checks = [];
    try {
      await sql`SELECT 1`;
      checks.push({ key: 'database', label: 'Base de données', state: 'ok', detail: `Répond en ${Date.now() - started} ms` });
    } catch { checks.push({ key: 'database', label: 'Base de données', state: 'down', detail: 'Requête de contrôle en échec' }); }
    checks.push({ key: 'api', label: 'API', state: 'ok', detail: 'Cette requête authentifiée a abouti' });
    const [auto] = await sql`SELECT value,updated_at FROM platform_state WHERE key='automations'`.catch(() => []);
    checks.push(!auto ? { key: 'jobs', label: 'Automatisations', state: 'unknown', detail: 'Jamais exécutées' }
      : auto.value?.ok ? { key: 'jobs', label: 'Automatisations', state: 'ok', detail: `Dernière exécution ${new Date(auto.updated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (${auto.value.duration_ms} ms)` }
        : { key: 'jobs', label: 'Automatisations', state: 'down', detail: `Dernière exécution en échec (${auto.value?.error || 'erreur'})` });
    const [notif] = await sql`SELECT count(*)::int AS n FROM notifications WHERE created_at>now()-interval '24 hours'`;
    checks.push({ key: 'notifications', label: 'Notifications in-app', state: 'ok', detail: `${notif.n} créée(s) sur 24 h` });
    checks.push({ key: 'email', label: 'E-mail', state: 'not_configured', detail: 'Aucun fournisseur d’envoi n’est connecté à l’application' });
    const storage = await sql`SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`.catch(() => null);
    checks.push(storage ? { key: 'storage', label: 'Stockage (fichiers en base)', state: 'ok', detail: `${(Number(storage[0].bytes) / 1048576).toFixed(1)} Mo utilisés` } : { key: 'storage', label: 'Stockage', state: 'unknown', detail: 'Mesure indisponible' });
    send({ checks, measured_at: new Date().toISOString() });
    return true;
  }
  if (action === 'cc-rule-update' && POST) {
    const rule = ALL_RULES.find((r) => r.key === b.key);
    if (!rule) throw fail(404, 'Règle introuvable.');
    const params = {};
    for (const [k, v] of Object.entries(rule.params)) if (b.params && k in b.params) { const n = Number(b.params[k]); if (!Number.isInteger(n) || n < 0 || n > 365 * 24) throw fail(400, 'Paramètre invalide.'); params[k] = n; } else params[k] = v;
    if (b.params?.assign_to !== undefined) { if (b.params.assign_to && !isUuid(b.params.assign_to)) throw fail(400, 'Responsable invalide.'); if (b.params.assign_to) params.assign_to = b.params.assign_to; }
    const [before] = await sql`SELECT enabled,params FROM automation_rules WHERE key=${b.key}`;
    await sql.transaction([
      sql`INSERT INTO automation_rules(key,enabled,params,updated_by) VALUES(${b.key},${b.enabled !== false},${JSON.stringify(params)}::jsonb,${account.id}) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,params=excluded.params,updated_by=excluded.updated_by,updated_at=now()`,
      audit({ action: 'automation_rule_updated', entityType: 'automation', entityId: b.key, before: before || { enabled: true, params: rule.params }, after: { enabled: b.enabled !== false, params }, detail: 'Règle modifiée : ' + rule.label }),
    ]);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-automations-run' && POST) {
    send({ state: await runAutomations(sql, { actorId: account.id, ctx, force: true }) });
    return true;
  }
  if (action === 'cc-flag-save' && POST) {
    const key = clean(b.key, 60).toLowerCase();
    if (!/^[a-z0-9_]{2,60}$/.test(key) || !clean(b.label, 80)) throw fail(400, 'Clé (a-z, 0-9, _) et libellé obligatoires.');
    const rollout = ['off', 'internal', 'pilot', 'all'].includes(b.rollout) ? b.rollout : 'off';
    const [before] = await sql`SELECT * FROM feature_flags WHERE key=${key}`;
    await sql.transaction([
      sql`INSERT INTO feature_flags(key,label,description,rollout) VALUES(${key},${clean(b.label, 80)},${clean(b.description, 300)},${rollout}) ON CONFLICT(key) DO UPDATE SET label=excluded.label,description=excluded.description,rollout=excluded.rollout,updated_at=now()`,
      audit({ action: 'feature_flag_saved', entityType: 'feature_flag', entityId: key, before: before || null, after: { label: b.label, rollout }, detail: 'Feature flag ' + key + ' : ' + rollout }),
    ]);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-flag-override' && POST) {
    const key = clean(b.flag_key, 60);
    if (!isUuid(b.cabinet_id) || !key) throw fail(400, 'Paramètres invalides.');
    const [flag] = await sql`SELECT key FROM feature_flags WHERE key=${key}`;
    if (!flag) throw fail(404, 'Feature flag introuvable.');
    await sql.transaction([
      b.enabled === null || b.enabled === undefined
        ? sql`DELETE FROM feature_flag_overrides WHERE flag_key=${key} AND cabinet_id=${b.cabinet_id}`
        : sql`INSERT INTO feature_flag_overrides(flag_key,cabinet_id,enabled) VALUES(${key},${b.cabinet_id},${!!b.enabled}) ON CONFLICT(flag_key,cabinet_id) DO UPDATE SET enabled=excluded.enabled`,
      audit({ action: 'feature_flag_override', entityType: 'feature_flag', entityId: key, tenantId: b.cabinet_id, after: { cabinet_id: b.cabinet_id, enabled: b.enabled ?? null }, detail: 'Activation par cabinet modifiée' }),
    ]);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-role-assign' && POST) {
    if (!isUuid(b.account_id) || !INTERNAL_ROLES[b.internal_role]) throw fail(400, 'Rôle invalide.');
    const reason = clean(b.reason, 500);
    if (!reason) throw fail(400, 'Indiquez le motif de ce changement de permissions.');
    const [target] = await sql`SELECT a.id,coalesce(m.internal_role,'platform_owner') AS internal_role FROM accounts a LEFT JOIN admin_members m ON m.account_id=a.id WHERE a.id=${b.account_id} AND a.role='admin'`;
    if (!target) throw fail(404, 'Membre de l’équipe introuvable.');
    if (target.internal_role === 'platform_owner' && b.internal_role !== 'platform_owner') {
      const [owners] = await sql`SELECT count(*)::int AS n FROM accounts a LEFT JOIN admin_members m ON m.account_id=a.id WHERE a.role='admin' AND NOT a.suspended AND coalesce(m.internal_role,'platform_owner')='platform_owner'`;
      if (owners.n <= 1) throw fail(409, 'Il doit rester au moins un Platform Owner.');
    }
    await sql.transaction([
      sql`INSERT INTO admin_members(account_id,internal_role) VALUES(${b.account_id},${b.internal_role}) ON CONFLICT(account_id) DO UPDATE SET internal_role=excluded.internal_role,updated_at=now()`,
      audit({ action: 'admin_role_assigned', entityType: 'account', entityId: b.account_id, before: { internal_role: target.internal_role }, after: { internal_role: b.internal_role }, reason, detail: 'Rôle interne : ' + INTERNAL_ROLES[b.internal_role].label }),
    ]);
    send({ ok: true });
    return true;
  }

  // ── Saved views ────────────────────────────────────────────────────────────────────────────
  if (action === 'cc-views' && GET) {
    const scope = VIEW_SCOPES.includes(q.scope) ? q.scope : null;
    const rows = await sql`SELECT v.id,v.scope,v.name,v.filters,v.shared,v.owner_id,a.name AS owner_name FROM saved_views v JOIN accounts a ON a.id=v.owner_id WHERE (v.owner_id=${account.id} OR v.shared) AND (${scope}::text IS NULL OR v.scope=${scope}) ORDER BY v.scope,v.name`;
    send({ views: rows });
    return true;
  }
  if (action === 'cc-view-save' && POST) {
    const name = clean(b.name, 80);
    if (!name || !VIEW_SCOPES.includes(b.scope)) throw fail(400, 'Nom et périmètre obligatoires.');
    const filters = Object.fromEntries(Object.entries(b.filters && typeof b.filters === 'object' ? b.filters : {}).slice(0, 12).map(([k, v]) => [clean(k, 40), typeof v === 'string' ? clean(v, 120) : typeof v === 'number' || typeof v === 'boolean' ? v : null]));
    const id = randomUUID();
    await sql`INSERT INTO saved_views(id,owner_id,scope,name,filters,shared) VALUES(${id},${account.id},${b.scope},${name},${JSON.stringify(filters)}::jsonb,${!!b.shared})`;
    send({ ok: true, id });
    return true;
  }
  if (action === 'cc-view-delete' && POST) {
    if (!isUuid(b.id)) throw fail(400, 'Vue invalide.');
    await sql`DELETE FROM saved_views WHERE id=${b.id} AND owner_id=${account.id}`;
    send({ ok: true });
    return true;
  }

  // ── Notifications (grouped) ────────────────────────────────────────────────────────────────
  if (action === 'cc-notifications' && GET) {
    const rows = await sql`SELECT n.id,n.kind,n.category,n.title,n.body,n.href,n.read_at,n.created_at,n.cabinet_id,coalesce(nullif(p.clinic_name,''),c.name) AS cabinet_name
      FROM notifications n LEFT JOIN accounts c ON c.id=n.cabinet_id LEFT JOIN profiles p ON p.account_id=n.cabinet_id WHERE n.account_id=${account.id} ORDER BY n.created_at DESC LIMIT 150`;
    const category = (n) => n.category || ({ support: 'support', task: 'action', mention: 'info', verification: 'action', document: 'finance' }[n.kind] || 'info');
    const groups = new Map();
    for (const n of rows) {
      const key = n.cabinet_id ? 'cab:' + n.cabinet_id : 'n:' + n.id;
      if (!groups.has(key)) groups.set(key, { key, cabinet_id: n.cabinet_id, title: n.cabinet_id ? n.cabinet_name : n.title, items: [], unread: 0, latest: n.created_at, categories: new Set() });
      const g = groups.get(key);
      g.items.push({ ...n, category: category(n) }); g.categories.add(category(n)); if (!n.read_at) g.unread += 1;
    }
    send({ groups: [...groups.values()].map((g) => ({ ...g, categories: [...g.categories] })), unread: rows.filter((n) => !n.read_at).length });
    return true;
  }

  // ── View as cabinet (read-only assistance) ─────────────────────────────────────────────────
  if (action === 'cc-assist-start' && POST) {
    if (!isUuid(b.cabinet_id)) throw fail(400, 'Cabinet invalide.');
    const reason = clean(b.reason, 300);
    if (!reason) throw fail(400, 'Indiquez le motif de la consultation.');
    const [cab] = await sql`SELECT a.id FROM accounts a WHERE a.id=${b.cabinet_id} AND a.role='professional'`;
    if (!cab) throw fail(404, 'Cabinet introuvable.');
    const id = randomUUID();
    await sql.transaction([
      sql`UPDATE assist_sessions SET ended_at=now() WHERE admin_id=${account.id} AND ended_at IS NULL`,
      sql`INSERT INTO assist_sessions(id,admin_id,cabinet_id,reason) VALUES(${id},${account.id},${b.cabinet_id},${reason})`,
      audit({ action: 'assist_started', entityType: 'cabinet', entityId: b.cabinet_id, tenantId: b.cabinet_id, reason, after: { mode: 'readonly', session: id }, detail: 'Mode assistance en lecture seule' }),
    ]);
    send({ ok: true, id });
    return true;
  }
  if (action === 'cc-assist-end' && POST) {
    const rows = await sql`UPDATE assist_sessions SET ended_at=now() WHERE admin_id=${account.id} AND ended_at IS NULL RETURNING id,cabinet_id,started_at`;
    if (rows.length) await audit({ action: 'assist_ended', entityType: 'cabinet', entityId: rows[0].cabinet_id, tenantId: rows[0].cabinet_id, after: { session: rows[0].id, duration_s: Math.round((Date.now() - new Date(rows[0].started_at).getTime()) / 1000) }, detail: 'Fin du mode assistance' });
    send({ ok: true });
    return true;
  }
  if (action === 'cc-assist-view' && GET) {
    // Strictly read-only snapshot of what the cabinet sees, without clinical data. Requires an open assistance session.
    const [session] = await sql`SELECT s.* FROM assist_sessions s WHERE s.admin_id=${account.id} AND s.ended_at IS NULL AND s.started_at>now()-interval '4 hours' ORDER BY s.started_at DESC LIMIT 1`;
    if (!session) throw fail(403, 'Aucune session d’assistance active.');
    const id = session.cabinet_id;
    const [profile, agenda, docs, tasks, team, tickets, counts] = await Promise.all([
      sql`SELECT a.name,p.clinic_name,p.city,p.address,p.phone,p.contact_email,p.website,p.specialty,p.headline,p.published,p.verified,p.weekly_hours,p.calendar_provider FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.id=${id}`,
      sql`SELECT s.starts_at,s.duration,ap.status,upper(left(split_part(pa.name,' ',1),1))||'. '||upper(left(split_part(pa.name,' ',2),1))||'.' AS patient FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id WHERE ap.professional_id=${id} AND s.starts_at>now()-interval '1 day' ORDER BY s.starts_at LIMIT 30`,
      sql`SELECT number,doc_type,status,total::float AS total,issue_date,due_date FROM business_documents WHERE owner_id=${id} ORDER BY created_at DESC LIMIT 30`,
      sql`SELECT title,stage,priority,due_at,assignee FROM tasks WHERE owner_id=${id} AND stage<>'Terminé' ORDER BY due_at NULLS LAST LIMIT 30`,
      sql`SELECT a.name,cm.job_title,cm.permissions,cm.accepted,cm.active FROM clinic_members cm JOIN accounts a ON a.id=cm.member_id WHERE cm.owner_id=${id} ORDER BY a.name`,
      sql`SELECT subject,status,created_at,admin_reply<>'' AS answered FROM support_tickets WHERE account_id=${id} ORDER BY updated_at DESC LIMIT 20`,
      sql`SELECT (SELECT count(*)::int FROM patient_records WHERE owner_id=${id}) AS patients,(SELECT count(*)::int FROM services WHERE owner_id=${id} AND active) AS services,(SELECT count(*)::int FROM slots WHERE professional_id=${id} AND starts_at>now() AND available) AS free_slots`,
    ]);
    send({ session: { id: session.id, reason: session.reason, started_at: session.started_at, mode: 'readonly' }, profile: profile[0], agenda, documents: docs, tasks, team, tickets, counts: counts[0] });
    return true;
  }
  // ── Appointments: consult and manage (cancel, complete, re-confirm, reschedule). Care reason stays hidden.
  if (action === 'cc-appointment' && GET) {
    if (!isUuid(q.id)) throw fail(400, 'Rendez-vous invalide.');
    const [ap] = await sql`SELECT ap.id,ap.status,ap.created_at,ap.patient_id,ap.professional_id,s.id AS slot_id,s.starts_at,s.duration,pa.name AS patient_name,pr.name AS professional_name,coalesce(nullif(pp.clinic_name,''),pr.name) AS cabinet_name,pp.address,
      (SELECT count(*)::int FROM messages m WHERE m.appointment_id=ap.id) AS message_count
      FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id JOIN profiles pp ON pp.account_id=pr.id WHERE ap.id=${q.id}`;
    if (!ap) throw fail(404, 'Rendez-vous introuvable.');
    send({ appointment: ap, history: await timeline(sql, { entityType: 'appointment', entityId: q.id }) });
    return true;
  }
  if (action === 'cc-appointment-update' && POST) {
    if (!isUuid(b.id)) throw fail(400, 'Rendez-vous invalide.');
    const reason = clean(b.reason, 500);
    if (!reason) throw fail(400, 'Indiquez le motif de la modification.');
    const [ap] = await sql`SELECT ap.*,s.starts_at,s.duration FROM appointments ap JOIN slots s ON s.id=ap.slot_id WHERE ap.id=${b.id}`;
    if (!ap) throw fail(404, 'Rendez-vous introuvable.');
    const before = { status: ap.status, starts_at: ap.starts_at, duration: ap.duration };
    const writes = [];
    const after = { ...before };
    if (b.starts_at !== undefined || b.duration !== undefined) {
      const start = new Date(b.starts_at ?? ap.starts_at), duration = Number(b.duration ?? ap.duration);
      if (!Number.isFinite(start.getTime()) || start <= new Date() || start > new Date(Date.now() + 365 * 86400000) || !Number.isInteger(duration) || duration < 15 || duration > 180) throw fail(400, 'Choisissez une date future (sous un an) et une durée de 15 à 180 minutes.');
      if (ap.status === 'cancelled') throw fail(409, 'Réactivez le rendez-vous avant de le déplacer.');
      const [clash] = await sql`SELECT 1 FROM slots WHERE professional_id=${ap.professional_id} AND id<>${ap.slot_id} AND tstzrange(starts_at,starts_at+duration*interval '1 minute','[)') && tstzrange(${start.toISOString()}::timestamptz,${start.toISOString()}::timestamptz+${duration}*interval '1 minute','[)') AND (NOT available OR EXISTS(SELECT 1 FROM appointments x WHERE x.slot_id=slots.id AND x.status<>'cancelled'))`;
      if (clash) throw fail(409, 'Ce créneau chevauche un autre rendez-vous du cabinet.');
      const slot = randomUUID();
      // Free unbooked overlapping slots of the cabinet, create the new slot, move the appointment, release the old slot.
      writes.push(
        sql`DELETE FROM slots s WHERE s.professional_id=${ap.professional_id} AND s.id<>${ap.slot_id} AND s.available AND tstzrange(s.starts_at,s.starts_at+s.duration*interval '1 minute','[)') && tstzrange(${start.toISOString()}::timestamptz,${start.toISOString()}::timestamptz+${duration}*interval '1 minute','[)') AND NOT EXISTS(SELECT 1 FROM appointments x WHERE x.slot_id=s.id)`,
        sql`INSERT INTO slots(id,professional_id,starts_at,duration,available) VALUES(${slot},${ap.professional_id},${start.toISOString()},${duration},false)`,
        sql`UPDATE appointments SET slot_id=${slot} WHERE id=${b.id}`,
        sql`UPDATE slots SET available=true WHERE id=${ap.slot_id} AND starts_at>now()`,
      );
      after.starts_at = start.toISOString(); after.duration = duration;
    }
    if (b.status !== undefined && b.status !== ap.status) {
      if (!['confirmed', 'cancelled', 'completed'].includes(b.status)) throw fail(400, 'Statut invalide.');
      if (b.status === 'completed' && new Date(after.starts_at) > new Date()) throw fail(409, 'Un rendez-vous futur ne peut pas être marqué terminé.');
      writes.push(sql`UPDATE appointments SET status=${b.status} WHERE id=${b.id}`);
      if (b.status === 'cancelled') writes.push(sql`UPDATE slots SET available=true WHERE id=(SELECT slot_id FROM appointments WHERE id=${b.id}) AND starts_at>now()`);
      if (b.status === 'confirmed') writes.push(sql`UPDATE slots SET available=false WHERE id=(SELECT slot_id FROM appointments WHERE id=${b.id})`);
      after.status = b.status;
    }
    if (!writes.length) throw fail(400, 'Aucune modification demandée.');
    const when = new Date(after.starts_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' });
    const text = after.status === 'cancelled' ? `Rendez-vous du ${when} annulé par SmilePec.` : `Rendez-vous mis à jour par SmilePec : ${when}${after.status === 'completed' ? ' (terminé)' : ''}.`;
    writes.push(
      audit({ action: 'appointment_updated', entityType: 'appointment', entityId: b.id, tenantId: ap.professional_id, before, after, reason, detail: text }),
      sql`INSERT INTO notifications(id,account_id,kind,title,body,href) VALUES(${randomUUID()},${ap.professional_id},'appointment','Rendez-vous modifié',${text},'/pro?tab=Agenda')`,
      sql`INSERT INTO notifications(id,account_id,kind,title,body,href) VALUES(${randomUUID()},${ap.patient_id},'appointment','Rendez-vous modifié',${text},'/patient')`,
    );
    await sql.transaction(writes);
    send({ ok: true });
    return true;
  }
  if (action === 'cc-export-log' && POST) {
    const kind = clean(b.kind, 60), count = Math.max(0, Math.min(1000000, Number(b.count) || 0));
    if (!kind) throw fail(400, 'Export invalide.');
    await audit({ action: 'bulk_export', entityType: 'export', entityId: kind, after: { kind, count }, reason: clean(b.reason, 300), detail: `Export ${kind} : ${count} ligne(s)` });
    send({ ok: true });
    return true;
  }

  // ── Ask Amelib (beta) — deterministic, data-grounded answers only; no generative model. ─────
  if (action === 'cc-ask' && GET) {
    send(await askAmelib(sql, clean(q.q, 300), can));
    return true;
  }
  throw fail(405, 'Méthode non autorisée.');
}

const OWNER_SQL = `coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=a.id AND cm.active AND cm.accepted LIMIT 1),a.id)`;
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));
function describePatch(p) {
  const parts = [];
  if (p.status) parts.push('statut → ' + p.status);
  if ('owner_id' in p) parts.push(p.owner_id ? 'assigné' : 'désassigné');
  if ('due_at' in p) parts.push(p.due_at ? 'échéance ' + p.due_at.slice(0, 10) : 'échéance retirée');
  if ('snoozed_until' in p) parts.push(p.snoozed_until ? 'reporté au ' + p.snoozed_until.slice(0, 10) : 'report annulé');
  if (p.severity) parts.push('priorité → ' + p.severity);
  return parts.join(', ') || 'mise à jour';
}
async function eventPatch(sql, b) {
  const patch = {};
  if (b.status !== undefined) { if (!['open', 'in_progress', 'resolved', 'dismissed'].includes(b.status)) throw fail(400, 'Statut invalide.'); patch.status = b.status; }
  if (b.owner_id !== undefined) {
    if (b.owner_id !== null && !isUuid(b.owner_id)) throw fail(400, 'Responsable invalide.');
    if (b.owner_id) { const [o] = await sql`SELECT 1 FROM accounts WHERE id=${b.owner_id} AND role='admin'`; if (!o) throw fail(400, 'Responsable invalide.'); }
    patch.owner_id = b.owner_id;
  }
  if (b.due_at !== undefined) patch.due_at = b.due_at === null ? null : dateOrNull(b.due_at);
  if (b.snoozed_until !== undefined) {
    const until = b.snoozed_until === null ? null : dateOrNull(b.snoozed_until);
    if (until && new Date(until) <= new Date()) throw fail(400, 'Choisissez une date future.');
    patch.snoozed_until = until;
  }
  if (b.severity !== undefined) { if (!SEVERITIES.includes(b.severity)) throw fail(400, 'Priorité invalide.'); patch.severity = b.severity; }
  return patch;
}

// Supported intents map to fixed, parameterised queries. Anything else gets an honest "not supported".
export const ASK_EXAMPLES = [
  'Quels cabinets nécessitent mon attention ?',
  'Montre-moi les factures en retard de plus de 30 jours.',
  'Quels cabinets ont plus de deux tickets ouverts ?',
  'Résume Cabinet République',
  'Qu’est-ce qui s’est passé aujourd’hui ?',
];
async function askAmelib(sql, question, can) {
  const text = question.toLowerCase();
  const base = { beta: true, question, examples: ASK_EXAMPLES };
  if (!text) return { ...base, answer: null, rows: [] };
  const summary = text.match(/r[ée]sum[ée]?\s+(.+)/);
  if (summary && can('cabinet.read')) {
    const term = summary[1].replace(/^(le |la |du |de |cabinet )/g, '').replace(/[?.!]+$/, '').trim();
    const [found] = await sql`SELECT a.id FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.role='professional' AND (p.clinic_name ILIKE ${like(term)} OR a.name ILIKE ${like(term)}) ORDER BY a.created_at LIMIT 1`;
    if (!found) return { ...base, intent: 'cabinet_summary', answer: `Aucun cabinet ne correspond à « ${term} ».`, rows: [] };
    const [c] = await cabinetStats(sql, found.id);
    if (!c) return { ...base, intent: 'cabinet_summary', answer: `« ${term} » n’est pas un cabinet titulaire.`, rows: [] };
    return { ...base, intent: 'cabinet_summary', answer: `${cabinetName(c)} (${c.city || 'ville non renseignée'}) — santé ${c.health.score}/100 (${c.health.label}). ${c.team_count + 1} personne(s), ${c.patient_count} fiche(s) patient, ${c.open_tickets} ticket(s) ouvert(s), ${Math.round(c.outstanding)} € à encaisser dont ${Math.round(c.overdue_amount)} € en retard. Onboarding ${c.health.onboarding.percent} %.`, rows: c.health.dimensions.map((d) => ({ label: d.label, value: `${d.score}/${d.max}`, detail: d.why })), cabinet_id: c.id, sources: ['Fiche cabinet 360°'] };
  }
  if (/factur|impay|retard/.test(text) && can('billing.read')) {
    const days = Number((text.match(/(\d+)\s*jours?/) || [])[1] || 0);
    const rows = await sql`SELECT d.number,d.total::float AS total,current_date-d.due_date AS days_late,coalesce(nullif(p.clinic_name,''),o.name) AS cabinet,d.owner_id AS cabinet_id FROM business_documents d JOIN accounts o ON o.id=d.owner_id JOIN profiles p ON p.account_id=o.id WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date-${days}::int ORDER BY d.due_date LIMIT 50`;
    return { ...base, intent: 'overdue_invoices', answer: rows.length ? `${rows.length} facture(s) en retard${days ? ` de plus de ${days} jours` : ''}, pour ${Math.round(rows.reduce((s, r) => s + r.total, 0))} €.` : `Aucune facture en retard${days ? ` de plus de ${days} jours` : ''}.`, rows: rows.map((r) => ({ label: `${r.cabinet} — ${r.number}`, value: `${Math.round(r.total)} € · ${r.days_late} j`, cabinet_id: r.cabinet_id })), sources: ['Devis et factures des cabinets'] };
  }
  if (/ticket/.test(text) && can('support.read')) {
    const min = Number((text.match(/(\d+)/) || [])[1] ?? (/deux/.test(text) ? 2 : 1));
    const rows = await sql`SELECT coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=t.account_id AND cm.active AND cm.accepted LIMIT 1),t.account_id) AS cabinet_id,count(*)::int AS n FROM support_tickets t WHERE t.status NOT IN('resolved','closed') GROUP BY 1 HAVING count(*)>${min}::int ORDER BY n DESC LIMIT 30`;
    const names = rows.length ? await sql.query(`SELECT a.id,coalesce(nullif(p.clinic_name,''),a.name) AS name FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.id=ANY($1::uuid[])`, [rows.map((r) => r.cabinet_id)]) : [];
    return { ...base, intent: 'tickets_per_cabinet', answer: rows.length ? `${rows.length} cabinet(s) ont plus de ${min} ticket(s) ouvert(s).` : `Aucun cabinet n’a plus de ${min} ticket(s) ouvert(s).`, rows: rows.map((r) => ({ label: names.find((n) => n.id === r.cabinet_id)?.name || 'Cabinet', value: `${r.n} ticket(s)`, cabinet_id: r.cabinet_id })), sources: ['Support'] };
  }
  if (/attention|priorit|relancer|risque/.test(text) && can('cabinet.read')) {
    const rows = (await cabinetStats(sql)).filter((c) => c.health.status !== 'stable' || c.open_events > 0).sort((a, b) => a.health.score - b.health.score).slice(0, 10);
    return { ...base, intent: 'cabinets_attention', answer: rows.length ? `${rows.length} cabinet(s) nécessitent ton attention (score de santé bas ou éléments ouverts).` : 'Aucun cabinet ne nécessite d’attention particulière.', rows: rows.map((c) => ({ label: cabinetName(c), value: `${c.health.score}/100 · ${c.open_events} élément(s)`, cabinet_id: c.id, detail: c.health.reasons.filter((_, i) => c.health.dimensions[i] && !c.health.dimensions[i].ok).join(' ') })), sources: ['Score de santé', 'Inbox'] };
  }
  if (/aujourd|today|passé/.test(text)) {
    const rows = await sql`SELECT l.created_at,coalesce(nullif(l.reason,''),l.detail) AS label,a.name AS actor FROM audit_log l JOIN accounts a ON a.id=l.actor_id WHERE l.created_at>=current_date ORDER BY l.created_at DESC LIMIT 30`;
    const [c] = await sql`SELECT (SELECT count(*)::int FROM accounts WHERE created_at>=current_date) AS signups,(SELECT count(*)::int FROM support_tickets WHERE created_at>=current_date) AS tickets,(SELECT count(*)::int FROM business_documents WHERE created_at>=current_date) AS documents,(SELECT count(*)::int FROM operational_events WHERE created_at>=current_date) AS events`;
    return { ...base, intent: 'today', answer: `Aujourd’hui : ${c.signups} inscription(s), ${c.tickets} ticket(s), ${c.documents} document(s) cabinet, ${c.events} nouvel(s) élément(s) dans l’Inbox et ${rows.length} action(s) journalisée(s).`, rows: rows.map((r) => ({ label: r.label || 'Action', value: `${r.actor} · ${new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}` })), sources: ['Journal d’actions', 'Inscriptions', 'Support'] };
  }
  return { ...base, intent: null, answer: 'Je ne sais pas encore répondre à cette question de manière fiable. Essaie l’une des questions proposées.', rows: [] };
}
