import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createTestDatabase} from '../scripts/local-test-db.mjs';
import {seal,unseal,startCalendar,finishCalendar,calendarStatus,syncCalendar,filterCalendarSlots,disconnectCalendar,chooseCalendarType} from '../server/calendar-connections.mjs';
const {sql,db}=await createTestDatabase();const originalFetch=globalThis.fetch;const env={...process.env};
try{
 process.env.CALENDAR_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');process.env.GOOGLE_CALENDAR_CLIENT_ID='test-client';process.env.GOOGLE_CALENDAR_CLIENT_SECRET='test-secret';
 const secret={access_token:'private-access',refresh_token:'private-refresh'};const encrypted=seal(secret);assert.ok(!encrypted.includes('private'));assert.deepEqual(unseal(encrypted),secret);assert.throws(()=>unseal(encrypted.slice(0,-8)+'AAAAAAAA'));
 const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const {url}=await startCalendar(sql,id,'google','session-a');const auth=new URL(url);assert.equal(auth.hostname,'accounts.google.com');assert.equal(auth.searchParams.get('code_challenge_method'),'S256');assert.equal(auth.searchParams.get('access_type'),'offline');
 let exchanges=0,providerFails=false;const busyStart=new Date(Date.now()+2*86400000).toISOString(),busyEnd=new Date(+new Date(busyStart)+1800000).toISOString();
 globalThis.fetch=async(url,opts)=>{if(String(url).includes('oauth2.googleapis.com/token')){exchanges++;return{ok:true,json:async()=>({...secret,expires_in:3600})}}if(providerFails)return{ok:false};return{ok:true,json:async()=>({calendars:{primary:{busy:[{start:busyStart,end:busyEnd}]}}})}};
 const state=auth.searchParams.get('state');await finishCalendar(sql,id,'google','session-a',state,'code');assert.equal(exchanges,1);assert.equal((await calendarStatus(sql,id))[0].connected,true);assert.ok(!JSON.stringify(await calendarStatus(sql,id)).includes('private-access'));assert.equal((await calendarStatus(sql,other))[0].connected,false);
 await assert.rejects(()=>finishCalendar(sql,id,'google','session-a',state,'code'));
 const wrong=await startCalendar(sql,id,'google','session-a');await assert.rejects(()=>finishCalendar(sql,other,'google','session-b',new URL(wrong.url).searchParams.get('state'),'code'));assert.equal(exchanges,1);
 const occupied={id:'busy',host_id:id,starts_at:busyStart},free={id:'free',host_id:id,starts_at:new Date(+new Date(busyEnd)+1800000).toISOString()};assert.deepEqual((await filterCalendarSlots(sql,[occupied,free])).map(s=>s.id),['free']);
 providerFails=true;assert.equal((await filterCalendarSlots(sql,[free],{refresh:true})).length,0);assert.ok((await calendarStatus(sql,id))[0].error);providerFails=false;await syncCalendar(sql,id,'google');assert.equal((await filterCalendarSlots(sql,[free])).length,1);
 const [stored]=await sql`SELECT value FROM platform_state WHERE key=${'calendar-connection:'+id+':google'}`;assert.ok(stored.value.encrypted);assert.equal(stored.value.access_token,undefined);
 await disconnectCalendar(sql,id,'google');assert.equal((await calendarStatus(sql,id))[0].connected,false);assert.equal((await filterCalendarSlots(sql,[free])).length,1);

 process.env.CALENDLY_CLIENT_ID='test-calendly';process.env.CALENDLY_CLIENT_SECRET='test-calendly-secret';
 await sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},'calendar-test@example.invalid','Admin calendrier','admin','test','test')`;
 const type='https://api.calendly.com/event_types/testtype',user='https://api.calendly.com/users/testuser';
 globalThis.fetch=async(url,opts)=>{url=String(url);if(url.includes('/oauth/token'))return{ok:true,json:async()=>({...secret,expires_in:7200})};if(url.endsWith('/users/me'))return{ok:true,json:async()=>({resource:{uri:user}})};if(url.includes('/user_busy_times'))return{ok:true,json:async()=>({collection:[]})};if(url.includes('/event_types?'))return{ok:true,json:async()=>({collection:[{uri:type,name:'Visio 30 minutes',duration:30}]})};if(url.includes('/event_type_available_times?'))return{ok:true,json:async()=>({collection:[{status:'available',start_time:free.starts_at}]})};throw Error('unexpected provider URL')};
 const calendly=await startCalendar(sql,id,'calendly','session-c');assert.equal(new URL(calendly.url).hostname,'auth.calendly.com');await finishCalendar(sql,id,'calendly','session-c',new URL(calendly.url).searchParams.get('state'),'code');await chooseCalendarType(sql,id,type);
 const imported=await sql`SELECT value FROM platform_state WHERE key LIKE 'contact-slot:%' AND value->>'source'='calendly'`;assert.equal(imported.length,1);assert.equal(imported[0].value.host_id,id);
 assert.equal((await filterCalendarSlots(sql,[imported[0].value])).length,1);await assert.rejects(()=>chooseCalendarType(sql,id,'https://malicious.invalid/type'));
 await disconnectCalendar(sql,id,'calendly');const [removed]=await sql`SELECT value FROM platform_state WHERE key=${'contact-slot:'+imported[0].value.id}`;assert.equal(removed.value.status,'withdrawn');
 console.log('PASS: encrypted calendar tokens, PKCE, session binding, single-use OAuth, account isolation, busy filtering, fail-closed sync, disconnect.');
}finally{globalThis.fetch=originalFetch;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);await db.close()}
