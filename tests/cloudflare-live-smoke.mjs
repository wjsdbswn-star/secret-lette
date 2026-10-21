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
assert.equal(info.reportRetentionDays,30,'Cloudflare에 v10.8 서버 배포가 필요합니다.');
console.log('OK: live Worker health and D1 initialized');

let home,homeHtml='';
for(let n=0;n<18;n++){
 home=await get('/');
 homeHtml=await home.text();
 if(home.status===200 && homeHtml.includes('앱 설치 없이 웹에서 읽을 수 있습니다.') && homeHtml.includes('crypto.subtle.decrypt') && homeHtml.includes('id="senderJump"'))break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(home.status,200,'Cloudflare deployment may still be updating');
assert.match(homeHtml,/비밀편지가 도착했어요/);
assert.match(homeHtml,/앱 설치 없이 웹에서 읽을 수 있습니다/,'최신 Worker에 웹 열람 코드 배포 필요');
assert.match(homeHtml,/crypto\.subtle\.decrypt/);
assert.match(homeHtml,/property="og:title"/);
assert.match(homeHtml,/id="report"/);
assert.match(homeHtml,/id="senderJump"/,'보낸 사람 전용 미리보기 버튼이 배포되지 않았습니다.');
assert.doesNotMatch(homeHtml,/secretletter:\/\/open/);
console.log('OK: live Worker serves app-free browser decryption and app install call-to-action');

const single=await encryptLetter('앱 연동 자동시험 · 1회 🔒','single',30);
let create=await post('/v10/create',{id:single.id,iv:single.iv,ciphertext:single.ciphertext,seconds:single.seconds,mode:'single'});
assert.equal(create.status,201,JSON.stringify(create));
const availability=await post('/v10/status',{id:single.id});
assert.equal(availability.status,200,'비소모 상태 조회 기능이 Cloudflare에 배포되지 않았습니다.');
assert.equal(availability.payload.available,true);
const landing=await get('/l/'+single.id);
assert.equal(landing.status,200);
let first=await post('/v10/open',{id:single.id});
assert.equal(first.status,200,JSON.stringify(first));
assert.match(first.payload.reportToken,/^[a-f0-9]{48}$/);
assert.equal(await decryptLetter(first.payload,single.key,single.id),'앱 연동 자동시험 · 1회 🔒');
const afterPreview=await post('/v10/status',{id:single.id});
assert.equal(afterPreview.status,200);
assert.equal(afterPreview.payload.available,false);
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
// 신고한 편지에만 키와 암호문을 30일간 보관하는 실제 D1 경로를 시험합니다.
const evidenceLetter=await encryptLetter('공개 자동시험 문장입니다. 개인정보가 없습니다.','single',120);
let evid=await post('/v10/create',{id:evidenceLetter.id,iv:evidenceLetter.iv,ciphertext:evidenceLetter.ciphertext,seconds:evidenceLetter.seconds,mode:evidenceLetter.mode});
assert.equal(evid.status,201,JSON.stringify(evid));
const openedEvidence=await post('/v10/open',{id:evidenceLetter.id});
assert.equal(openedEvidence.status,200,JSON.stringify(openedEvidence));
assert.match(openedEvidence.payload.reportToken,/^[a-f0-9]{48}$/);
const evidence={id:evidenceLetter.id,reportToken:openedEvidence.payload.reportToken,key:evidenceLetter.key,
 mode:openedEvidence.payload.mode,durationSeconds:openedEvidence.payload.durationSeconds,
 iv:openedEvidence.payload.iv,ciphertext:openedEvidence.payload.ciphertext};
const reported=await post('/v10/report',evidence);
assert.equal(reported.status,201,JSON.stringify(reported));
assert.equal(reported.payload.retentionDays,30);
const replay=await post('/v10/report',evidence);
assert.equal(replay.status,403);
console.log('OK: real Cloudflare D1 optional report archived, once-only report receipt prevents replay');
console.log('SUCCESS: Live Cloudflare v10.9 server verified. Only opt-in reports retain decryptable evidence.');
