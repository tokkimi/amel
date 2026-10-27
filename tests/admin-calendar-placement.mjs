import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import callback from '../api/calendar-callback.mjs';
const headers={};let status;
await callback({method:'POST',headers:{},query:{}},{setHeader(k,v){headers[k]=v},status(s){status=s;return this},end(){}});
assert.equal(status,303);assert.equal(headers.Location,'/admin?tab=Configuration&calendar=failed');
const config=await readFile(new URL('../src/admin/Config.tsx',import.meta.url),'utf8'),requests=await readFile(new URL('../src/admin/ContactWorkflow.tsx',import.meta.url),'utf8'),panel=await readFile(new URL('../src/admin/CalendarConnections.tsx',import.meta.url),'utf8');
assert.ok(config.includes('<CalendarConnections/>'));assert.ok(!requests.includes('<CalendarConnections/>'));assert.ok(panel.includes('<h2>Agendas connectés</h2>'));assert.ok(!panel.includes('<details className="cc-calendar-settings">'));
console.log('PASS: calendar panel only in Platform settings, visible heading, OAuth returns to settings.');
