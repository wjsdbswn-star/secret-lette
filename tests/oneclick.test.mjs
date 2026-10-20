import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/src/index.js';

function freshD1(){
  const sqlite=new DatabaseSync(':memory:');
  return {sqlite,DB:{prepare(sql){
    const stmt=sqlite.prepare(sql);
    return {bind(...v){return {
      async run(){return stmt.run(...v);},
      async all(){return {results:stmt.all(...v)};},
      async first(){return stmt.get(...v)||null;},
    }}};
  }}};
}
test('원클릭 배포 후 비어 있는 D1 테이블 자동 생성',async()=>{
  const {sqlite,DB}=freshD1();
  const r=await worker.fetch(new Request('https://sample.workers.dev/v10/health'),{DB});
  assert.equal(r.status,200);
  assert.equal((await r.json()).service,'secret-letter-v10');
  assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='letters_v10'").get().name,'letters_v10');
});
test('Worker는 앱 설치 안내를 제공하되 편지를 해독하지 않는다',async()=>{
  const id='a'.repeat(24);
  const response=await worker.fetch(new Request('https://sample.workers.dev/l/'+id+'#k='+'b'.repeat(43)),{});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/비밀편지가 도착했어요/);
  assert.match(html,/secretletter:\/\/open\//);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const elements={open:{disabled:true},copy:{disabled:true},notice:{textContent:''}};
  const location={pathname:'/l/'+id,hash:'#k='+'b'.repeat(43),href:''};
  vm.runInNewContext(script,{location,URLSearchParams,document:{getElementById(x){return elements[x]}}});
  assert.equal(elements.open.disabled,false);
  elements.open.onclick();
  assert.equal(location.href,'secretletter://open/'+id+'#k='+'b'.repeat(43));
  assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
});
