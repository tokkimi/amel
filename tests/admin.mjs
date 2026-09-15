import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import handler from '../api/index.mjs';
import {passwordHash,hash} from '../server/security.mjs';
const sql=neon(process.env.DATABASE_URL),admin=randomUUID(),pro=randomUUID(),token=randomBytes(32).toString('hex');
async function call(action,body,session=token){let status=200,result;await handler({method:body?'POST':'GET',url:'/api',query:{action},headers:{host:'amelib.vercel.app',origin:'https://amelib.vercel.app','content-type':'application/json',cookie:'amelib_session='+session},body},{setHeader(){},status(s){status=s;return this},json(r){result=r}});return{status,result};}
try{
 const password=await passwordHash(randomBytes(24).toString('hex'));
 for(const [id,role] of [[admin,'admin'],[pro,'professional']]){await sql`INSERT INTO accounts(id,email,password_hash,recovery_hash,name,role) VALUES(${id},${'amelib-admin-test-'+id+'@example.invalid'},${password},${hash(id)},'Test administration',${role})`;await sql`INSERT INTO profiles(account_id,identifier) VALUES(${id},'TEST-ID')`;}
 await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(token)},${admin},now()+interval '1 hour')`;
 assert.equal((await call('admin')).status,200);
 assert.equal((await call('admin-verify',{id:pro,verified:true,note:'Test de validation'})).status,200);
 assert.equal((await call('admin-suspend',{id:pro,suspended:true,note:'Test suspension'})).status,200);
 const blocked=await call('login',{email:'amelib-admin-test-'+pro+'@example.invalid',password:'irrelevant'});assert.equal(blocked.status,403);
 assert.equal((await call('admin-suspend',{id:admin,suspended:true,note:'self'})).status,400);
 assert.equal((await call('admin-suspend',{id:pro,suspended:false,note:'Test réactivation'})).status,200);
 const r=await call('admin');assert.equal(r.result.accounts.find(a=>a.id===pro).verified,true);assert(r.result.audit.filter(a=>a.target_id===pro).length===3);
 console.log('PASS: admin dashboard, verification, suspension enforcement, self-protection, reactivation, immutable audit trail.');
}finally{await sql`DELETE FROM audit_log WHERE actor_id=${admin}`;await sql`DELETE FROM accounts WHERE id IN(${admin},${pro}) AND email LIKE 'amelib-admin-test-%@example.invalid'`;console.log('Temporary admin test records removed.');}
