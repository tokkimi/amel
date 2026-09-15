import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
const base='https://amelib.vercel.app';const sql=neon(process.env.DATABASE_URL);let id;
const request=async(action,body,cookie='')=>{const r=await fetch(base+'/api?action='+action,{method:body?'POST':'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});const text=await r.text();let result;try{result=JSON.parse(text)}catch{throw new Error('Non-JSON API response: '+r.status+' '+text.slice(0,100))}return{status:r.status,body:result,cookie:r.headers.get('set-cookie')?.split(';')[0],fullCookie:r.headers.get('set-cookie')}};
try{
 assert.equal((await request('session')).body.account,null);
 assert.equal((await request('dashboard')).status,401);
 const r=await request('signup',{name:'Production smoke test',email:`amelib-smoke-${randomUUID()}@example.invalid`,password:randomBytes(24).toString('base64url'),role:'patient'});assert.equal(r.status,200,JSON.stringify(r.body));id=r.body.account.id;
 assert.match(r.fullCookie,/HttpOnly/);assert.match(r.fullCookie,/Secure/);
 assert.equal((await request('dashboard',undefined,r.cookie)).body.account.id,id);
 assert.equal((await request('admin',undefined,r.cookie)).status,403);
 await request('logout',{},r.cookie);assert.equal((await request('session',undefined,r.cookie)).body.account,null);
 console.log('PASS: published API, real signup, secure session cookie, protected dashboard, role denial and logout.');
}finally{if(id)await sql`DELETE FROM accounts WHERE id=${id} AND email LIKE 'amelib-smoke-%@example.invalid'`;console.log('Temporary smoke-test account removed.');}
