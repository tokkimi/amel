// Deterministic automation rules. Each rule is a plain SQL condition that materialises (and auto-resolves)
// operational events. Rules are explainable (label + condition + action), configurable (automation_rules)
// and every run that changes something is written to the audit log.
import { auditEntry } from './audit.mjs';

// Reusable SQL fragments -------------------------------------------------------------------------
// A cabinet is a professional account that is not an accepted member of another cabinet.
export const CABINETS_CTE = `cab AS (SELECT a.id,a.name,a.email,a.created_at,a.suspended,p.clinic_name,p.city,p.address,p.phone,p.identifier,p.published,p.verified,p.weekly_hours,p.calendar_provider,
 ARRAY(SELECT cm.member_id FROM clinic_members cm WHERE cm.owner_id=a.id AND cm.active AND cm.accepted) || a.id AS people
 FROM accounts a JOIN profiles p ON p.account_id=a.id
 WHERE a.role='professional' AND NOT EXISTS(SELECT 1 FROM clinic_members m WHERE m.member_id=a.id AND m.active AND m.accepted))`;
export const ACTIVITY_UNION = `SELECT ap.created_at AS at FROM appointments ap WHERE ap.professional_id=cab.id AND ap.created_at>now()-interval '120 days'
 UNION ALL SELECT d.created_at FROM business_documents d WHERE d.owner_id=cab.id AND d.created_at>now()-interval '120 days'
 UNION ALL SELECT t.updated_at FROM tasks t WHERE t.owner_id=cab.id AND t.updated_at>now()-interval '120 days'
 UNION ALL SELECT r.updated_at FROM patient_records r WHERE r.owner_id=cab.id AND r.updated_at>now()-interval '120 days'
 UNION ALL SELECT l.created_at FROM ledger l WHERE l.owner_id=cab.id AND l.created_at>now()-interval '120 days'
 UNION ALL SELECT s.expires_at-interval '7 days' FROM sessions s WHERE s.account_id=ANY(cab.people) AND s.expires_at>now()-interval '113 days'
 UNION ALL SELECT aa.day::timestamptz FROM account_activity aa WHERE aa.account_id=ANY(cab.people) AND aa.day>current_date-120`;
export const CABINET_STATS = `SELECT cab.id,cab.name,cab.email,cab.created_at,cab.suspended,cab.clinic_name,cab.city,cab.address,cab.phone,cab.identifier,cab.published,cab.verified,
 crm.lifecycle,crm.owner_id AS crm_owner_id,coalesce(crm.tags,'[]'::jsonb) AS tags,crm.training_done_at,crm.next_contact_at,
 cardinality(cab.people)-1 AS team_count,
 (SELECT count(*)::int FROM clinic_members cm WHERE cm.owner_id=cab.id AND cm.active AND NOT cm.accepted) AS pending_invites,
 (cab.calendar_provider<>'' OR cab.weekly_hours<>'{}'::jsonb OR EXISTS(SELECT 1 FROM slots s WHERE s.professional_id=cab.id)) AS agenda_configured,
 (SELECT count(*)::int FROM patient_records r WHERE r.owner_id=cab.id) AS patient_count,
 fin.*, act.*, sup.*,
 (SELECT count(*)::int FROM operational_events e WHERE e.cabinet_id=cab.id AND e.status IN('open','in_progress')) AS open_events
 FROM cab LEFT JOIN cabinet_crm crm ON crm.cabinet_id=cab.id
 LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE d.doc_type='quote')::int AS quote_count,
  count(*) FILTER(WHERE d.doc_type='quote' AND d.status='sent' AND d.sent_at<now()-interval '9 days')::int AS stale_quotes,
  coalesce(sum(d.total) FILTER(WHERE d.doc_type='invoice' AND d.status NOT IN('draft','cancelled')),0)::float AS invoiced,
  coalesce(sum(d.total) FILTER(WHERE d.doc_type='invoice' AND d.status='paid'),0)::float AS paid,
  coalesce(sum(d.total) FILTER(WHERE d.doc_type='invoice' AND d.status IN('sent','accepted')),0)::float AS outstanding,
  count(*) FILTER(WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date)::int AS overdue_count,
  coalesce(sum(d.total) FILTER(WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date),0)::float AS overdue_amount,
  coalesce(max(current_date-d.due_date) FILTER(WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date),0)::int AS overdue_max_days
  FROM business_documents d WHERE d.owner_id=cab.id) fin ON true
 LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE ev.at>now()-interval '14 days')::int AS activity_14d,
  count(*) FILTER(WHERE ev.at<=now()-interval '14 days' AND ev.at>now()-interval '28 days')::int AS activity_prev_14d,
  max(ev.at) AS last_activity_at FROM (${ACTIVITY_UNION}) ev) act ON true
 LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE t.created_at>now()-interval '14 days')::int AS tickets_14d,
  count(*) FILTER(WHERE t.status NOT IN('resolved','closed'))::int AS open_tickets,
  count(*) FILTER(WHERE t.status NOT IN('resolved','closed') AND t.priority='critical')::int AS critical_open
  FROM support_tickets t WHERE t.account_id=ANY(cab.people)) sup ON true`;
// Cabinet (workspace owner) of any account.
const OWNER_OF = (col) => `coalesce((SELECT cm.owner_id FROM clinic_members cm WHERE cm.member_id=${col} AND cm.active AND cm.accepted LIMIT 1),${col})`;
const CLINIC_LABEL = (col) => `coalesce((SELECT nullif(pp.clinic_name,'') FROM profiles pp WHERE pp.account_id=${OWNER_OF(col)}),(SELECT aa.name FROM accounts aa WHERE aa.id=${OWNER_OF(col)}))`;
const SLA_SQL = `CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 24 WHEN 'low' THEN 96 ELSE 48 END`;

// Rules -------------------------------------------------------------------------------------------
// Each select must return: dedupe_key,type,severity,cabinet_id,entity_type,entity_id,title,description,due_at,owner_id,occurred_at
// (occurred_at = when the underlying situation started, so the inbox shows its real age).
export const RULES = [
  {
    key: 'verification_pending', label: 'Vérification en attente',
    condition: 'SI un professionnel a transmis son identifiant et attend une vérification', action: 'ALORS créer un événement « À valider » (priorité haute après N heures)',
    params: { escalate_hours: 48 },
    select: (p) => [`SELECT 'verification:'||a.id AS dedupe_key,'verification' AS type,
      CASE WHEN coalesce(v.updated_at,a.created_at)<now()-($1::int*interval '1 hour') THEN 'high' ELSE 'medium' END AS severity,
      ${OWNER_OF('a.id')} AS cabinet_id,'account' AS entity_type,a.id::text AS entity_id,
      'Vérification en attente — '||a.name AS title,
      'Identifiant '||p.identifier||' transmis, en attente de contrôle' AS description,
      NULL::timestamptz AS due_at,NULL::uuid AS owner_id,coalesce(v.updated_at,a.created_at) AS occurred_at
      FROM accounts a JOIN profiles p ON p.account_id=a.id LEFT JOIN verifications v ON v.account_id=a.id
      WHERE a.role IN('professional','worker') AND NOT a.suspended AND NOT p.verified
      AND coalesce(v.status,CASE WHEN p.identifier<>'' THEN 'documents_received' ELSE 'new' END) IN('documents_received','reviewing')`, [Number(p.escalate_hours) || 48]],
  },
  {
    key: 'support_open', label: 'Ticket support à traiter',
    condition: 'SI un ticket support est nouveau, ouvert ou en cours', action: 'ALORS créer un événement support (sévérité = priorité, haute si SLA dépassé)',
    params: {},
    select: () => [`SELECT 'support:'||t.id AS dedupe_key,'support' AS type,
      CASE WHEN t.priority='critical' THEN 'critical' WHEN t.priority='high' OR coalesce(t.due_at,t.created_at+(${SLA_SQL})*interval '1 hour')<now() THEN 'high' WHEN t.priority='low' THEN 'low' ELSE 'medium' END AS severity,
      ${OWNER_OF('t.account_id')} AS cabinet_id,'ticket' AS entity_type,t.id::text AS entity_id,
      'Ticket — '||left(t.subject,140) AS title,
      left(regexp_replace(t.body,'\\s+',' ','g'),180) AS description,
      coalesce(t.due_at,t.created_at+(${SLA_SQL})*interval '1 hour') AS due_at,t.owner_id AS owner_id,t.created_at AS occurred_at
      FROM support_tickets t WHERE t.status IN('new','open','in_progress')`, []],
  },
  {
    key: 'invoice_overdue', label: 'Factures patients en retard · suivi cabinet',
    condition: 'SI un cabinet a au moins une facture envoyée non réglée après son échéance', action: 'ALORS créer une alerte finance par cabinet (haute au-delà de 30 jours)',
    params: {},
    select: () => [`SELECT 'finance_overdue:'||d.owner_id AS dedupe_key,'finance' AS type,
      CASE WHEN max(current_date-d.due_date)>30 THEN 'high' ELSE 'medium' END AS severity,
      d.owner_id AS cabinet_id,'cabinet' AS entity_type,d.owner_id::text AS entity_id,
      'Factures patients à suivre — '||coalesce(nullif(p.clinic_name,''),a.name) AS title,
      count(*)||' facture(s) · '||to_char(round(sum(d.total)),'FM999999990')||' € à encaisser · retard max '||max(current_date-d.due_date)||' j' AS description,
      NULL::timestamptz AS due_at,NULL::uuid AS owner_id,(min(d.due_date)+1)::timestamptz AS occurred_at
      FROM business_documents d JOIN accounts a ON a.id=d.owner_id JOIN profiles p ON p.account_id=a.id
      WHERE d.doc_type='invoice' AND d.status IN('sent','accepted') AND d.due_date<current_date
      GROUP BY d.owner_id,p.clinic_name,a.name`, []],
  },
  {
    key: 'cabinet_inactive', label: 'Cabinet inactif',
    condition: 'SI un cabinet n’a aucune activité depuis N jours', action: 'ALORS le signaler « à risque » dans l’Inbox',
    params: { days: 14 },
    select: (p) => [`WITH ${CABINETS_CTE}, last AS (SELECT cab.*, (SELECT max(ev.at) FROM (${ACTIVITY_UNION}) ev) AS last_at FROM cab)
      SELECT 'inactive:'||last.id AS dedupe_key,'operational' AS type,'medium' AS severity,last.id AS cabinet_id,'cabinet' AS entity_type,last.id::text AS entity_id,
      'Cabinet à risque — '||coalesce(nullif(last.clinic_name,''),last.name) AS title,
      'Aucune activité depuis '||coalesce(to_char(last.last_at,'DD/MM/YYYY'),'l’inscription')||' (seuil : '||$1::int||' j)' AS description,
      NULL::timestamptz AS due_at,NULL::uuid AS owner_id,coalesce(last.last_at,last.created_at)+($1::int*interval '1 day') AS occurred_at
      FROM last LEFT JOIN cabinet_crm crm ON crm.cabinet_id=last.id
      WHERE NOT last.suspended AND last.created_at<now()-($1::int*interval '1 day') AND coalesce(last.last_at,last.created_at)<now()-($1::int*interval '1 day')
      AND coalesce(crm.lifecycle,'') NOT IN('churned','lead','contacted','demo')`, [Number(p.days) || 14]],
  },
  {
    key: 'onboarding_stalled', label: 'Onboarding bloqué',
    condition: 'SI un cabinet inscrit depuis plus de N jours n’a pas terminé les étapes produit de son onboarding', action: 'ALORS créer un événement onboarding listant les étapes manquantes',
    params: { days: 7 },
    select: (p) => [`WITH ${CABINETS_CTE}, st AS (SELECT cab.*,
       (cab.clinic_name<>'' AND cab.city<>'' AND cab.address<>'' AND cab.identifier<>'' AND cab.phone<>'') AS s_profile,
       EXISTS(SELECT 1 FROM clinic_members cm WHERE cm.owner_id=cab.id AND cm.active) AS s_team,
       (cab.calendar_provider<>'' OR cab.weekly_hours<>'{}'::jsonb OR EXISTS(SELECT 1 FROM slots s WHERE s.professional_id=cab.id)) AS s_agenda,
       EXISTS(SELECT 1 FROM patient_records r WHERE r.owner_id=cab.id) AS s_patient,
       EXISTS(SELECT 1 FROM business_documents d WHERE d.owner_id=cab.id AND d.doc_type='quote') AS s_quote FROM cab)
      SELECT 'onboarding:'||st.id AS dedupe_key,'onboarding' AS type,'low' AS severity,st.id AS cabinet_id,'cabinet' AS entity_type,st.id::text AS entity_id,
      'Onboarding bloqué — '||coalesce(nullif(st.clinic_name,''),st.name) AS title,
      'Étapes manquantes : '||concat_ws(', ',CASE WHEN NOT st.s_profile THEN 'informations cabinet' END,CASE WHEN NOT st.s_team THEN 'équipe' END,CASE WHEN NOT st.s_agenda THEN 'agenda' END,CASE WHEN NOT st.s_patient THEN 'premier patient' END,CASE WHEN NOT st.s_quote THEN 'premier devis' END) AS description,
      NULL::timestamptz AS due_at,NULL::uuid AS owner_id,st.created_at+($1::int*interval '1 day') AS occurred_at
      FROM st LEFT JOIN cabinet_crm crm ON crm.cabinet_id=st.id
      WHERE NOT st.suspended AND st.created_at<now()-($1::int*interval '1 day') AND coalesce(crm.lifecycle,'onboarding') NOT IN('churned')
      AND NOT (st.s_profile AND st.s_team AND st.s_agenda AND st.s_patient AND st.s_quote)`, [Number(p.days) || 7]],
  },
  {
    key: 'prosthesis_unready', label: 'Pose imminente sans devis accepté',
    condition: 'SI une pose est prévue dans les N prochains jours sans devis accepté ni facture', action: 'ALORS créer un événement haute priorité pour le cabinet',
    params: { days: 2 },
    select: (p) => [`SELECT 'pose:'||r.id||':'||r.prosthesis_date AS dedupe_key,'appointment' AS type,'high' AS severity,r.owner_id AS cabinet_id,'patient_record' AS entity_type,r.id::text AS entity_id,
      'Pose '||CASE WHEN r.prosthesis_date=current_date THEN 'aujourd’hui' WHEN r.prosthesis_date=current_date+1 THEN 'demain' ELSE 'le '||to_char(r.prosthesis_date,'DD/MM') END||' — '||coalesce(nullif(p.clinic_name,''),o.name) AS title,
      'Patient '||upper(left(split_part(pa.name,' ',1),1))||'. '||upper(left(split_part(pa.name,' ',2),1))||'. · élément manquant : devis accepté' AS description,
      r.prosthesis_date::timestamptz AS due_at,NULL::uuid AS owner_id,now() AS occurred_at
      FROM patient_records r JOIN accounts pa ON pa.id=r.patient_id JOIN accounts o ON o.id=r.owner_id JOIN profiles p ON p.account_id=r.owner_id
      WHERE r.prosthesis_date BETWEEN current_date AND current_date+$1::int
      AND NOT EXISTS(SELECT 1 FROM business_documents d WHERE d.owner_id=r.owner_id AND d.patient_id=r.patient_id AND ((d.doc_type='quote' AND d.status IN('accepted','paid')) OR (d.doc_type='invoice' AND d.status<>'cancelled')))`, [Number(p.days) || 2]],
  },
];
export const NOTIFY_RULE = {
  key: 'support_critical_notify', label: 'Alerte ticket critique',
  condition: 'SI support.priority = critical', action: 'ALORS notifier les administrateurs ayant accès au support', params: {},
};
export const ALL_RULES = [...RULES, NOTIFY_RULE];

function upsertStatement(rule, params) {
  const [select, values] = rule.select(params);
  const k = values.length + 1;
  const assign = params.assign_to && /^[0-9a-f-]{36}$/i.test(params.assign_to) ? params.assign_to : null;
  const ownerParam = assign ? `$${k + 1}::uuid` : 'NULL::uuid';
  // Owner coming from the source entity (e.g. ticket owner) wins over the rule's default assignee after insert.
  const srcOwner = `(CASE WHEN excluded.owner_id IS DISTINCT FROM ${ownerParam} THEN excluded.owner_id END)`;
  return [`WITH c AS (${select}),
    up AS (INSERT INTO operational_events(id,type,severity,cabinet_id,entity_type,entity_id,title,description,due_at,owner_id,source,rule_key,dedupe_key,created_at)
      SELECT gen_random_uuid(),c.type,c.severity,c.cabinet_id,c.entity_type,c.entity_id,c.title,c.description,c.due_at,coalesce(c.owner_id,${ownerParam}),'rule',$${k},c.dedupe_key,least(coalesce(c.occurred_at,now()),now()) FROM c
      ON CONFLICT(dedupe_key) DO UPDATE SET severity=excluded.severity,title=excluded.title,description=excluded.description,
       owner_id=coalesce(${srcOwner},operational_events.owner_id),
       status=CASE WHEN operational_events.auto_resolved AND operational_events.status IN('resolved','dismissed') THEN 'open' ELSE operational_events.status END,
       resolved_at=CASE WHEN operational_events.auto_resolved AND operational_events.status IN('resolved','dismissed') THEN NULL ELSE operational_events.resolved_at END,
       auto_resolved=false,updated_at=now()
      WHERE (operational_events.severity,operational_events.title,operational_events.description) IS DISTINCT FROM (excluded.severity,excluded.title,excluded.description)
       OR (operational_events.auto_resolved AND operational_events.status IN('resolved','dismissed'))
       OR (${srcOwner} IS NOT NULL AND ${srcOwner} IS DISTINCT FROM operational_events.owner_id)
      RETURNING (xmax=0) AS inserted),
    res AS (UPDATE operational_events e SET status=CASE WHEN e.status IN('open','in_progress') THEN 'resolved' ELSE e.status END,resolved_at=coalesce(e.resolved_at,now()),auto_resolved=true,updated_at=now()
      WHERE e.rule_key=$${k} AND e.source='rule' AND (e.status IN('open','in_progress') OR NOT e.auto_resolved) AND NOT EXISTS(SELECT 1 FROM c WHERE c.dedupe_key=e.dedupe_key) RETURNING 1)
    SELECT (SELECT count(*) FROM up WHERE inserted)::int AS created,(SELECT count(*) FROM up WHERE NOT inserted)::int AS updated,(SELECT count(*) FROM res)::int AS resolved`,
  assign ? [...values, rule.key, assign] : [...values, rule.key]];
}
const NOTIFY_SQL = `INSERT INTO notifications(id,account_id,kind,title,body,href,cabinet_id,category)
  SELECT gen_random_uuid(),ad.id,'support','Ticket critique : '||left(t.subject,120),coalesce(${CLINIC_LABEL('t.account_id')},''),'/admin?tab=Support&ticket='||t.id,${OWNER_OF('t.account_id')},'support'
  FROM support_tickets t CROSS JOIN accounts ad LEFT JOIN admin_members am ON am.account_id=ad.id
  WHERE ad.role='admin' AND NOT ad.suspended AND coalesce(am.internal_role,'platform_owner') IN('platform_owner','operations_admin','support_agent')
  AND t.priority='critical' AND t.status IN('new','open','in_progress')
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.account_id=ad.id AND n.href='/admin?tab=Support&ticket='||t.id) RETURNING 1`;

export async function ruleConfig(sql) {
  const rows = await sql`SELECT key,enabled,params,updated_at FROM automation_rules`;
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return ALL_RULES.map((r) => ({ key: r.key, label: r.label, condition: r.condition, action: r.action, enabled: byKey[r.key]?.enabled ?? true, params: { ...r.params, ...(byKey[r.key]?.params || {}) }, updated_at: byKey[r.key]?.updated_at || null }));
}
// Runs every enabled rule in one transaction (one round-trip). Throttled unless force=true.
export async function runAutomations(sql, { actorId, ctx, force = false, minIntervalSeconds = 60 } = {}) {
  if (!force) {
    const [state] = await sql`SELECT updated_at FROM platform_state WHERE key='automations' AND updated_at>now()-(${minIntervalSeconds}::int*interval '1 second')`;
    if (state) return null;
  }
  const config = await ruleConfig(sql);
  const enabled = RULES.filter((r) => config.find((c) => c.key === r.key)?.enabled);
  const statements = enabled.map((r) => { const [text, values] = upsertStatement(r, config.find((c) => c.key === r.key).params); return sql.query(text, values); });
  const notify = config.find((c) => c.key === NOTIFY_RULE.key)?.enabled;
  if (notify) statements.push(sql.query(NOTIFY_SQL, []));
  const started = Date.now();
  let results;
  try {
    results = statements.length ? await sql.transaction(statements) : [];
  } catch (error) {
    await sql`INSERT INTO platform_state(key,value,updated_at) VALUES('automations',${JSON.stringify({ ok: false, error: String(error?.code || error?.name || 'error'), at: new Date().toISOString() })}::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;
    throw error;
  }
  const summary = {};
  enabled.forEach((r, i) => { summary[r.key] = results[i][0]; });
  if (notify) summary[NOTIFY_RULE.key] = { notified: results[results.length - 1].length };
  const state = { ok: true, at: new Date().toISOString(), duration_ms: Date.now() - started, rules: summary };
  const changed = Object.values(summary).some((s) => (s.created || 0) + (s.resolved || 0) + (s.notified || 0) > 0);
  const writes = [sql`INSERT INTO platform_state(key,value,updated_at) VALUES('automations',${JSON.stringify(state)}::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`];
  if (changed && actorId) writes.push(auditEntry(sql, ctx, { actorId, action: 'automation_run', entityType: 'automation', entityId: 'rules', after: summary, detail: 'Règles d’automatisation exécutées' }));
  await sql.transaction(writes);
  return state;
}
