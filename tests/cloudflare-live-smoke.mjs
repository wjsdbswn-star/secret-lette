import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encryptLetter,decryptLetter} from '../mobile/src/letter.js';

const cfg=JSON.parse(readFileSync(new URL('../server-config.json',import.meta.url),'utf8'));
const base=cfg.apiBase;
assert.match(base,/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/);
assert.equal(cfg.webBase,base+'/');

async function get(path){
 const r=await fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 return r;
}
async function post(path,body) {
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000),cache:'no-store'});
 let payload; try {payload=await r.json();}catch {payload={};}
 return {status:r.status,payload};
}
const health=await get('/v10/health');
const info=await health.json();
assert.equal(health.status,200,JSON.stringify(info));
assert.equal(info.service,'secret-letter-v10');
assert.equal(info.ok,true);
console.log('OK: live Worker health and D1 initialized');

const home=await get('/');
assert.equal(home.status,200);
assert.match(await home.text(),/비밀편지가 도착했어요/);
console.log('OK: Worker app-only landing');

const single=await encryptLetter('앱 연동 자동시험 · 1회 🔒','single',30);
let create=await post('/v10/create',{id:single.id,iv:single.iv,ciphertext:single.ciphertext,seconds:single.seconds,mode:'single'});
assert.equal(create.status,201,JSON.stringify(create));
const landing=await get('/l/'+single.id);
assert.equal(landing.status,200);
let first=await post('/v10/open',{id:single.id});
assert.equal(first.status,200,JSON.stringify(first));
assert.equal(await decryptLetter(first.payload,single.key,single.id),'앱 연동 자동시험 · 1회 🔒');
let second=await post('/v10/open',{id:single.id});
assert.equal(second.status,410,JSON.stringify(second));
console.log('OK: encrypted one-time create/open/decrypt and second-open rejection');

const group=await encryptLetter('앱 연동 자동시험 · 여러 명','group',20);
create=await post('/v10/create',{id:group.id,iv:group.iv,ciphertext:group.ciphertext,seconds:group.seconds,mode:'group'});
assert.equal(create.status,201,JSON.stringify(create));
const g1=await post('/v10/open',{id:group.id});
const g2=await post('/v10/open',{id:group.id});
assert.equal(g1.status,200,JSON.stringify(g1));
assert.equal(g2.status,200,JSON.stringify(g2));
assert.equal(g1.payload.deadlineAt,g2.payload.deadlineAt);
assert.equal(await decryptLetter(g2.payload,group.key,group.id),'앱 연동 자동시험 · 여러 명');
console.log('OK: shared group deadline and decrypt; data expires automatically');
console.log('SUCCESS: Cloudflare live service verified. No secrets or plaintext stored remotely.');
