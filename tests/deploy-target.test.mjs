import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveExistingWorker} from '../scripts/update_worker_v10.mjs';
const account='1'.repeat(32),other='2'.repeat(32);
const database='11111111-2222-3333-4444-555555555555';
const settings={bindings:[{type:'d1',name:'DB',id:database}]};
function api(routes){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  assert.equal(init.method,'GET');
  assert.equal(init.redirect,'error');
  const p=url.replace('https://api.cloudflare.com/client/v4','');calls.push(p);
  const found=routes[p];
  if(!found)return Response.json({success:false},{status:404});
  return Response.json({success:true,result:found});
 };
 return {fetchImpl,calls};
}
test('계정 ID 없이 토큰으로 기존 Worker와 연결된 D1만 찾는다',async()=>{
 const mock=api({'/accounts?per_page=50&page=1':[{id:account}],['/accounts/'+account+'/workers/scripts/secret-letter-mobile-v10/settings']:settings});
 assert.deepEqual(await resolveExistingWorker({token:'test-token',fetchImpl:mock.fetchImpl}),{accountId:account,databaseId:database});
 assert.equal(mock.calls.length,2);
});
test('같은 이름의 Worker가 여러 계정에 있으면 자동배포하지 않는다',async()=>{
 const mock=api({'/accounts?per_page=50&page=1':[{id:account},{id:other}],['/accounts/'+account+'/workers/scripts/secret-letter-mobile-v10/settings']:settings,['/accounts/'+other+'/workers/scripts/secret-letter-mobile-v10/settings']:settings});
 await assert.rejects(resolveExistingWorker({token:'test-token',fetchImpl:mock.fetchImpl}),/정확히 한 개/);
});
test('기존 Worker가 없거나 DB 연결이 없으면 신규 자원을 만들지 않는다',async()=>{
 const missing=api({'/accounts?per_page=50&page=1':[{id:account}]});
 await assert.rejects(resolveExistingWorker({token:'test-token',fetchImpl:missing.fetchImpl}),/신규 자원을 만들지 않고/);
 const noDB=api({['/accounts/'+account+'/workers/scripts/secret-letter-mobile-v10/settings']:{bindings:[]}});
 await assert.rejects(resolveExistingWorker({token:'test-token',accountId:account,fetchImpl:noDB.fetchImpl}),/DB 연결/);
});
test('추가 저장소 연결이 있으면 지우지 않고 배포를 중단한다',async()=>{
 const mock=api({['/accounts/'+account+'/workers/scripts/secret-letter-mobile-v10/settings']:{bindings:[...settings.bindings,{type:'r2_bucket',name:'PRIVATE_BLOBS',bucket_name:'existing'}]}});
 await assert.rejects(resolveExistingWorker({token:'test-token',accountId:account,fetchImpl:mock.fetchImpl}),/추가 저장소 바인딩/);
});
test('잘못된 계정 ID와 인증 실패에서 배포를 진행하지 않는다',async()=>{
 await assert.rejects(resolveExistingWorker({token:'test-token',accountId:'bad',fetchImpl:()=>{throw Error('must not request');}}),/계정 ID 형식/);
 await assert.rejects(resolveExistingWorker({token:'test-token',fetchImpl:async()=>Response.json({success:false},{status:401})}),/HTTP 401/);
});
