import { randomUUID } from 'node:crypto';
// Structured, append-only audit entries. Never stores secrets: sensitive keys and embedded files are stripped.
const SECRET = /pass|token|secret|hash|recovery|cookie|social_security|insurance_card|billing_document|allerg|medic|dental_chart|clinical/i;
export function redact(value, depth = 0) {
  if (value === null || value === undefined || depth > 4) return null;
  if (typeof value === 'string') return value.startsWith('data:') ? '[fichier]' : value.slice(0, 500);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET.test(k)).map(([k, v]) => [k, redact(v, depth + 1)]));
}
export function requestContext(req, token, hash) {
  const header = (k) => String(req.headers?.[k] || '');
  return {
    requestId: header('x-vercel-id') || randomUUID(),
    ip: (header('x-vercel-forwarded-for') || header('x-forwarded-for')).split(',')[0].trim().slice(0, 64),
    userAgent: header('user-agent').slice(0, 300),
    sessionId: token ? hash(token).slice(0, 16) : '',
  };
}
// Returns a query (not awaited) so it can join a transaction with the mutation it records.
export function auditEntry(sql, ctx, { actorId, action, entityType = null, entityId = null, tenantId = null, before = null, after = null, reason = '', detail = '' }) {
  return sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail,tenant_id,entity_type,entity_id,before,after,reason,request_id,ip,user_agent,session_id)
    VALUES(${randomUUID()},${actorId},${action},${/^[0-9a-f-]{36}$/i.test(String(entityId || '')) ? entityId : null},${String(detail || reason || '').slice(0, 500)},${tenantId},${entityType},${entityId === null ? null : String(entityId)},
    ${before === null ? null : JSON.stringify(redact(before))}::jsonb,${after === null ? null : JSON.stringify(redact(after))}::jsonb,${String(reason || '').slice(0, 500)},${ctx?.requestId || null},${ctx?.ip || null},${ctx?.userAgent || null},${ctx?.sessionId || null})`;
}
