import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import {encryptLetter} from '../mobile/src/letter.js';

function makeD1(){
 const sqlite=new DatabaseSync(':memory:');
 const DB={prepare(sql){
  const stmt=sqlite.prepare(sql);
  return {bind(...v){return {
   async run(){return stmt.run(...v);},
   async first(){return stmt.get(...v)||null;},
   async all(){return {results:stmt.all(...v)};},
  }}};
 }};
 return DB;
}
function fakeDocument(){
 const ids=['hint','open','during','letter','close','notice','time','report','senderGuide','senderJump'];
 const elements=Object.fromEntries(ids.map(id=>{
  const classes=new Set(id==='during'?['hidden']:[]);
  return [id,{textContent:'',disabled:id==='open',style:{},href:'',classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)}}}];
 }));
 return {elements,document:{hidden:false,getElementById(id){return elements[id]},addEventListener(){}}};
}
test('편지를 받으면 앱 없이 브라우저에서 복호화하고 최초 열람만 허용',async()=>{
 const DB=makeD1();
 const letter=await encryptLetter('웹 읽기 실사용 시나리오 🔒','single',30);
 const res=await worker.fetch(new Request('https://letter.test/v10/create',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({id:letter.id,mode:letter.mode,seconds:letter.seconds,iv:letter.iv,ciphertext:letter.ciphertext})
 }),{DB});
 assert.equal(res.status,201);
 const landing=await worker.fetch(new Request('https://letter.test/l/'+letter.id),{DB});
 assert.equal(landing.status,200);
 const html=await landing.text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script);
 const {elements,document}=fakeDocument();
 const location={pathname:'/l/'+letter.id,hash:'#k='+letter.key};
 const history={replaceState(){}};
 const callbacks={};
 const context={document,location,history,URLSearchParams,Uint8Array,TextEncoder,TextDecoder,atob,
   crypto:webcrypto,performance,
   setInterval(fn){callbacks.tick=fn;return 1},clearInterval(){},confirm(){return true},window:{addEventListener(){}},
   fetch:async(path,options)=>worker.fetch(new Request('https://letter.test'+path,options),{DB})
 };
 vm.runInNewContext(script,context);
 assert.equal(elements.open.disabled,false);
 await elements.open.onclick();
 assert.equal(elements.letter.textContent,'웹 읽기 실사용 시나리오 🔒');
 assert.equal(elements.during.classList.contains('hidden'),false);
 assert.equal(elements.open.classList.contains('hidden'),true);
 assert.equal(typeof callbacks.tick,'function');
 assert.equal(elements.report.classList.contains('hidden'),false);
 await elements.report.onclick();
 assert.match(elements.notice.textContent,/30일 증거 보관 접수 완료/);
 elements.close.onclick();
 assert.equal(elements.letter.textContent,'');
 const retry=await worker.fetch(new Request('https://letter.test/v10/open',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id})
 }),{DB});
 assert.equal(retry.status,410);
});
test('9차 웹페이지의 편지 쓰기 UI는 숨기고 기존 링크 해독은 유지한다',async()=>{
 const {readFileSync}=await import('node:fs');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/#compose,#settings,#replyHint,#replyWeb\{display:none!important\}/);
 assert.match(html,/location\.hash\.startsWith\('#letter='\)/);
 assert.match(html,/secret-letter-v7\|/);
 assert.match(html,/releases\/latest\/download\/secret-letter\.apk/);
});

test('신고 증거 30일 보관은 유효한 열람 증명과 원래 암호문이 필요하다',async()=>{
 const DB=makeD1();
 const letter=await encryptLetter('피해증거 저장 테스트','single',40);
 const body={id:letter.id,mode:letter.mode,seconds:letter.seconds,iv:letter.iv,ciphertext:letter.ciphertext};
 let r=await worker.fetch(new Request('https://letter.test/v10/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB});
 assert.equal(r.status,201);
 r=await worker.fetch(new Request('https://letter.test/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id})}),{DB});
 assert.equal(r.status,200);
 const opened=await r.json();
 assert.match(opened.reportToken,/^[a-f0-9]{48}$/);
 const proof={id:letter.id,reportToken:opened.reportToken,key:letter.key,mode:opened.mode,durationSeconds:opened.durationSeconds,iv:opened.iv,ciphertext:opened.ciphertext};
 r=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...proof,ciphertext:opened.ciphertext+'A'})}),{DB});
 assert.equal(r.status,400,'tampered ciphertext is rejected by AES-GCM before receipt check');
 r=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)}),{DB});
 assert.equal(r.status,201);
 assert.equal((await r.json()).retentionDays,30);
 r=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proof)}),{DB});
 assert.equal(r.status,403,'replayed proof must be rejected');
 r=await worker.fetch(new Request('https://letter.test/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id})}),{DB});
 assert.equal(r.status,410,'report must not restore a consumed one-time letter');
});
test('일반 편지의 증거 보관은 기본적으로 생성되지 않는다',async()=>{
 const DB=makeD1();
 await worker.fetch(new Request('https://letter.test/v10/health'),{DB});
 const result=await DB.prepare('SELECT COUNT(*) AS n FROM reports_v10').bind().first();
 assert.equal(result.n,0);
});

test('잘못된 신고 암호키는 자동 보관하지 않고 올바른 키는 받는다',async()=>{
 const DB=makeD1();
 const letter=await encryptLetter('증거 키 일치 테스트','group',120);
 const send=await worker.fetch(new Request('https://letter.test/v10/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id,mode:letter.mode,seconds:letter.seconds,iv:letter.iv,ciphertext:letter.ciphertext})}),{DB});
 assert.equal(send.status,201);
 const opened=await worker.fetch(new Request('https://letter.test/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id})}),{DB});
 const record=await opened.json();
 const evidence={id:letter.id,reportToken:record.reportToken,key:letter.key,mode:record.mode,durationSeconds:record.durationSeconds,iv:record.iv,ciphertext:record.ciphertext};
 const bad=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...evidence,key:'A'.repeat(43)})}),{DB});
 assert.equal(bad.status,400);
 const good=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)}),{DB});
 assert.equal(good.status,201,'invalid report does not burn the valid receipt');
});
test('기간 지난 신고 증거는 예약 작업으로 자동 삭제된다',async()=>{
 const DB=makeD1();
 const letter=await encryptLetter('30일 자동 삭제 모의시험','single',30);
 const put=await worker.fetch(new Request('https://letter.test/v10/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id,mode:letter.mode,seconds:letter.seconds,iv:letter.iv,ciphertext:letter.ciphertext})}),{DB});
 assert.equal(put.status,201);
 const opened=await worker.fetch(new Request('https://letter.test/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id})}),{DB});
 const record=await opened.json();
 const save=await worker.fetch(new Request('https://letter.test/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:letter.id,reportToken:record.reportToken,key:letter.key,mode:record.mode,durationSeconds:record.durationSeconds,iv:record.iv,ciphertext:record.ciphertext})}),{DB});
 assert.equal(save.status,201);
 await DB.prepare('UPDATE reports_v10 SET delete_after_ms=0 WHERE id=?').bind(letter.id).run();
 let task;
 await worker.scheduled({}, {DB}, {waitUntil(p){task=p}});
 await task;
 const result=await DB.prepare('SELECT COUNT(*) AS n FROM reports_v10 WHERE id=?').bind(letter.id).first();
 assert.equal(result.n,0);
});
test('같은 접속 환경의 과도한 생성 요청은 자동 제한한다',async()=>{
 const DB=makeD1();
 let result;
 for(let n=0;n<61;n++)result=await worker.fetch(new Request('https://letter.test/v10/create',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.88'},body:'{}'}),{DB});
 assert.equal(result.status,429);
});
