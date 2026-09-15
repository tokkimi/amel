import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import handler from '../api/index.mjs';
const sql=neon(process.env.DATABASE_URL);const ids=[];const nonce=randomUUID();
async function call(action,body,cookie=''){const [name,...params]=action.split('&');const req={method:body===undefined?'GET':'POST',url:'/api',query:{action:name,...Object.fromEntries(new URLSearchParams(params.join('&')))},headers:{host:'amelib.vercel.app',origin:'https://amelib.vercel.app','content-type':'application/json','x-vercel-forwarded-for':'test-'+nonce,cookie},body};let code=200,headers={};let result;const res={setHeader(k,v){headers[k]=v},status(c){code=c;return this},json(data){result=data;return this}};await handler(req,res);return {status:code,body:result,cookie:headers['Set-Cookie']?.split(';')[0]};}
async function signup(role){const email=`amelib-test-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');const r=await call('signup',{email,password,name:'Integration test '+role,role});assert.equal(r.status,200,JSON.stringify(r.body));ids.push(r.body.account.id);return {...r.body,email,password,cookie:r.cookie};}
const future=new Date(Date.now()+5*86400000);future.setUTCMinutes(0,0,0);
try{
 const pro=await signup('professional'),patient=await signup('patient'),other=await signup('patient'),stranger=await signup('professional');
 assert.equal((await call('dashboard')).status,401);
 assert.equal((await call('signup',{email:`admin-${nonce}@example.invalid`,password:'test-long-password',name:'Admin',role:'admin'})).status,400);
 assert.equal((await call('login',{email:pro.email,password:pro.password,role:'patient'})).status,403);
 assert.equal((await call('login',{email:pro.email,password:pro.password,role:'professional'})).status,200);
 assert.equal((await call('profile',{name:'Test orthodontist',specialty:'Orthodontiste',city:'Paris',address:'Test address',identifier:'TEST-'+nonce,price:85,published:true},pro.cookie)).status,200);
 const slot=await call('slot-create',{starts_at:future.toISOString(),duration:45},pro.cookie);assert.equal(slot.status,200,JSON.stringify(slot.body));
 const overlapping=await call('slot-create',{starts_at:new Date(future.getTime()+15*60000).toISOString(),duration:45},pro.cookie);assert.equal(overlapping.status,409);
 assert.equal((await call('slot-create',{starts_at:future.toISOString(),duration:45},patient.cookie)).status,403);
 const slots=await call('slots&professional='+pro.account.id);assert(slots.body.slots.some(s=>s.id===slot.body.id));
 const bookings=await Promise.all([call('book',{slot_id:slot.body.id,reason:'Test'},patient.cookie),call('book',{slot_id:slot.body.id,reason:'Test'},other.cookie)]);assert.deepEqual(bookings.map(x=>x.status).sort(),[200,409]);
 const index=bookings.findIndex(x=>x.status===200),winner=index===0?patient:other,loser=index===0?other:patient,id=bookings[index].body.id;
 assert.equal((await call('dashboard',undefined,pro.cookie)).body.appointments.length,1);
 assert.equal((await call('dashboard',undefined,loser.cookie)).body.appointments.length,0);
 assert.equal((await call('cancel',{id},loser.cookie)).status,403);
 assert.equal((await call('messages&appointment='+id,undefined,stranger.cookie)).status,403);
 assert.equal((await call('message-send',{appointment_id:id,body:'Test message'},winner.cookie)).status,200);
 assert.equal((await call('messages&appointment='+id,undefined,pro.cookie)).body.messages[0].body,'Test message');
 assert.equal((await call('ledger-create',{label:'Test transaction',amount:85,kind:'income',paid:true},pro.cookie)).status,200);
 assert.equal((await call('dashboard',undefined,stranger.cookie)).body.ledger.length,0);
 assert.equal((await call('ledger-create',{label:'Test',amount:1,kind:'income'},winner.cookie)).status,403);
 assert.equal((await call('admin',undefined,pro.cookie)).status,403);
 assert.equal((await call('cancel',{id},winner.cookie)).status,200);
 const replacement=await call('book',{slot_id:slot.body.id,reason:'After cancellation'},loser.cookie);assert.equal(replacement.status,200);
 assert.equal((await call('complete',{id:replacement.body.id},pro.cookie)).status,403);
 const recovered=await call('recover',{email:patient.email,password:randomBytes(24).toString('base64url'),recoveryCode:patient.recoveryCode});assert.equal(recovered.status,200);
 assert.equal((await call('session',undefined,patient.cookie)).body.account,null);
 await call('logout',{},pro.cookie);assert.equal((await call('dashboard',undefined,pro.cookie)).status,401);
 console.log('PASS: real database integration — registration, role isolation, session expiry/logout, recovery, overlap prevention, concurrent booking, participant-only messaging, financial isolation, cancellation/rebooking.');
}finally{
 for(const id of ids){await sql`DELETE FROM messages WHERE appointment_id IN(SELECT id FROM appointments WHERE patient_id=${id} OR professional_id=${id})`;await sql`DELETE FROM appointments WHERE patient_id=${id} OR professional_id=${id}`;await sql`DELETE FROM slots WHERE professional_id=${id}`;await sql`DELETE FROM accounts WHERE id=${id} AND email LIKE 'amelib-test-%@example.invalid'`;}
 await sql`DELETE FROM rate_limits WHERE key=${'auth-ip:'+ (await import('../server/security.mjs')).hash('test-'+nonce)}`;
 console.log('Test-created accounts and records removed.');
}
