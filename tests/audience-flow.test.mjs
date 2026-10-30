import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/src/index.js';
import * as letter from '../mobile/src/letter.js';
import * as sent from '../mobile/src/sent-preview.js';

function app(){
 const html=readFileSync(new URL('../mobile/index.html',import.meta.url),'utf8');
 const source=readFileSync(new URL('../mobile/src/main.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.env','({})');
 const elements={},all=[],shares=[],copies=[],requests=[],appEvents={};
 const sqlite=new DatabaseSync(':memory:');
 const DB={prepare(sql){const q=sqlite.prepare(sql);return {bind(...v){return {async run(){return q.run(...v)},async first(){return q.get(...v)||null},async all(){return {results:q.all(...v)}}}}}}};
 const saved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 function element(attrs=''){
  const classes=new Set((attrs.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/));
  const listeners={},dataset={};
  for(const m of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g))dataset[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=m[2];
  return {dataset,value:'',textContent:'',disabled:/\bdisabled\b/.test(attrs),open:false,style:{},
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
  Share:{share:async value=>{shares.push(value)}},Clipboard:{write:async value=>{copies.push(value.string)}},
  ...letter,rememberSent:value=>sent.rememberSent(value,storage),lookupSent:id=>sent.lookupSent(id,storage),forgetSent:id=>sent.forgetSent(id,storage),parseSentDeepLink:sent.parseSentDeepLink,
  URL,URLSearchParams,AbortController,AbortSignal,TextEncoder,TextDecoder,Uint8Array,performance,
  setTimeout,clearTimeout,setInterval,clearInterval,console,window:{addEventListener(){}},navigator:{},
  fetch:async(url,options)=>{
   requests.push({url,payload:options.body&&JSON.parse(options.body)});
   return worker.fetch(new Request(url,options),{DB});
  },
 });
 return {elements,shares,copies,requests,appEvents,sqlite,DB};
}
test('작성 후 시간만 제한을 선택하면 다른 앱의 공유창을 열고 재시도에 같은 링크를 쓴다',async()=>{
 const a=app(),e=a.elements;
 await e.goCompose.fire('click');assert.equal(e.audienceDialog.open,false);assert.equal(e.compose.classList.contains('hidden'),false);
 e.message.value='여러 명 링크 복사 시험';await e.message.fire('input');await e.send.fire('click');
 assert.equal(e.audienceDialog.open,true);assert.equal(a.requests.length,0);
 await e.chooseGroup.fire('click');assert.equal(e.audienceDialog.open,false);
 assert.equal(a.shares.length,1);assert.equal(a.copies.length,0);
 assert.equal(a.requests.filter(r=>r.url.endsWith('/create'))[0].payload.mode,'group');
 await e.send.fire('click');await e.chooseGroup.fire('click');
 assert.equal(a.shares.length,2);assert.equal(a.shares[0].url,a.shares[1].url);assert.equal(a.copies.length,0);
 assert.equal(a.requests.filter(r=>r.url.endsWith('/create')).length,1);
 const parsed=letter.parseIncomingLink(a.shares[0].url,'https://secret-letter-mobile-v10.wjsdbswn.workers.dev/');
 const open=()=>worker.fetch(new Request('https://test.example/v10/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:parsed.id})}),{DB:a.DB});
 const first=await (await open()).json(),second=await (await open()).json();
 assert.equal(first.mode,'group');assert.equal(first.deadlineAt,second.deadlineAt);
 assert.equal(await letter.decryptLetter(second,parsed.key,parsed.id),'여러 명 링크 복사 시험');
});
test('1회 시간제한을 선택하면 1회 열람 편지를 만들고 공유창을 연다',async()=>{
 const a=app(),e=a.elements;
 await e.goCompose.fire('click');e.message.value='한 명 보내기 시험';await e.message.fire('input');
 await e.send.fire('click');assert.equal(a.requests.length,0);await e.chooseSingle.fire('click');
 assert.equal(e.send.textContent,'보내기');assert.equal(a.shares.length,1);assert.equal(a.copies.length,0);
 const create=a.requests.find(r=>r.url.endsWith('/create'));assert.equal(create.payload.mode,'single');
 assert.equal(a.sqlite.prepare('SELECT mode FROM letters_v10 WHERE id=?').get(create.payload.id).mode,'single');
});
test('앱 이어 열기는 작성 화면으로 이동하며, 최종 보내기 전에는 대상을 묻지 않는다',()=>{
 const a=app();a.appEvents.appUrlOpen({url:'secretletter://compose'});
 assert.equal(a.elements.compose.classList.contains('hidden'),false);assert.equal(a.elements.audienceDialog.open,false);assert.equal(a.requests.length,0);
});
test('대상 선택을 닫으면 글을 보존하며 서버에 편지를 만들지 않는다',async()=>{
 const a=app(),e=a.elements;await e.goCompose.fire('click');
 e.message.value='아직 보내지 않은 글';await e.message.fire('input');await e.send.fire('click');await e.audienceCancel.fire('click');
 assert.equal(e.audienceDialog.open,false);assert.equal(e.message.value,'아직 보내지 않은 글');assert.equal(a.requests.length,0);
});
