import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {landingResponse} from '../worker/src/landing.js';

async function screen(pathname='/',hash='',userAgent='Android'){
 const html=await landingResponse().text();
 const elements={};
 for(const m of html.split('<script>')[0].matchAll(/<[a-z][^>]*\bid="([^"]+)"[^>]*>/g)){
  const attrs=m[0],id=m[1],classes=new Set((attrs.match(/class="([^"]*)"/)?.[1]||'').split(/\s+/));
  elements[id]={value:'',textContent:'',href:attrs.match(/href="([^"]*)"/)?.[1]||'',disabled:/\bdisabled\b/.test(attrs),open:false,
   addEventListener(){},showModal(){this.open=true},close(){this.open=false},focus(){this.focused=true},
   classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)}}};
 }
 const requests=[],navigations=[];
 const location={origin:'https://secret-letter-mobile-v10.wjsdbswn.workers.dev',pathname,hash,assign(url){navigations.push(url)}};
 const document={getElementById:id=>elements[id],addEventListener(){},hidden:false};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
  document,location,URL,URLSearchParams,navigator:{userAgent},window:{addEventListener(){}},
  history:{replaceState(){}},crypto:webcrypto,performance,Uint8Array,TextEncoder,TextDecoder,atob,
  setInterval(){return 1},clearInterval(){},confirm(){return false},
  fetch:async(...args)=>{requests.push(args);throw Error('unexpected request')},
 });
 return {elements,requests,navigations,location};
}
test('웹 보내기는 작성 앱 설치를 안내하며 대상은 먼저 묻지 않는다',async()=>{
 const {elements:e,requests,navigations}=await screen();
 assert.equal(e.open.disabled,false);assert.equal(e.linkPanel.classList.contains('hidden'),true);
 e.send.onclick();assert.equal(e.installDialog.open,true);
 assert.equal(e.openApp.href,'secretletter://compose');
 assert.match(e.installConfirm.href,/^https:\/\/github\.com\/wjsdbswn-star\/secret-lette\/releases\/latest\/download\/secret-letter\.apk$/);
 assert.equal(requests.length,0);assert.equal(navigations.length,0);
 e.installCancel.onclick();assert.equal(e.installDialog.open,false);
});
test('열기는 링크 입력창을 열고, 확인 뒤에도 편지 내용은 미리 요청하지 않는다',async()=>{
 const {elements:e,requests,navigations,location}=await screen();
 e.open.onclick();assert.equal(e.linkPanel.classList.contains('hidden'),false);assert.equal(e.linkInput.focused,true);
 const link=location.origin+'/l/'+'A'.repeat(24)+'#k='+'B'.repeat(43);
 e.linkInput.value=link;e.linkForm.onsubmit({preventDefault(){}});
 assert.deepEqual(navigations,[link]);assert.equal(requests.length,0);
});
test('다른 사이트나 잘못된 편지 링크로 이동하지 않는다',async()=>{
 const {elements:e,navigations}=await screen();
 for(const link of ['https://evil.example/l/'+'A'.repeat(24)+'#k='+'B'.repeat(43),'javascript:alert(1)','https://secret-letter-mobile-v10.wjsdbswn.workers.dev/l/bad']){
  e.linkInput.value=link;e.linkForm.onsubmit({preventDefault(){}});
 }
 assert.equal(navigations.length,0);assert.match(e.notice.textContent,/다시 확인/);
});
test('받은 편지 화면도 버튼을 누르기 전에는 열람을 소모하지 않는다',async()=>{
 const {elements:e,requests}=await screen('/l/'+'A'.repeat(24),'#k='+'B'.repeat(43));
 assert.equal(e.open.disabled,false);assert.match(e.senderJump.href,/^secretletter:\/\/sent\//);
 e.send.onclick();e.installCancel.onclick();assert.equal(e.installDialog.open,false);assert.equal(requests.length,0);
});
test('아이폰에서는 안드로이드 설치파일을 내려받지 않는다',async()=>{
 const {elements:e}=await screen('/','','iPhone');let prevented=false;
 e.send.onclick();e.installConfirm.onclick({preventDefault(){prevented=true}});
 assert.equal(prevented,true);assert.equal(e.installDialog.open,false);assert.match(e.notice.textContent,/아이폰 앱은 준비 중/);
});
