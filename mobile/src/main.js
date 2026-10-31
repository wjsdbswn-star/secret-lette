import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Share} from '@capacitor/share';
import {Clipboard} from '@capacitor/clipboard';
import {encryptLetter,decryptLetter,buildShareLink,parseIncomingLink,MAX_SECONDS} from './letter.js';
import './style.css';
import {rememberSent,lookupSent,forgetSent,parseSentDeepLink} from './sent-preview.js';

const $=id=>document.getElementById(id);
// 고정 웹 도메인으로 교체하면 모든 앱이 동일한 URL 형식을 사용합니다.
const DEFAULT_WEB=import.meta.env.VITE_WEB_BASE || 'https://secret-letter-mobile-v10.wjsdbswn.workers.dev/';
const DEFAULT_API=import.meta.env.VITE_API_BASE || 'https://secret-letter-mobile-v10.wjsdbswn.workers.dev';
const KEY='secretletter-v10-api', WEB_KEY='secretletter-v10-web';
let mode='single',prepared=null,preparedId=null,incoming=null,watch=null,expiresAt=0,serverAt=0,startedAt=0;
const SERVICE_CONFIG_URL='https://raw.githubusercontent.com/wjsdbswn-star/secret-lette/main/server-config.json';
let serviceConfigPromise=null;
const native=Capacitor.isNativePlatform();

function status(id,txt,error=false){$(id).textContent=txt;$(id).classList.toggle('bad',error);}
function cleanApi(url) {
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error('HTTPS Worker 주소를 넣어 주세요.');
  return u.origin+u.pathname.replace(/\/$/,'');
}
function api(){try{return cleanApi(localStorage.getItem(KEY)||DEFAULT_API);}catch{return '';}}
function cleanWeb(url){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('HTTPS 안내 페이지 주소를 넣어 주세요.');
  if(u.hostname.includes('secret-letter-web-wjsdbswn'))throw Error('9차 웹 시제품 주소는 사용할 수 없습니다. v10 전용 안내 주소를 사용하세요.');
  return u.origin+'/';
}
function webBase(){try{return cleanWeb(localStorage.getItem(WEB_KEY)||DEFAULT_WEB);}catch{return '';}}
// 서버가 배포되면 GitHub Pages의 공개 설정 파일에서 주소를 안전하게 자동 연결합니다.
// 비밀키나 편지 내용은 설정 파일에 저장하지 않습니다.
async function loadServiceConfig(){
  if(api()&&webBase())return;
  try {
    const r=await fetch(SERVICE_CONFIG_URL,{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!r.ok)return;
    const o=await r.json();
    if(!o?.apiBase||!o?.webBase)return;
    const a=cleanApi(o.apiBase),w=cleanWeb(o.webBase);
    if(a!==w.replace(/\/$/,''))return; // 안내 페이지와 API는 같은 공식 Worker에서 제공
    const check=await fetch(a+'/v10/health',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    const j=await check.json();
    if(!check.ok||j.service!=='secret-letter-v10'||j.ok!==true)return;
    localStorage.setItem(KEY,a);localStorage.setItem(WEB_KEY,w);
    $('apiInput').value=a;$('webInput').value=w;
    status('setupState','✓ Cloudflare 서버가 자동으로 연결됐습니다.');
  }catch {
    // 네트워크가 없어도 오프라인 암호화 시험은 계속 이용할 수 있습니다.
  }
}
function ensureServiceConfig(){
  if(!serviceConfigPromise)serviceConfigPromise=loadServiceConfig();
  return serviceConfigPromise;
}

async function request(endpoint,payload=null) {
  const root=api();if(!root)throw Error('서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),12000);
  try {
    const response=await fetch(root+'/v10/'+endpoint,{method:payload?'POST':'GET',
      headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,
      cache:'no-store',signal:ctl.signal});
    const data=await response.json();
    if(!response.ok)throw Error(data.error||`서버 오류: ${response.status}`);
    return data;
  }catch(e){if(e.name==='AbortError')throw Error('서버 연결 시간이 초과되었습니다.');throw e;}
  finally{clearTimeout(timer);}
}
function page(name){
  if(name!=='reader' && watch)stopReading(true);
  if(name!=='sender'){$('senderPlain').textContent='';$('sender').dataset.id='';}
  $('home').classList.toggle('hidden',name!=='home');
  $('homeButton').classList.toggle('hidden',name==='home');
  document.body.classList.toggle('is-home',name==='home');
  $('compose').classList.toggle('hidden',name!=='compose');$('reader').classList.toggle('hidden',name!=='reader');$('sender').classList.toggle('hidden',name!=='sender');
  $('goCompose').classList.toggle('on',name==='compose');$('goReader').classList.toggle('on',name==='reader');
}
function timeSeconds(){return ['days','hours','minutes','seconds'].reduce((v,id,i)=>v+Number($(id).value)*[86400,3600,60,1][i],0);}
function setupTimes(){for(const [id,max] of [['days',30],['hours',23],['minutes',59],['seconds',59]]){
  for(let n=0;n<=max;n++){const o=document.createElement('option');o.value=n;o.textContent=String(n).padStart(2,'0');$(id).append(o);}
} $('minutes').value='1';}
function updateOptionsLabel(){
 const total=timeSeconds();let left=total;
 const parts=[];
 for(const [unit,size] of [['일',86400],['시간',3600],['분',60],['초',1]]){
  const value=Math.floor(left/size);left%=size;if(value)parts.push(value+unit);
 }
 $('optionsLabel').textContent=parts.join(' ')||'0초';
 $('send').textContent='보내기';
}
function clearReady(){updateOptionsLabel();prepared=null;preparedId=null;$('ready').classList.add('hidden');$('shareLink').value='';$('senderPreviewButton').classList.add('hidden');}
$('newLetter').addEventListener('click',()=>{
 if($('send').disabled)return;
 $('message').value='';$('count').textContent='0 / 1600자';clearReady();status('sendState','');
 $('newLetter').classList.add('hidden');page('compose');$('message').focus();
});
$('message').addEventListener('input',()=>{$('count').textContent=$('message').value.length+' / 1600자';clearReady();});
for(const id of ['days','hours','minutes','seconds'])$(id).addEventListener('change',clearReady);
function setMode(next){
 const changed=mode!==next;mode=next;
 $('chooseSingle').checked=next==='single';$('chooseGroup').checked=next==='group';
 if(changed)clearReady();else updateOptionsLabel();
}
for(const el of document.querySelectorAll('[data-send-mode]'))el.addEventListener('change',()=>{
 if($('send').disabled||!el.checked)return;
 setMode(el.dataset.sendMode);
});
async function copyPrepared(){
 if(!prepared)return;
 try{
  if(native)await Clipboard.write({string:prepared});else await navigator.clipboard.writeText(prepared);
  $('ready').classList.add('hidden');
  status('sendState','링크를 복사했습니다.');
 }catch{
  $('ready').classList.remove('hidden');$('shareLink').focus();$('shareLink').select();
  status('sendState','복사하지 못했습니다. 아래 링크를 길게 눌러 복사해 주세요.',true);
 }
}
async function sharePrepared(){
  if(!prepared){status('sendState','비밀편지 내용을 먼저 입력해 주세요.',true);return;}
  try{
    if(native)await Share.share({title:'비밀편지',text:'✉️ 비밀편지가 도착했어요.\n앱 설치 없이 웹에서 읽어보세요.',url:prepared,dialogTitle:'비밀편지 보내기'});
    else if(navigator.share)await navigator.share({title:'비밀편지',text:'✉️ 비밀편지가 도착했어요.\n앱 설치 없이 웹에서 읽어보세요.',url:prepared});
    else throw Error('공유 메뉴를 사용할 수 없습니다.');
    $('ready').classList.add('hidden');
    status('sendState','공유 화면을 닫았습니다. 실제로 전송했는지 확인해 주세요.');
  }catch(e){
    if(e?.name==='AbortError'){
      $('ready').classList.add('hidden');
      status('sendState','공유를 취소했습니다. 보내기 버튼을 다시 누르면 같은 링크로 보낼 수 있습니다.');
    }else{
      $('ready').classList.remove('hidden');
      status('sendState','공유창을 열지 못했습니다. 아래 「링크 복사」를 사용하거나 보내기를 다시 눌러 주세요.',true);
    }
  }
}
async function sendSelected(){
  const btn=$('send');
  if(btn.disabled)return;
  btn.disabled=true;
  for(const id of ['message','days','hours','minutes','seconds','chooseSingle','chooseGroup'])$(id).disabled=true;
  try{
    // 두 번째 보내기를 누를 때 새 편지를 중복 생성하지 않고 기존 링크를 다시 공유합니다.
    if(prepared){await sharePrepared();return;}
    if(!api()||!webBase())await ensureServiceConfig();
    if(!api()||!webBase())throw Error('인터넷 연결 또는 비밀편지 서버를 확인해 주세요.');
    const sec=timeSeconds();
    if(sec<1||sec>MAX_SECONDS)throw Error('1초 이상 30일 23시간 59분 59초 이하로 설정해 주세요.');
    status('sendState','비밀편지를 준비하는 중입니다…');
    const data=await encryptLetter($('message').value.trim(),mode,sec);
    await request('create',{id:data.id,mode:data.mode,seconds:data.seconds,iv:data.iv,ciphertext:data.ciphertext});
    prepared=buildShareLink(webBase(),data.id,data.key);
    preparedId=data.id;
    $('newLetter').classList.remove('hidden');
    // 기기 안에 암호문과 키를 15분간 임시 저장합니다. 서버에 평문/키를 보내지 않습니다.
    try{rememberSent(data);$('senderPreviewButton').classList.remove('hidden');}
    catch{status('sendState','공유는 가능하지만 이 기기의 미리보기 저장은 사용할 수 없습니다.',true);}
    $('shareLink').value=prepared;
    status('sendState','보낼 앱을 선택해 주세요.');
    await sharePrepared();
  }catch(e){status('sendState','보내기 실패: '+e.message,true);}
  finally{btn.disabled=false;for(const id of ['message','days','hours','minutes','seconds','chooseSingle','chooseGroup'])$(id).disabled=false;}
}
$('send').addEventListener('click',async()=>{
 if(!$('message').value.trim()){status('sendState','편지 내용을 입력해 주세요.',true);$('message').focus();return;}
 const sec=timeSeconds();
 if(sec<1||sec>MAX_SECONDS){status('sendState','읽는 시간을 1초 이상 설정해 주세요.',true);return;}
 await sendSelected();
});
$('copy').addEventListener('click',copyPrepared);
// 발신자 앱에서만 원본 암호문+키를 확인하며 수신용 /v10/open은 호출하지 않습니다.
async function showSentPreview(id){
  page('compose');
  let saved;
  try{saved=lookupSent(id);}catch{}
  if(!saved){status('sendState','이 기기에 확인 가능한 보낸 편지가 없습니다. 발송 후 15분이 지났거나 다른 기기입니다.',true);return;}
  try{
    const state=await request('status',{id});
    if(state.available!==true){forgetSent(id);throw Error('받는 사람이 이미 읽었거나 편지가 만료되었습니다.');}
    const text=await decryptLetter({mode:saved.mode,durationSeconds:saved.seconds,iv:saved.iv,ciphertext:saved.ciphertext},saved.key,saved.id);
    $('senderPlain').textContent=text;
    $('sender').dataset.id=id;
    page('sender');
  }catch(e){status('sendState','보낸 편지 확인 불가: '+e.message,true);}
}
function closeSentPreview(){
  $('senderPlain').textContent='';
  $('sender').dataset.id='';
  page('compose');
}
$('senderPreviewButton').addEventListener('click',()=>{if(preparedId)showSentPreview(preparedId);});
$('senderClose').addEventListener('click',closeSentPreview);
$('senderDelete').addEventListener('click',()=>{const id=$('sender').dataset.id;if(id)forgetSent(id);closeSentPreview();$('senderPreviewButton').classList.add('hidden');status('sendState','내 기기에 보관된 임시 확인 기록을 삭제했습니다.');});
$('apiInput').value=api();
$('webInput').value=webBase();
$('apiSave').addEventListener('click',async()=>{
  $('apiSave').disabled=true;status('setupState','서버를 확인하고 있습니다…');
  try{const url=cleanApi($('apiInput').value.trim());
    const shareBase=cleanWeb($('webInput').value.trim());
    const c=new AbortController(), t=setTimeout(()=>c.abort(),8000);
    let r;try{r=await fetch(url+'/v10/health',{signal:c.signal,cache:'no-store'});}finally{clearTimeout(t);}
    const j=await r.json();if(!r.ok||j.service!=='secret-letter-v10')throw Error('v10 Worker가 아니거나 데이터베이스가 준비되지 않았습니다.');
    localStorage.setItem(KEY,url);localStorage.setItem(WEB_KEY,shareBase);clearReady();status('setupState','✓ 서버 연결이 확인되었습니다.');
  }catch(e){status('setupState','연결 실패: '+e.message,true);}finally{$('apiSave').disabled=false;}
});
function stopReading(showClosed=true){
  if(watch){clearInterval(watch);watch=null;}
  $('plain').textContent='';$('during').classList.add('hidden');
  if(showClosed){$('before').classList.add('hidden');$('after').classList.remove('hidden');}
}
function tick(){if(!watch)return;const left=Math.max(0,expiresAt-serverAt-(performance.now()-startedAt));
  if(left<=0){stopReading();return;}
  let n=Math.ceil(left/1000),d=Math.floor(n/86400);n%=86400;const h=Math.floor(n/3600);n%=3600;
  const m=Math.floor(n/60),s=n%60;const pad=v=>String(v).padStart(2,'0');
  $('timer').textContent=(d?pad(d)+':':'')+pad(h)+':'+pad(m)+':'+pad(s);
  $('meterFill').style.width=(100*Math.min(1,left/(Number($('during').dataset.seconds)*1000)))+'%';
}
async function receiveLink(url){
  // 잘못된 새 링크를 받은 경우 이전 편지를 잘못 열지 않도록 기존 열람 대기를 먼저 폐기합니다.
  incoming=null; $('open').disabled=true;
  stopReading(false);
  $('before').classList.remove('hidden');$('after').classList.add('hidden');
  try{
    const parsed=parseIncomingLink(url,webBase());
    if(lookupSent(parsed.id))return showSentPreview(parsed.id);
    incoming=parsed;
    $('open').disabled=false;
    $('readerHint').textContent='열람 버튼을 누르면 소멸시간이 시작되거나 남은 시간이 적용됩니다.';
    status('readerState','받은 비밀편지입니다. 열 준비가 되면 버튼을 누르세요.');page('reader');
  }catch(e){status('readerState','링크 확인 실패: '+e.message,true);page('reader');}
}
$('open').addEventListener('click',async()=>{
  if(!incoming)return;
  if(lookupSent(incoming.id)){const id=incoming.id;incoming=null;return showSentPreview(id);}
  $('open').disabled=true;status('readerState','비밀편지를 여는 중입니다…');
  try {
    const requestedAt=performance.now();
    const result=await request('open',{id:incoming.id});
    const content=await decryptLetter(result,incoming.key,incoming.id);
    // 기기 시계 대신 서버가 전해 준 시간과 단조 시계를 사용합니다.
    // 서버까지의 왕복시간을 전체 경과시간으로 잡아 기기 시계 조작이나 느린 통신으로 표시시간이 연장되지 않도록 합니다.
    if(result.deadlineAt<=result.serverNow+(performance.now()-requestedAt))throw Error('편지를 읽을 시간이 지났습니다.');
    $('plain').textContent=content;
    $('during').dataset.seconds=result.durationSeconds;
    $('before').classList.add('hidden');$('after').classList.add('hidden');$('during').classList.remove('hidden');
    expiresAt=result.deadlineAt;serverAt=result.serverNow;startedAt=requestedAt;
    watch=setInterval(tick,150);tick();status('readerState','');
    incoming=null; // 앱에서 열람 후 링크를 보관하지 않음
  }catch(e){status('readerState','열 수 없습니다: '+e.message,true);stopReading();}
  finally{$('open').disabled=false;}
});
$('close').addEventListener('click',()=>stopReading());
$('reply').addEventListener('click',()=>page('compose'));
$('homeButton').addEventListener('click',()=>page('home'));
$('goCompose').addEventListener('click',()=>{page('compose');$('message').focus();});
$('goReader').addEventListener('click',()=>{page('reader');$('pasteLink').focus();});
$('pasteLink').addEventListener('input',()=>{
 incoming=null;$('open').disabled=true;
 try{incoming=parseIncomingLink($('pasteLink').value.trim(),webBase());$('open').disabled=false;status('readerState','');}catch{}
});
$('checkLink').addEventListener('click',()=>{
  const raw=$('pasteLink').value.trim();
  if(!raw){status('readerState','카카오톡에서 복사한 비밀편지 링크를 붙여넣으세요.',true);return;}
  receiveLink(raw);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(watch)stopReading();if(!$('sender').classList.contains('hidden'))closeSentPreview();}});
window.addEventListener('pagehide',()=>{if(watch)stopReading();if(!$('sender').classList.contains('hidden'))closeSentPreview();});

$('offlineDemo').addEventListener('click',async()=>{
  const button=$('offlineDemo');button.disabled=true;
  status('offlineState','이 휴대전화에서 암호화·복호화 확인 중…');
  try{
    const sample='안녕하세요! 비밀편지 암호화 테스트입니다. 🔒';
    const d=await encryptLetter(sample,'single',30);
    const restored=await decryptLetter({mode:d.mode,durationSeconds:d.seconds,iv:d.iv,ciphertext:d.ciphertext},d.key,d.id);
    if(restored!==sample)throw Error('암호화 결과가 일치하지 않습니다.');
    status('offlineState','✓ 테스트 성공! 이 기기에서 한글·이모지 편지를 암호화하고 다시 복호화했습니다. 실제 공유에는 Cloudflare 서버 연결이 필요합니다.');
  }catch(e){status('offlineState','오프라인 암호화 시험 실패: '+e.message,true);}
  finally{button.disabled=false;}
});
setupTimes();updateOptionsLabel();page('home');
ensureServiceConfig();
// App Links / Universal Links / custom scheme (네이티브 설정은 README 참고).
if(native){
  // WebView visibilitychange만으로는 모든 기기의 앱 전환을 감지하지 못할 수 있습니다.
  // 네이티브 백그라운드 전환에서도 편지 화면을 즉시 닫습니다.
  App.addListener('appStateChange',({isActive})=>{if(!isActive){if(watch)stopReading();if(!$('sender').classList.contains('hidden'))closeSentPreview();}});
  const incomingUrl=url=>{const compose=String(url).match(/^secretletter:\/\/compose(?:\/(single|group))?\/?$/);if(compose){if(compose[1])setMode(compose[1]);page('compose');return;}const senderId=parseSentDeepLink(url);if(senderId)return showSentPreview(senderId);return receiveLink(url);};
  App.addListener('appUrlOpen',e=>{if(e?.url)return incomingUrl(e.url);});
  App.getLaunchUrl().then(x=>{if(x?.url)incomingUrl(x.url);}).catch(()=>{});
}
// 브라우저에서는 개발 서버에서만 기능 시험. 공개된 웹 수신 페이지에는 이 코드를 배포하지 않습니다.

