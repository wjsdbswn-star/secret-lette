import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import {encryptLetter,decryptLetter} from '../mobile/src/letter.js';

function envWithR2(){
 const sqlite=new DatabaseSync(':memory:');
 const objects=new Map();
 const DB={prepare(sql){
  const stmt=sqlite.prepare(sql);
  return {bind(...vals){return {
   async run(){return stmt.run(...vals)},
   async first(){return stmt.get(...vals)||null},
   async all(){return {results:stmt.all(...vals)}}
  }}};
 }};
 const PRIVATE_BLOBS={
  async put(id,bytes){objects.set(id,String(bytes))},
  async get(id){const data=objects.get(id);return data===undefined?null:{async text(){return data}}},
  async delete(id){objects.delete(id)}
 };
 return {DB,sqlite,PRIVATE_BLOBS,objects};
}
async function req(env,path,body){
 const r=await worker.fetch(new Request('https://local.test/v11/'+path,body?{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
 }:{}),env);
 return {status:r.status,body:await r.json()};
}
async function add(env,msg,mode,seconds){
 const crypt=await encryptLetter(msg,mode,seconds);
 const r=await req(env,'create',{id:crypt.id,mode,seconds,iv:crypt.iv,ciphertext:crypt.ciphertext});
 assert.equal(r.status,201,JSON.stringify(r.body));
 return crypt;
}
test('v11 without private R2 fails closed and does not use backed-up D1 ciphertext',async()=>{
 const {DB}=envWithR2();
 const health=await req({DB},'health');
 assert.equal(health.status,503);
 assert.equal(health.body.ok,false);
 const c=await encryptLetter('이 내용은 저장하면 안 됨','single',30);
 const r=await req({DB},'create',{id:c.id,mode:'single',seconds:30,iv:c.iv,ciphertext:c.ciphertext});
 assert.equal(r.status,503);
});
test('v11 D1 only contains metadata, R2 ciphertext is unreadable without link secret',async()=>{
 const env=envWithR2();
 const c=await add(env,'관리자에게는 평문을 숨깁니다','single',30);
 const row=env.sqlite.prepare('SELECT * FROM letters_v11 WHERE id=?').get(c.id);
 assert.ok(row);
 assert.equal(row.ready,1);
 assert.ok(!JSON.stringify(row).includes('ciphertext'));
 assert.ok(!JSON.stringify(row).includes(c.ciphertext));
 assert.ok(!JSON.stringify(row).includes(c.key));
 assert.ok(!JSON.stringify(row).includes(c.iv));
 const blob=env.objects.get('secure-v11/'+c.id);
 assert.ok(blob.includes(c.ciphertext));
 assert.ok(!blob.includes(c.key));
 assert.ok(!blob.includes('관리자에게는 평문을 숨깁니다'));
});
test('v11 한 명만: 한 번 열람 후 R2 암호문이 사라지고 D1도 삭제',async()=>{
 const env=envWithR2();const c=await add(env,'한 번만 읽는 내용','single',30);
 const first=await req(env,'open',{id:c.id});
 assert.equal(first.status,200);
 assert.equal(await decryptLetter(first.body,c.key,c.id),'한 번만 읽는 내용');
 assert.equal(env.objects.has('secure-v11/'+c.id),false);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM letters_v11').get().n,0);
 assert.equal((await req(env,'open',{id:c.id})).status,410);
});
test('v11 여럿: 공통 소멸시간, 복원된 과거 D1행에도 R2 암호문 없음',async()=>{
 const env=envWithR2();const c=await add(env,'시간 지나면 복원 불가 시험','group',2);
 const a=await req(env,'open',{id:c.id}),b=await req(env,'open',{id:c.id});
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(a.body.deadlineAt,b.body.deadlineAt);
 assert.equal(await decryptLetter(b.body,c.key,c.id),'시간 지나면 복원 불가 시험');
 const historical={...env.sqlite.prepare('SELECT * FROM letters_v11 WHERE id=?').get(c.id)};
 env.sqlite.prepare('UPDATE letters_v11 SET expires_at_ms=? WHERE id=?').run(Date.now()-1,c.id);
 let pending;
 await worker.scheduled({},env,{waitUntil:p=>{pending=p;}});
 await pending;
 assert.equal(env.objects.has('secure-v11/'+c.id),false);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM letters_v11').get().n,0);
 // Simulated D1 Time Travel: restoring metadata cannot restore missing R2 ciphertext.
 env.sqlite.prepare(`INSERT INTO letters_v11
 (id,mode,duration_seconds,created_at_ms,unopened_until_ms,opened_at_ms,expires_at_ms,ready)
 VALUES (?,?,?,?,?,?,?,?)`).run(historical.id,historical.mode,historical.duration_seconds,
 historical.created_at_ms,historical.unopened_until_ms,historical.opened_at_ms,
 Date.now()+30_000,historical.ready);
 assert.equal((await req(env,'open',{id:c.id})).status,410);
});

test('v11 R2 delete failure never returns plaintext and retains retry tombstone',async()=>{
 const env=envWithR2();const c=await add(env,'실패에도 복구 위험 최소화','single',30);
 const del=env.PRIVATE_BLOBS.delete.bind(env.PRIVATE_BLOBS);
 let failOnce=true;
 env.PRIVATE_BLOBS.delete=async id=>{if(failOnce){failOnce=false;throw Error('simulated R2 network outage');}return del(id);};
 const failed=await req(env,'open',{id:c.id});
 assert.equal(failed.status,500); // Do not send ciphertext if delete did not succeed
 const row=env.sqlite.prepare('SELECT ready,opened_at_ms FROM letters_v11 WHERE id=?').get(c.id);
 assert.equal(row.ready,0);
 assert.ok(row.opened_at_ms);
 assert.equal((await req(env,'open',{id:c.id})).status,410);
 assert.equal(env.objects.has('secure-v11/'+c.id),true);
 let pending;await worker.scheduled({},env,{waitUntil:p=>{pending=p}});
 await pending;
 assert.equal(env.objects.has('secure-v11/'+c.id),false);
 assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM letters_v11 WHERE id=?').get(c.id).n,0);
});
