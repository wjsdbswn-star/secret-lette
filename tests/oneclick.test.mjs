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
test('Worker는 앱 없이 브라우저에서 편지를 읽도록 제공한다',async()=>{
  const id='a'.repeat(24);
  const response=await worker.fetch(new Request('https://sample.workers.dev/l/'+id+'#k='+'b'.repeat(43)),{});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/비밀편지가 도착했어요/);
  assert.match(html,/앱 설치 없이 웹에서 읽을 수 있습니다/);
  assert.match(html,/id="open"/);
  assert.match(html,/id="send"/);
  assert.match(html,/설치하겠습니다/);
  assert.match(html,/id="installDialog"/);
  assert.match(html,/location\.pathname\.startsWith\('\/s\/'\)\?'\/v11\/open':'\/v10\/open'/);
  assert.match(html,/crypto\.subtle\.decrypt/);
  assert.doesNotMatch(html,/secretletter:\/\/open/);
  assert.match(response.headers.get('Content-Security-Policy'),/connect-src 'self'/);
});

test('개인 편지 원문을 미리보기 메타데이터로 노출하지 않고 신고 UI를 제공합니다',async()=>{
 const id='a'.repeat(24);
 const response=await worker.fetch(new Request('https://sample.workers.dev/l/'+id),{});
 const html=await response.text();
 assert.match(html,/property="og:title"/);
 assert.match(html,/property="og:description"/);
 assert.match(html,/id="report"/);
 assert.match(html,/\/v10\/report/);
});
