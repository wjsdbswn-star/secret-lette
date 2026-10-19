import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import {encryptLetter,decryptLetter} from '../mobile/src/letter.js';

function database(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
 const DB={
  prepare(sql){
   const stmt=sqlite.prepare(sql);
   return {
    bind(...values){return {
      async run(){return stmt.run(...values);},
      async first(){return stmt.get(...values)||null;},
      async all(){return {results:stmt.all(...values)};},
    };},
    async all(){return {results:stmt.all()};},
   };
  },
 };
 return {sqlite,DB};
}
async function req(env,path,body){const resp=await worker.fetch(new Request('https://local.test/v10/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env);return {status:resp.status,data:await resp.json()};}
async function add(env,pt,mode,seconds){const c=await encryptLetter(pt,mode,seconds);const r=await req(env,'create',{id:c.id,mode,seconds,iv:c.iv,ciphertext:c.ciphertext});assert.equal(r.status,201);return c;}

test('서버에 편지 원문과 복호화 키 없이 암호문만 저장',async()=>{
 const {DB,sqlite}=database();const c=await add({DB},'서버가 몰라야 할 내용','single',10);
 const x=sqlite.prepare('SELECT * FROM letters_v10 WHERE id=?').get(c.id);
 assert.equal(x.iv,c.iv);assert.equal(x.ciphertext,c.ciphertext);
 assert.ok(!JSON.stringify(x).includes('서버가 몰라야 할 내용'));
 assert.ok(!JSON.stringify(x).includes(c.key));
 const health=await req({DB},'health');assert.equal(health.data.ok,true);
});
test('한 명만 보기: 동시 2회 요청 중 최초 1개만 성공, 서버 DB에서 즉시 삭제',async()=>{
 const {DB,sqlite}=database(),env={DB};const c=await add(env,'단 한 번', 'single',20);
 const [a,b]=await Promise.all([req(env,'open',{id:c.id}),req(env,'open',{id:c.id})]);
 assert.deepEqual([a.status,b.status].sort((x,y)=>x-y),[200,410]);
 const success=a.status===200?a.data:b.data;
 assert.equal(await decryptLetter(success,c.key,c.id),'단 한 번');
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS cnt FROM letters_v10').get().cnt,0);
});
test('여럿이 보기: 열람자들에게 공통 종료 시각 제공, 마감 후 410',async()=>{
 const {DB,sqlite}=database(),env={DB};const c=await add(env,'같이 읽기', 'group',2);
 const a=await req(env,'open',{id:c.id});const b=await req(env,'open',{id:c.id});
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(a.data.deadlineAt,b.data.deadlineAt);
 assert.equal(await decryptLetter(b.data,c.key,c.id),'같이 읽기');
 sqlite.prepare('UPDATE letters_v10 SET expires_at_ms=? WHERE id=?').run(Date.now()-1,c.id);
 const expired=await req(env,'open',{id:c.id});assert.equal(expired.status,410);
 await worker.scheduled({},env,{waitUntil:async p=>p});
 // scheduled의 ctx.waitUntil에서 비동기 작업이 시작되므로 짧은 microtask 대기
 await new Promise(r=>setTimeout(r,0));
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS cnt FROM letters_v10').get().cnt,0);
});
test('검증되지 않은 편지는 거절',async()=>{
 const {DB}=database();const r=await req({DB},'create',{id:'bad',mode:'single',seconds:1,iv:'x',ciphertext:'x'});
 assert.equal(r.status,400);
});
