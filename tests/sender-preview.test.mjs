import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import {encryptLetter,decryptLetter} from '../mobile/src/letter.js';
import {rememberSent,lookupSent,forgetSent,parseSentDeepLink,SENT_PREVIEW_MS} from '../mobile/src/sent-preview.js';
function fakeStorage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
function makeDB(){
  const db=new DatabaseSync(':memory:');
  return {prepare(sql){const q=db.prepare(sql);return {bind(...a){return {async run(){return q.run(...a)},async first(){return q.get(...a)||null},async all(){return {results:q.all(...a)}}}}}}};
}
async function post(DB,path,body){
 const r=await worker.fetch(new Request('https://test.example'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB});
 return {status:r.status,data:await r.json()};
}
test('카카오톡에서 발신자가 앱 미리보기로 읽어도 수신자 1회 열람 유지',async()=>{
 const DB=makeDB(),store=fakeStorage(),now=Date.now();
 const crypt=await encryptLetter('발신자 확인 후 받는 사람도 읽습니다','single',120);
 assert.equal((await post(DB,'/v10/create',{id:crypt.id,mode:crypt.mode,seconds:crypt.seconds,iv:crypt.iv,ciphertext:crypt.ciphertext})).status,201);
 rememberSent(crypt,store,now);
 const deepLink='secretletter://sent/'+crypt.id;
 assert.equal(parseSentDeepLink(deepLink),crypt.id);
 const saved=lookupSent(crypt.id,store,now);
 assert.ok(saved);
 assert.equal((await post(DB,'/v10/status',{id:crypt.id})).data.available,true);
 const preview=await decryptLetter({mode:saved.mode,durationSeconds:saved.seconds,iv:saved.iv,ciphertext:saved.ciphertext},saved.key,saved.id);
 assert.equal(preview,'발신자 확인 후 받는 사람도 읽습니다');
 // Preview does NOT call the destructive /v10/open endpoint.
 const received=await post(DB,'/v10/open',{id:crypt.id});
 assert.equal(received.status,200);
 assert.equal(await decryptLetter(received.data,crypt.key,crypt.id),preview);
 assert.equal((await post(DB,'/v10/status',{id:crypt.id})).data.available,false);
 assert.equal((await post(DB,'/v10/open',{id:crypt.id})).status,410);
 forgetSent(crypt.id,store,now);
 assert.equal(lookupSent(crypt.id,store,now),null);
});
test('발신자 임시 확인 기록은 지정된 시간 이후 정리된다',async()=>{
 const store=fakeStorage(),crypt=await encryptLetter('임시 암호화 캐시','single',30);
 rememberSent(crypt,store,1000);
 assert.ok(lookupSent(crypt.id,store,1000+SENT_PREVIEW_MS-1));
 assert.equal(lookupSent(crypt.id,store,1000+SENT_PREVIEW_MS),null);
 assert.equal(parseSentDeepLink('https://example.com/l/'+crypt.id),null);
 assert.equal(parseSentDeepLink('secretletter://sent/bad'),null);
});
test('받는 웹페이지에 발신자용 앱 링크가 있으며 누르는 것만으로 서버 열람하지 않는다',async()=>{
 const r=await worker.fetch(new Request('https://test.example/l/'+'A'.repeat(24)),{});
 const html=await r.text();
 assert.match(html,/id="senderJump"/);
 assert.match(html,/secretletter:\/\/sent\//);
 assert.match(html,/보낸 사람/);
 assert.match(html,/발신자가 .*받는 사람/);
});
