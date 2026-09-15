import {scrypt as scryptCallback,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export async function passwordHash(password){const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});return salt+':'+key.toString('hex');}
export async function verifyPassword(password,stored){const [salt,key]=stored.split(':');const computed=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864});return timingSafeEqual(computed,Buffer.from(key,'hex'));}
export function validPassword(value){return typeof value==='string'&&value.length>=12&&value.length<=128;}
export function safeAccount(a){return {id:a.id,name:a.name,email:a.email,role:a.role};}
export const clean=(value,max=200)=>typeof value==='string'?value.trim().slice(0,max):'';
