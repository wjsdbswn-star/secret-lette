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
 const ids=['hint','open','during','letter','close','notice','time'];
 const elements=Object.fromEntries(ids.map(id=>{
  const classes=new Set(id==='during'?['hidden']:[]);
  return [id,{textContent:'',disabled:id==='open',classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)}}}];
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
   setInterval(fn){callbacks.tick=fn;return 1},clearInterval(){},window:{addEventListener(){}},
   fetch:async(path,options)=>worker.fetch(new Request('https://letter.test'+path,options),{DB})
 };
 vm.runInNewContext(script,context);
 assert.equal(elements.open.disabled,false);
 await elements.open.onclick();
 assert.equal(elements.letter.textContent,'웹 읽기 실사용 시나리오 🔒');
 assert.equal(elements.during.classList.contains('hidden'),false);
 assert.equal(elements.open.classList.contains('hidden'),true);
 assert.equal(typeof callbacks.tick,'function');
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
