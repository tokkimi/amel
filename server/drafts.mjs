import { clean } from './security.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function draftAction({action,req,b,sql,account,send}){
 if(action!=='workspace-drafts')return false;
 if(req.method==='GET'){
  const drafts=await sql`SELECT scope,payload,updated_at FROM workspace_drafts WHERE account_id=${account.id} AND updated_at>now()-interval '90 days'`;
  send({drafts});return true;
 }
 if(req.method==='POST'){
  const scope=clean(b.scope,240);if(!scope)throw fail(400,'Brouillon invalide.');
  if(b.clear){await sql`DELETE FROM workspace_drafts WHERE account_id=${account.id} AND scope=${scope}`;send({ok:true});return true;}
  if(!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload)||JSON.stringify(b.payload).length>4100000)throw fail(400,'Brouillon trop volumineux ou invalide.');
  if(Object.keys(b.payload).some(k=>/password|secret|token|recovery/i.test(k)))throw fail(400,'Les données d’authentification ne sont pas enregistrées en brouillon.');
  const [{n}]=await sql`SELECT count(*)::int AS n FROM workspace_drafts WHERE account_id=${account.id}`;if(n>=100){await sql`DELETE FROM workspace_drafts WHERE account_id=${account.id} AND scope IN(SELECT scope FROM workspace_drafts WHERE account_id=${account.id} ORDER BY updated_at LIMIT 10)`;}
  await sql`INSERT INTO workspace_drafts(account_id,scope,payload) VALUES(${account.id},${scope},${JSON.stringify(b.payload)}::jsonb) ON CONFLICT(account_id,scope) DO UPDATE SET payload=excluded.payload,updated_at=now()`;
  send({ok:true});return true;
 }
 throw fail(405,'Méthode non autorisée.');
}
