// Online browser and Home Screen app. Only encrypted envelopes reach the API.
// No service worker caches letters, URLs, keys, or drafts.
export const WEB_APP_HEAD = `<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="비밀편지">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`;

const RADIO_STYLE = `.read-mode{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0;margin:0 0 14px;border:0;padding:0}.read-mode label{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px;color:#645674;cursor:pointer}.read-mode input[type=radio]{appearance:auto;accent-color:#7566dc;flex:none;width:18px;height:18px;min-height:0;margin:0;padding:0;border:0}`;

export const WEB_APP_STYLE = `
.compose-panel{text-align:left}.compose-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}.compose-heading h2{font-size:21px;font-weight:600;letter-spacing:-.7px;margin:0}.compose-heading button{min-height:44px;padding:8px 0;font-size:13px;color:#92899c;background:none;border:0}.compose-panel textarea{display:block;width:100%;min-height:250px;resize:vertical;border:1px solid #e7e5ed;border-radius:18px;padding:20px 18px;font:inherit;font-size:17px;line-height:1.8;color:#38313e;background:#fff;outline:none}.compose-panel textarea:focus{border-color:#aaa0e4;box-shadow:0 0 0 3px #7566dc0c}.compose-panel textarea::placeholder{color:#aaa5b2}.compose-count{text-align:right;margin:9px 2px 20px;color:#aaa5b2;font-size:12px}.time-options{margin:0 0 22px;border-bottom:1px solid #efedf4}.time-options summary{display:flex;justify-content:space-between;padding:8px 0 17px;list-style:none;cursor:pointer;color:#8c8396;font-size:13px}.time-options summary::-webkit-details-marker{display:none}.time-options summary span{color:#645674}.time-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:0 0 20px}.time-grid label{font-size:12px;color:#92899c;text-align:center}.time-grid select{width:100%;min-height:44px;margin-top:7px;border:1px solid #e7e5ed;border-radius:10px;padding:8px;background:#fff;color:#494451;font:inherit;font-size:16px}.compose-send{width:100%}.compose-state{font-size:13px;color:#8b7a99;white-space:pre-wrap;margin-top:18px}.compose-state:empty{display:none}.compose-panel .bad{color:#ad445d}.share-fallback{margin-top:18px}.share-fallback button{width:100%;min-height:48px;margin-top:10px}.share-fallback input{margin-top:12px;font-size:12px}.sender-preview{text-align:left}.sender-preview h2{font-size:19px;font-weight:500;margin:0 0 24px}.sender-preview .sender-plain{white-space:pre-wrap;overflow-wrap:anywhere;font-size:18px;line-height:1.9;min-height:140px;margin-bottom:22px}.sender-preview button{width:100%;margin-top:12px}.sender-preview .small{margin-top:16px}.web-audience .audience-choice{width:100%;margin-top:10px;min-height:54px;font-size:15px}.install-steps{text-align:left;line-height:1.9;font-size:14px;color:#645b70;padding:4px 0 14px}.install-steps ol{padding-left:22px;margin:0 0 15px}.install-steps p{font-size:12px;line-height:1.8;margin:0}.install-steps input{font-size:12px;margin-top:12px}#webInstallCopy{font-size:13px;min-height:44px;margin-top:12px;width:100%}#installSteps.hidden{display:none!important}body.composing main{display:block;padding-top:calc(20px + env(safe-area-inset-top));padding-bottom:calc(24px + env(safe-area-inset-bottom))}body.composing .shell{margin:0 auto}dialog .small{line-height:1.7}@media(max-width:360px){.compose-panel textarea{padding:16px 14px}.time-grid{gap:5px}}
${RADIO_STYLE}
`;

const select = (id, label, max, initial=0) => `<label for="${id}">${label}<select id="${id}">${Array.from({length:max+1},(_,n)=>`<option value="${n}"${n===initial?' selected':''}>${String(n).padStart(2,'0')}</option>`).join('')}</select></label>`;
export const WEB_APP_MARKUP = `<section id="webCompose" class="compose-panel hidden" aria-labelledby="composeTitle">
<div class="compose-heading"><h2 id="composeTitle">편지 쓰기</h2><button id="composeHome" type="button">처음으로</button></div>
<label class="sr-only" for="webMessage">편지 내용</label><textarea id="webMessage" maxlength="1600" placeholder="전하고 싶은 말을 써보세요." spellcheck="false" autocomplete="off" autocorrect="off"></textarea>
<p id="webCount" class="compose-count">0 / 1600자</p>
<fieldset id="webReadModes" class="read-mode"><legend class="sr-only">열람 방식</legend><label for="webSingle"><input id="webSingle" type="radio" name="webReadMode" value="single" checked>1회 시간제한</label><label for="webGroup"><input id="webGroup" type="radio" name="webReadMode" value="group">시간만 제한</label></fieldset>
<details class="time-options"><summary>읽는 시간 <span id="webDuration">1분</span></summary><div class="time-grid">${select('webDays','일',30)}${select('webHours','시간',23)}${select('webMinutes','분',59,1)}${select('webSeconds','초',59)}</div></details>
<button id="composeSend" class="primary compose-send" type="button">보내기</button>
<button id="webReshare" class="text-link hidden" type="button">같은 편지 다시 공유</button>
<p id="webSendState" class="compose-state" role="status" aria-live="polite"></p>
<div id="webReady" class="share-fallback hidden"><button id="webShare" class="primary" type="button">공유하기</button><button id="webCopy" class="secondary" type="button">링크 복사</button><label class="sr-only" for="webShareLink">보낼 편지 링크</label><input id="webShareLink" readonly autocomplete="off" spellcheck="false"></div>
<button id="webSenderButton" class="text-link hidden" type="button">보낸 편지 확인</button>
</section>
<section id="webSender" class="sender-preview hidden" aria-labelledby="webSenderTitle"><h2 id="webSenderTitle">보낸 편지 확인</h2><div id="webSenderPlain" class="sender-plain"></div><button id="webSenderClose" class="secondary" type="button">닫기</button><button id="webSenderForget" class="text-link" type="button">내 기기의 임시 기록 삭제</button><p class="small">수신자의 열람 횟수는 줄어들지 않습니다.<br>발송 후 15분 동안 이 웹앱에서 확인할 수 있습니다.</p><p id="webSenderState" class="compose-state" role="status"></p></section>
`;

// Inserted into the landing page's closure, after $, id, and secret are defined.
export const WEB_APP_SCRIPT = String.raw`
const webApp=(()=>{
 const nav=typeof navigator==='undefined'?(window.navigator||{}):navigator;
 const installed=Boolean(window.matchMedia?.('(display-mode: standalone)').matches||nav.standalone);
 const apple=/iPhone|iPad|iPod/.test(nav.userAgent||'')||(/Macintosh/.test(nav.userAgent||'')&&nav.maxTouchPoints>1);
 const query=new URLSearchParams(location.search||'');
 const canCompose=installed||apple||query.get('app')==='1'||query.get('ios')==='1'||query.get('install')==='ios';
 const cacheKey='secretletter-sent-preview-v1',previewMs=15*60*1000;
 const timeIds=['webDays','webHours','webMinutes','webSeconds'];
 let mode='single',prepared=null,busy=false,senderId=null,senderTimer=null,previewEpoch=0;
 const show=(name,on)=>$(name).classList[on?'remove':'add']('hidden');
 const say=(text,bad=false)=>{$('webSendState').textContent=text;$('webSendState').classList[bad?'add':'remove']('bad');};
 function saved(){
  const now=Date.now();let all=[];
  try{const value=JSON.parse(localStorage.getItem(cacheKey)||'[]');if(Array.isArray(value))all=value;}catch{}
  all=all.filter(x=>x&&/^[A-Za-z0-9_-]{24}$/.test(x.id)&&Number.isFinite(x.createdAt)&&x.createdAt<=now&&now-x.createdAt<previewMs).slice(-5);
  try{if(all.length)localStorage.setItem(cacheKey,JSON.stringify(all));else localStorage.removeItem(cacheKey);}catch{}
  return all;
 }
 function hasSent(value){return saved().some(x=>x.id===value);}
 function hideHome(){
  show('webBrand',false);show('actions',false);show('linkPanel',false);show('hint',false);show('senderJump',false);show('senderGuide',false);show('homeJump',false);$('notice').textContent='';
 }
 function begin(){
  if(!canCompose)return false;
  if(id){location.assign('/?compose=1');return true;}
  hideHome();show('webSender',false);show('webCompose',true);document.body?.classList.add('composing');$('webMessage').focus();return true;
 }
 function home(){
  if(id){location.assign('/');return;}
  clearPreview();show('webCompose',false);show('webSender',false);show('webBrand',true);show('actions',true);document.body?.classList.remove('composing');
 }
 const seconds=()=>timeIds.reduce((total,name,i)=>total+Number($(name).value)*[86400,3600,60,1][i],0);
 function invalidate(){
  prepared=null;show('webReady',false);show('webSenderButton',false);show('webReshare',false);$('composeSend').textContent='보내기';$('webShareLink').value='';say('');
  $('webCount').textContent=$('webMessage').value.length+' / 1600자';
  let left=seconds();const parts=[];
  for(const [label,size] of [['일',86400],['시간',3600],['분',60],['초',1]]){const n=Math.floor(left/size);left%=size;if(n)parts.push(n+label);}
  $('webDuration').textContent=parts.join(' ')||'0초';
 }
 async function api(endpoint,data){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),12000);
  try{
   const r=await fetch('/v10/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',signal:ctl.signal});
   const value=await r.json();if(!r.ok)throw Error(value.error||'서버에 연결하지 못했습니다.');return value;
  }catch(e){if(e.name==='AbortError')throw Error('서버 연결 시간이 초과되었습니다. 다시 눌러 주세요.');throw e;}
  finally{clearTimeout(timer);}
 }
 const encode=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),ch=>ch.charCodeAt(0));
 async function prepare(selected){
  if(prepared&&mode===selected)return prepared;
  mode=selected;const text=$('webMessage').value.trim(),ttl=seconds();
  if(!text||text.length>1600)throw Error('편지 내용을 1~1600자로 입력해 주세요.');
  if(!Number.isInteger(ttl)||ttl<1||ttl>2678399)throw Error('읽는 시간을 1초 이상 설정해 주세요.');
  const letterId=encode(crypto.getRandomValues(new Uint8Array(18)));
  const rawKey=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('secret-letter-v10|'+letterId+'|'+mode+'|'+ttl)},key,new TextEncoder().encode(text));
  const data={id:letterId,key:encode(rawKey),iv:encode(iv),ciphertext:encode(new Uint8Array(encrypted)),mode,seconds:ttl};rawKey.fill(0);
  await api('create',{id:data.id,iv:data.iv,ciphertext:data.ciphertext,mode:data.mode,seconds:data.seconds});
  prepared={...data,url:location.origin+'/l/'+data.id+'#?k='+data.key};
  $('webShareLink').value=prepared.url;
  try{const all=saved().filter(x=>x.id!==data.id);all.push({...data,createdAt:Date.now()});localStorage.setItem(cacheKey,JSON.stringify(all.slice(-5)));show('webSenderButton',true);}catch{show('webSenderButton',false);}
  return prepared;
 }
 function fallback(text){show('webReady',true);show('webShare',typeof nav.share==='function');$('webShareLink').value=prepared?.url||'';say(text,true);}
 function markShared(){$('webMessage').value='';$('webCount').textContent='0 / 1600자';$('composeSend').textContent='보내기';show('webReshare',true);say('');window.scrollTo?.({top:0,behavior:'auto'});}
 async function share(){
  if(!prepared)return;
  try{
   if(typeof nav.share!=='function')throw Error('공유 메뉴를 사용할 수 없습니다.');
   await nav.share({title:'비밀편지',url:prepared.url});
   markShared();show('webReady',false);
  }catch(e){
   if(e.name==='AbortError'){show('webReady',false);say('공유를 취소했습니다. 다시 보내면 같은 링크로 공유합니다.');}
   else fallback(typeof nav.share==='function'?'아래 공유하기를 눌러 보낼 앱을 선택해 주세요.':'아래 링크 복사를 눌러 보내 주세요.');
  }
 }
 async function copy(){
  if(!prepared)return;
  try{await nav.clipboard.writeText(prepared.url);markShared();show('webReady',false);say('링크를 복사했습니다.');}
  catch{fallback('링크 복사를 다시 누르거나, 아래 링크를 길게 눌러 복사해 주세요.');$('webShareLink').focus();$('webShareLink').select();}
 }
 function lock(on){busy=on;for(const name of ['composeSend','webReshare','webMessage',...timeIds,'webSingle','webGroup'])$(name).disabled=on;}
 async function sendSelected(selected){
  if(busy||!canCompose)return;
  lock(true);say('비밀편지를 준비하는 중입니다…');
  try{
   await prepare(selected);
   await share();
  }catch(e){say('보내기 실패: '+e.message,true);}
  finally{lock(false);}
 }
 $('webMessage').oninput=invalidate;
 for(const name of timeIds)$(name).onchange=invalidate;
 $('composeHome').onclick=()=>{if(!busy)home();};
 $('webReshare').onclick=()=>sendSelected(mode);
 $('composeSend').onclick=async()=>{
  if(busy||!canCompose)return;
  if(!$('webMessage').value.trim()){say('편지 내용을 입력해 주세요.',true);$('webMessage').focus();return;}
  if(seconds()<1||seconds()>2678399){say('읽는 시간을 1초 이상 설정해 주세요.',true);return;}
  await sendSelected(mode);
 };
 function selectMode(next){
  if(busy||mode===next)return;
  mode=next;$('webSingle').checked=next==='single';$('webGroup').checked=next==='group';invalidate();
 }
 $('webSingle').onchange=()=>{if($('webSingle').checked)selectMode('single');};
 $('webGroup').onchange=()=>{if($('webGroup').checked)selectMode('group');};
 $('webShare').onclick=share;$('webCopy').onclick=copy;
 function clearPreview(){previewEpoch++;if(senderTimer){clearInterval(senderTimer);senderTimer=null;}$('webSenderPlain').textContent='';senderId=null;}
 async function preview(value){
  clearPreview();hideHome();show('webCompose',false);show('webSender',true);$('webSenderState').textContent='확인하는 중입니다…';
  const epoch=previewEpoch;
  const entry=saved().find(x=>x.id===value);
  if(!entry){$('webSenderState').textContent='이 웹앱에 확인 가능한 보낸 편지가 없습니다. 발송 후 15분이 지났거나 다른 브라우저입니다.';return;}
  try{
   const state=await api('status',{id:value});if(state.available!==true)throw Error('받는 사람이 이미 읽었거나 편지가 만료되었습니다.');
   if(epoch!==previewEpoch)return;
   if(Date.now()-entry.createdAt>=previewMs||document.hidden)throw Error('확인 시간이 끝났습니다.');
   const key=await crypto.subtle.importKey('raw',decode(entry.key),'AES-GCM',false,['decrypt']);
   const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(entry.iv),additionalData:new TextEncoder().encode('secret-letter-v10|'+value+'|'+entry.mode+'|'+entry.seconds)},key,decode(entry.ciphertext));
   if(epoch!==previewEpoch||document.hidden){new Uint8Array(raw).fill(0);return;}
   $('webSenderPlain').textContent=new TextDecoder().decode(raw);new Uint8Array(raw).fill(0);senderId=value;$('webSenderState').textContent='';
   senderTimer=setInterval(()=>{if(Date.now()-entry.createdAt>=previewMs){clearPreview();saved();$('webSenderState').textContent='15분 확인 시간이 끝났습니다.';}},1000);
  }catch(e){if(epoch===previewEpoch)$('webSenderState').textContent='보낸 편지 확인 불가: '+e.message;}
 }
 $('webSenderButton').onclick=()=>{if(prepared)return preview(prepared.id);};
 $('webSenderClose').onclick=()=>{clearPreview();if(canCompose&&!id)begin();else home();};
 $('webSenderForget').onclick=()=>{if(senderId){const all=saved().filter(x=>x.id!==senderId);try{if(all.length)localStorage.setItem(cacheKey,JSON.stringify(all));else localStorage.removeItem(cacheKey);}catch{}}clearPreview();show('webSenderButton',false);$('webSenderState').textContent='내 기기의 임시 확인 기록을 삭제했습니다.';};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearPreview();if(!$('webSender').classList.contains('hidden'))$('webSenderState').textContent='편지 확인이 닫혔습니다.';}});
 window.addEventListener('pagehide',clearPreview);
 saved();
 return {installed,apple,begin,hasSent,preview,route(){const q=new URLSearchParams(location.search||'');if(q.has('sent'))return preview(q.get('sent'));if(canCompose&&q.get('compose')==='1')begin();}};
})();
`;
