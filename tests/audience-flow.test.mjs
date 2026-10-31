import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import * as letter from '../mobile/src/letter.js';
import * as sent from '../mobile/src/sent-preview.js';

function app({db=null,shareFailure=null}={}){
 const html=readFileSync(new URL('../mobile/index.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('../mobile/src/main.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.env','({})');
 const elements={},all=[],shares=[],copies=[],requests=[],appEvents={};
 const sqlite=db||new DatabaseSync(':memory:');
 const DB={prepare(sql){const q=sqlite.prepare(sql);return {bind(...v){return {async run(){return q.run(...v)},async first(){return q.get(...v)||null},async all(){return {results:q.all(...v)}}}}}}};
 const saved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 function element(attrs=''){
  const classes=new Set((attrs.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/));
  const listeners={},dataset={};
  for(const m of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=m[2];
  return {dataset,value:'',textContent:'',checked:/\bchecked\b/.test(attrs),disabled:/\bdisabled\b/.test(attrs),open:false,style:{},
   addEventListener(type,handler){(listeners[type]??=[]).push(handler)},
   async fire(type){for(const handler of listeners[type]||[])await handler({target:this})},
   showModal(){this.open=true},close(){this.open=false},focus(){},select(){},append(){},setAttribute(){},
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},
  };
 }
 for(const m of html.matchAll(/<[a-z][^>]*>/g)){
  const attrs=m[0],id=attrs.match(/\bid="([^"]+)"/)?.[1];
  if(!id&&!attrs.includes('data-mode=')&&!attrs.includes('data-send-mode='))continue;
  const e=element(attrs);all.push(e);if(id)elements[id]=e;
 }
 const document={hidden:false,body:element('class="is-home"'),getElementById:id=>{
  assert.ok(elements[id],'missing UI element '+id);return elements[id];
 },querySelectorAll:selector=>all.filter(e=>selector==='[data-mode]'?e.dataset.mode:selector==='[data-send-mode]'?e.dataset.sendMode:false),
 createElement:()=>element(),addEventListener(){}};
 vm.runInNewContext(source,{
  document,localStorage:storage,Capacitor:{isNativePlatform:()=>true},
  App:{addListener(name,callback){appEvents[name]=callback},getLaunchUrl:async()=>({})},
  Share:{share:async value=>{shares.push(value);if(shareFailure)throw shareFailure}},Clipboard:{write:async value=>{copies.push(value.string)}},
  ...letter,rememberSent:value=>sent.rememberSent(value,storage),lookupSent:id=>sent.lookupSent(id,storage),forgetSent:id=>sent.forgetSent(id,storage),parseSentDeepLink:sent.parseSentDeepLink,
  URL,URLSearchParams,AbortController,AbortSignal,TextEncoder,TextDecoder,Uint8Array,performance,
  setTimeout,clearTimeout,setInterval,clearInterval,console,confirm:()=>true,window:{addEventListener(){}},navigator:{},
  fetch:async(url,options)=>{
   requests.push({url,payload:options.body&&JSON.parse(options.body)});
   return worker.fetch(new Request(url,options),{DB});
  },
 });
 return {elements,shares,copies,requests,appEvents,sqlite,DB};
}
test('시간만 제한 체크 후 보내기를 누르면 공유창을 열고 같은 링크를 재사용한다',async()=>{
 const a=app(),e=a.elements;
 await e.goCompose.fire('click');assert.equal(e.audienceDialog,undefined);assert.equal(e.compose.classList.contains('hidden'),false);
 e.message.value='여러 명 링크 복사 시험';await e.message.fire('input');e.chooseGroup.checked=true;await e.chooseGroup.fire('change');
 assert.equal(e.chooseSingle.checked,false);assert.equal(a.requests.length,0);assert.equal(a.shares.length,0);
 await e.send.fire('click');
 assert.equal(a.shares.length,1);assert.equal(a.copies.length,0);
 assert.equal(a.shares[0].text,undefined);assert.doesNotMatch(a.shares[0].url,/#[\p{L}\p{N}_]+/u);
 assert.equal(a.requests.filter(r=>r.url.endsWith('/create'))[0].payload.mode,'group');
 assert.equal(e.send.textContent,'보내기');assert.equal(e.message.value,'');assert.equal(e.chooseGroup.checked,true);await e.reshare.fire('click');
 assert.equal(a.shares.length,2);assert.equal(a.shares[0].url,a.shares[1].url);assert.equal(a.copies.length,0);
 assert.equal(a.requests.filter(r=>r.url.endsWith('/create')).length,1);
 const parsed=letter.parseIncomingLink(a.shares[0].url,'https://secret-letter-mobile-v10.wjsdbswn.workers.dev/');
 const open=()=>worker.fetch(new Request('https://test.example/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:parsed.id})}),{DB:a.DB});
 const first=await (await open()).json(),second=await (await open()).json();
 assert.equal(first.mode,'group');assert.equal(first.deadlineAt,second.deadlineAt);
 assert.equal(await letter.decryptLetter(second,parsed.key,parsed.id),'여러 명 링크 복사 시험');
});
test('1회 시간제한 기본 체크에서 보내기를 눌러야 편지를 만들고 공유창을 연다',async()=>{
 const a=app(),e=a.elements;
 await e.goCompose.fire('click');e.message.value='한 명 보내기 시험';await e.message.fire('input');
 assert.equal(e.chooseSingle.checked,true);assert.equal(a.requests.length,0);await e.send.fire('click');
 assert.equal(e.send.textContent,'보내기');assert.equal(e.message.value,'');assert.equal(a.shares.length,1);assert.equal(a.copies.length,0);
 const create=a.requests.find(r=>r.url.endsWith('/create'));assert.equal(create.payload.mode,'single');
 assert.equal(a.sqlite.prepare('SELECT mode FROM letters_v10 WHERE id=?').get(create.payload.id).mode,'single');
});
test('앱 이어 열기는 작성 화면에서 체크 항목과 보내기를 제공한다',()=>{
 const a=app();a.appEvents.appUrlOpen({url:'secretletter://compose'});
 assert.equal(a.elements.compose.classList.contains('hidden'),false);assert.equal(a.elements.audienceDialog,undefined);assert.equal(a.elements.chooseSingle.checked,true);assert.equal(a.requests.length,0);
});
test('열람 방식을 체크하는 것만으로 공유하지 않고 글을 보존한다',async()=>{
 const a=app(),e=a.elements;await e.goCompose.fire('click');
 e.message.value='아직 보내지 않은 글';await e.message.fire('input');e.chooseGroup.checked=true;await e.chooseGroup.fire('change');
 assert.equal(e.chooseSingle.checked,false);assert.equal(e.message.value,'아직 보내지 않은 글');assert.equal(a.requests.length,0);assert.equal(a.shares.length,0);
});
test('자기가 보낸 링크를 앱으로 열거나 붙여넣어도 수신자의 1회를 쓰지 않는다',async()=>{
 const a=app(),e=a.elements;e.message.value='아이폰 친구에게 보낼 편지';await e.send.fire('click');
 const url=a.shares[0].url,parsed=letter.parseIncomingLink(url,'https://secret-letter-mobile-v10.wjsdbswn.workers.dev/');
 await a.appEvents.appUrlOpen({url});assert.equal(e.senderPlain.textContent,'아이폰 친구에게 보낼 편지');
 await e.senderClose.fire('click');e.pasteLink.value=url;await e.pasteLink.fire('input');await e.open.fire('click');
 assert.equal(e.senderPlain.textContent,'아이폰 친구에게 보낼 편지');assert.equal(a.requests.some(r=>r.url.endsWith('/open')),false);
 const response=await worker.fetch(new Request('https://test.example/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:parsed.id})}),{DB:a.DB});
 assert.equal(response.status,200);assert.equal(await letter.decryptLetter(await response.json(),parsed.key,parsed.id),'아이폰 친구에게 보낼 편지');
});
test('공유 성공 후 추가 클릭 없이 빈 작성 화면으로 돌아가고 이전 편지도 보존한다',async()=>{
 const a=app(),e=a.elements;e.message.value='첫 편지';e.minutes.value='2';await e.send.fire('click');const first=a.shares[0].url;
 assert.equal(e.newLetter,undefined);assert.equal(e.send.textContent,'보내기');
 assert.equal(e.message.value,'');assert.equal(e.count.textContent,'0 / 1600자');assert.equal(e.minutes.value,'2');assert.equal(e.compose.classList.contains('hidden'),false);
 assert.equal(e.shareLink.value,first);assert.equal(e.senderPreviewButton.classList.contains('hidden'),false);assert.equal(e.sendState.textContent,'');await e.send.fire('click');
 assert.equal(e.send.textContent,'보내기');assert.equal(a.shares.length,1);
 e.message.value='두 번째 편지';await e.message.fire('input');await e.send.fire('click');assert.notEqual(a.shares[1].url,first);assert.equal(e.message.value,'');
 assert.equal(a.sqlite.prepare('SELECT COUNT(*) AS n FROM letters_v10').get().n,2);
});
test('공유 취소·실패 때는 보내기 버튼과 글·같은 링크를 유지한다',async()=>{
 for(const shareFailure of [{name:'AbortError'},{name:'NotAllowedError'}]){
  const a=app({shareFailure}),e=a.elements;e.message.value='취소해도 남는 글';await e.send.fire('click');
  assert.equal(e.send.textContent,'보내기');assert.equal(e.message.value,'취소해도 남는 글');await e.send.fire('click');
  assert.equal(a.shares[0].url,a.shares[1].url);assert.equal(a.requests.filter(r=>r.url.endsWith('/create')).length,1);
 }
});
test('앱 열람 중 신고 버튼을 표시하고 신고할 때만 서버에 20일 보관한다',async()=>{
 const sender=app();sender.elements.message.value='신고 보관 시험';await sender.elements.send.fire('click');
 const reader=app({db:sender.sqlite}),e=reader.elements;await reader.appEvents.appUrlOpen({url:sender.shares[0].url});await e.open.fire('click');
 assert.equal(e.reportPanel.classList.contains('hidden'),false);assert.equal(e.report.disabled,false);
 assert.equal(reader.sqlite.prepare('SELECT COUNT(*) AS n FROM reports_v10').get().n,0);
 assert.equal(reader.requests.some(r=>r.url.endsWith('/report')),false);await e.report.fire('click');
 assert.equal(e.report.disabled,true);assert.match(e.reportState.textContent,/서버에만 20일간 보관/);
 const saved=reader.sqlite.prepare('SELECT * FROM reports_v10').get();assert.equal(saved.delete_after_ms-saved.reported_at_ms,20*86400000);
 await e.close.fire('click');assert.equal(e.reportPanel.classList.contains('hidden'),true);assert.equal(e.plain.textContent,'');
 await e.report.fire('click');assert.equal(reader.requests.filter(r=>r.url.endsWith('/report')).length,1);
});
