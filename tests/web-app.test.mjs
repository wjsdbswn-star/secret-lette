import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import {landingResponse} from '../worker/src/landing.js';
import {decryptLetter,parseIncomingLink} from '../mobile/src/letter.js';

const origin='https://secret-letter-mobile-v10.wjsdbswn.workers.dev';
async function app({installed=false,userAgent='iPhone',maxTouchPoints=0,storage=new Map(),pathname='/',hash='',search='',shareFailure=null,clipboardFailure=false,db=null,confirmOpen=false,cryptoImpl=webcrypto}={}){
 const sqlite=db||new DatabaseSync(':memory:');
 const DB={prepare(sql){const q=sqlite.prepare(sql);return {bind(...v){return {async run(){return q.run(...v)},async first(){return q.get(...v)||null},async all(){return {results:q.all(...v)}}}}}}};
 const elements={},events={},requests=[],shares=[],copies=[],navigations=[],timers=new Map();let nextTimer=1;
 const html=await landingResponse().text();
 function element(attrs=''){
  const classes=new Set((attrs.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/));
  return {value:'',textContent:'',checked:/\bchecked\b/.test(attrs),href:attrs.match(/href="([^"]*)"/)?.[1]||'',disabled:/\bdisabled\b/.test(attrs),open:false,
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
   addEventListener(){},showModal(){this.open=true},close(){this.open=false},focus(){},select(){}};
 }
 for(const m of html.split('<script>')[0].matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*>/g))elements[m[1]]=element(m[0]);
 for(const m of html.matchAll(/<select id="([^"]+)">([\s\S]*?)<\/select>/g))elements[m[1]].value=m[2].match(/value="(\d+)" selected/)?.[1]||'0';
 const document={hidden:false,body:element(),getElementById:id=>{assert.ok(elements[id],id);return elements[id]},addEventListener(type,fn){(events[type]??=[]).push(fn)}};
 const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const nav={standalone:installed,userAgent,maxTouchPoints,share:async data=>{shares.push(data);if(shareFailure)throw shareFailure},clipboard:{writeText:async text=>{if(clipboardFailure)throw Error('clipboard denied');copies.push(text)}}};
 const context={document,localStorage,navigator:nav,window:{navigator:nav,addEventListener(type,fn){(events[type]??=[]).push(fn)}},location:{origin,pathname,hash,search,assign:value=>navigations.push(value)},
  URL,URLSearchParams,crypto:cryptoImpl,TextEncoder,TextDecoder,Uint8Array,atob,btoa,AbortController,Blob,
  history:{replaceState(){}},performance,setTimeout,clearTimeout,setInterval:fn=>{const id=nextTimer++;timers.set(id,fn);return id},clearInterval:id=>timers.delete(id),confirm:()=>confirmOpen,
  fetch:async(path,options)=>{requests.push({path,payload:options?.body?JSON.parse(options.body):null});return worker.fetch(new Request(origin+path,options),{DB})},
 };
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {e:elements,requests,shares,copies,storage,sqlite,document,events,timers,nav,navigations,DB};
}
const receive=(a,id)=>worker.fetch(new Request(origin+'/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}),{DB:a.DB});
test('다른 브라우저에서 보낸 사람이 취소하면 소비하지 않고 아이폰 수신자는 읽는다',async()=>{
 const sender=await app();await draft(sender,'발신자 실수 방지');await sender.e.composeSend.onclick();const url=new URL(sender.shares[0].url);
 const accidental=await app({db:sender.sqlite,pathname:url.pathname,hash:url.hash});await accidental.e.open.onclick();assert.equal(accidental.requests.length,0);
 const recipient=await app({db:sender.sqlite,pathname:url.pathname,hash:url.hash,confirmOpen:true});await recipient.e.open.onclick();assert.equal(recipient.e.letter.textContent,'발신자 실수 방지');
});
test('암호화가 막힌 브라우저는 1회 열람 API를 호출하기 전에 중단한다',async()=>{
 const sender=await app();await draft(sender,'브라우저 지원 오류');await sender.e.composeSend.onclick();const url=new URL(sender.shares[0].url);
 const blocked=await app({db:sender.sqlite,pathname:url.pathname,hash:url.hash,confirmOpen:true,cryptoImpl:{}});await blocked.e.open.onclick();assert.equal(blocked.requests.length,0);assert.match(blocked.e.notice.textContent,/Safari/);
 assert.equal((await receive(sender,url.pathname.split('/').pop())).status,200);
});
test('웹에서도 공유 성공 후 바로 빈 작성 화면을 보이며 추가 클릭 없이 다음 편지를 쓴다',async()=>{
 const a=await app();await draft(a,'첫 번째');a.e.webMinutes.value='2';await a.e.composeSend.onclick();const first=a.shares[0].url;
 assert.equal(a.e.webNewLetter,undefined);assert.equal(a.e.composeSend.textContent,'보내기');assert.equal(a.e.webMessage.value,'');assert.equal(a.e.webCount.textContent,'0 / 1600자');assert.equal(a.e.webMinutes.value,'2');assert.equal(a.e.webShareLink.value,first);assert.equal(a.e.webSenderButton.classList.contains('hidden'),false);assert.equal(a.e.webSendState.textContent,'');
 await a.e.composeSend.onclick();assert.equal(a.shares.length,1);
 a.e.webMessage.value='두 번째';a.e.webMessage.oninput();await a.e.composeSend.onclick();assert.notEqual(a.shares[1].url,first);assert.equal(a.e.webMessage.value,'');assert.equal(a.sqlite.prepare('SELECT COUNT(*) AS n FROM letters_v10').get().n,2);
});
async function draft(a,text){a.e.send.onclick();a.e.webMessage.value=text;a.e.webMessage.oninput();}
function choose(a,mode){a.e.webSingle.checked=mode==='single';a.e.webGroup.checked=mode==='group';(mode==='single'?a.e.webSingle:a.e.webGroup).onchange();}

test('아이폰 Safari에서 방식을 체크해도 전송하지 않고 글과 선택을 보존한다',async()=>{
 const a=await app();await draft(a,'체크해도 남아 있는 글');assert.equal(a.e.webCompose.classList.contains('hidden'),false);assert.equal(a.e.webSingle.checked,true);assert.equal(a.e.webGroup.checked,false);assert.equal(a.requests.length,0);
 assert.equal(a.e.installDialog.open,false);
 choose(a,'group');assert.equal(a.e.webSingle.checked,false);assert.equal(a.e.webGroup.checked,true);assert.equal(a.requests.length,0);assert.equal(a.shares.length,0);
 choose(a,'single');assert.equal(a.e.webSingle.checked,true);assert.equal(a.e.webGroup.checked,false);assert.equal(a.e.webAudience,undefined);assert.equal(a.e.webMessage.value,'체크해도 남아 있는 글');assert.equal(a.storage.size,0);
});
test('아이폰 웹앱에서 한 명 공유: 원문·키는 서버에 보내지 않고 기존 앱과 호환된다',async()=>{
 const a=await app();await draft(a,'아이폰 한 명 시험 🔒');await a.e.composeSend.onclick();
 assert.equal(a.shares[0].text,undefined);assert.doesNotMatch(a.shares[0].url,/#[\p{L}\p{N}_]+/u);
 assert.equal(a.shares.length,1);assert.equal(a.copies.length,0);const created=a.requests.find(r=>r.path==='/v10/create');
 assert.equal(created.payload.mode,'single');assert.deepEqual(Object.keys(created.payload).sort(),['ciphertext','id','iv','mode','seconds']);assert.ok(!JSON.stringify(created.payload).includes('아이폰 한 명 시험'));
 const incoming=parseIncomingLink(a.shares[0].url,origin+'/');const first=await receive(a,incoming.id);assert.equal(first.status,200);assert.equal(await decryptLetter(await first.json(),incoming.key,incoming.id),'아이폰 한 명 시험 🔒');assert.equal((await receive(a,incoming.id)).status,410);
 for(const value of a.storage.values())assert.ok(!value.includes('아이폰 한 명 시험'));
});
test('시간만 제한은 다른 앱의 공유창을 열고 같은 링크와 공통 종료 시각을 유지한다',async()=>{
 const a=await app();await draft(a,'아이폰 시간만 제한 시험');choose(a,'group');assert.equal(a.requests.length,0);await a.e.composeSend.onclick();await a.e.webReshare.onclick();
 assert.equal(a.shares.length,2);assert.equal(a.copies.length,0);assert.equal(a.shares[0].url,a.shares[1].url);assert.equal(a.requests.filter(r=>r.path==='/v10/create').length,1);
 const parsed=parseIncomingLink(a.shares[0].url,origin+'/');const first=await (await receive(a,parsed.id)).json(),second=await (await receive(a,parsed.id)).json();assert.equal(first.mode,'group');assert.equal(first.deadlineAt,second.deadlineAt);assert.equal(await decryptLetter(second,parsed.key,parsed.id),'아이폰 시간만 제한 시험');
});
test('공유 권한이나 복사가 막혀도 생성된 링크를 보존해 버튼으로 다시 시도한다',async()=>{
 const a=await app({shareFailure:{name:'NotAllowedError'}});await draft(a,'공유 권한 재시도');await a.e.composeSend.onclick();assert.equal(a.e.webReady.classList.contains('hidden'),false);assert.equal(a.e.webShare.classList.contains('hidden'),false);
 const url=a.e.webShareLink.value;await a.e.webShare.onclick();assert.equal(a.shares[1].url,url);assert.equal(a.requests.filter(r=>r.path==='/v10/create').length,1);
 const b=await app({shareFailure:{name:'NotAllowedError'},clipboardFailure:true});await draft(b,'복사 재시도');choose(b,'group');await b.e.composeSend.onclick();assert.equal(b.e.webShare.classList.contains('hidden'),false);await b.e.webCopy.onclick();assert.match(b.e.webShareLink.value,/^https:/);assert.equal(b.e.webReady.classList.contains('hidden'),false);b.nav.clipboard.writeText=async value=>b.copies.push(value);await b.e.webCopy.onclick();assert.equal(b.copies[0],b.e.webShareLink.value);
});
test('웹 공유를 취소하면 새 편지로 바뀌지 않고 같은 링크로 재시도한다',async()=>{
 const a=await app({shareFailure:{name:'AbortError'}});await draft(a,'보내지 못한 글');await a.e.composeSend.onclick();
 assert.equal(a.e.composeSend.textContent,'보내기');assert.equal(a.e.webMessage.value,'보내지 못한 글');await a.e.composeSend.onclick();
 assert.equal(a.shares[0].url,a.shares[1].url);assert.equal(a.requests.filter(r=>r.path==='/v10/create').length,1);
});
test('웹앱 발신자 확인과 같은 브라우저에서 자기 링크 열기는 수신자 열람을 소모하지 않는다',async()=>{
 const a=await app();await draft(a,'받는 사람보다 먼저 확인');await a.e.composeSend.onclick();await a.e.webSenderButton.onclick();assert.equal(a.e.webSenderPlain.textContent,'받는 사람보다 먼저 확인');assert.equal(a.requests.some(r=>r.path==='/v10/open'),false);
 a.document.hidden=true;for(const fn of a.events.visibilitychange)fn();assert.equal(a.e.webSenderPlain.textContent,'');
 const url=new URL(a.shares[0].url);const own=await app({installed:false,storage:a.storage,db:a.sqlite,pathname:url.pathname,hash:url.hash});await own.e.open.onclick();assert.equal(own.e.webSenderPlain.textContent,'받는 사람보다 먼저 확인');assert.equal(own.requests.some(r=>r.path==='/v10/open'),false);
 assert.equal((await receive(a,url.pathname.split('/').pop())).status,200);
});
test('보낸 편지 임시 기록은 15분이 지나면 정리한다',async()=>{
 const storage=new Map([['secretletter-sent-preview-v1',JSON.stringify([{id:'A'.repeat(24),createdAt:Date.now()-16*60000}])]]);await app({storage});assert.equal(storage.size,0);
});
test('새 아이폰 사용 링크와 이전 설치 링크 모두 아이콘 추가 없이 작성할 수 있다',async()=>{
 for(const search of ['?ios=1','?install=ios','?app=1']){
  const a=await app({installed:false,userAgent:'Desktop',search});assert.equal(a.e.installDialog.open,false);
  await draft(a,'설치 없이 쓰는 편지');choose(a,'group');assert.equal(a.e.webCompose.classList.contains('hidden'),false);assert.equal(a.e.webAudience,undefined);assert.equal(a.requests.length,0);
 }
});
test('아이패드와 기존 홈 화면 앱도 작성·보내기를 유지한다',async()=>{
 for(const options of [{userAgent:'iPad'},{userAgent:'Macintosh',maxTouchPoints:5},{userAgent:'Desktop',installed:true}]){
  const a=await app(options);await draft(a,'아이패드 및 기존 앱 시험');await a.e.composeSend.onclick();assert.equal(a.shares.length,1);assert.equal(a.e.installDialog.open,false);
 }
});
test('설치 메타데이터와 PNG 아이콘은 DB 없이 제공하며 편지를 캐시하지 않는다',async()=>{
 const manifest=await worker.fetch(new Request(origin+'/manifest.webmanifest'),{});assert.equal(manifest.status,200);const value=await manifest.json();assert.equal(value.display,'standalone');assert.equal(value.start_url,'/');assert.equal(value.scope,'/');
 for(const [path,size] of [['/apple-touch-icon.png',180],['/icons/icon-192.png',192],['/icons/icon-512.png',512]]){const response=await worker.fetch(new Request(origin+path),{});assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');const bytes=await response.arrayBuffer();assert.equal(new DataView(bytes).getUint32(16),size);assert.equal(new DataView(bytes).getUint32(20),size);}
 const response=await landingResponse();const html=await response.text();assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Content-Security-Policy'),/manifest-src 'self'/);assert.match(html,/apple-mobile-web-app-capable/);assert.doesNotMatch(html,/serviceWorker\.register|caches\.open/);
});
