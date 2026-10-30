// 비밀편지 v10 웹 열람 페이지. 브라우저에서만 AES-GCM 복호화합니다.
// #k= 복호화 열쇠는 HTTP 요청 /v10/open에 전송되지 않습니다.
const HTML = String.raw`<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive">
<meta name="theme-color" content="#fcfcfd"><title>비밀편지</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="비밀편지">
<meta property="og:title" content="✉️ 비밀편지가 도착했어요">
<meta property="og:description" content="앱 설치 없이 열어보세요. 시간이 지나면 닫히는 편지입니다.">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="✉️ 비밀편지가 도착했어요">
<meta name="twitter:description" content="앱 설치 없이 웹에서 읽는 비밀편지">
<style>
:root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#24232c;background:#fcfcfd;font-synthesis:none}*{box-sizing:border-box}body{margin:0}button,input,a{-webkit-tap-highlight-color:transparent}button,input{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer}main{min-height:100svh;display:grid;place-items:center;padding:32px 24px calc(32px + env(safe-area-inset-bottom))}.shell{width:100%;max-width:380px;text-align:center}.brand{display:inline-flex;align-items:center;gap:12px;margin-bottom:36px}.mark{width:33px;height:33px;color:#7566dc}h1{font-size:25px;letter-spacing:-1px;font-weight:600;margin:0}p{margin:0;line-height:1.65}#hint{color:#94919f;font-size:13px;margin:-20px 0 28px}#hint:empty{display:none}.actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}button,.install{display:flex;justify-content:center;align-items:center;gap:10px;min-height:58px;border-radius:15px;padding:15px 18px;font-size:16px;font-weight:500;text-decoration:none;transition:background .15s,transform .15s}.primary{background:#7566dc;color:#fff;border:1px solid #7566dc}.primary:hover{background:#6656ce}.secondary{background:#fff;color:#494451;border:1px solid #e7e5ed}button:hover,.secondary:hover{transform:translateY(-1px)}button:active,.install:active{transform:translateY(0)}button:disabled{opacity:.4;cursor:default;transform:none}.icon{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.text-link{display:inline-block;background:none;border:0;min-height:44px;padding:14px 0;font-size:12px;color:#94919f;text-decoration:none}.text-link:hover{color:#6656ce}.hidden{display:none!important}#notice{font-size:13px;color:#ad445d;white-space:pre-wrap;margin-top:18px}#notice:empty{display:none}#linkPanel{margin-top:24px;text-align:left}.link-row{display:flex;gap:8px}input{width:100%;min-width:0;border:1px solid #e7e5ed;border-radius:12px;background:#fff;padding:15px 13px;color:#35313d;font-size:14px}input:focus{outline:2px solid #beb6f2;outline-offset:2px}.link-row button{min-height:50px;font-size:14px;padding:10px 15px;white-space:nowrap}.small{color:#96929e;font-size:12px}.link-help{margin-top:9px}#during{text-align:left}#time{font-size:13px;color:#91849e;font-variant-numeric:tabular-nums;margin:0 0 20px}#letter{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.9;font-size:18px;color:#38313e;min-height:100px;padding-bottom:22px}#close{width:100%;margin-top:24px}.report-details{margin-top:12px;color:#96929e;font-size:12px}.report-details summary{cursor:pointer;display:inline-block;padding:12px 0}.report-details p{font-size:12px;line-height:1.7;color:#847d89}.report{margin-top:12px;width:100%;font-size:13px;min-height:44px;color:#645b6c;background:#f3f1f7;border:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}dialog{width:calc(100% - 48px);max-width:350px;border:1px solid #efedf4;border-radius:24px;padding:32px 26px 18px;color:#35303e;background:#fff;box-shadow:0 24px 80px #28213f18;text-align:center}dialog::backdrop{background:#25202e3d;backdrop-filter:blur(5px)}dialog h2{font-size:19px;font-weight:500;letter-spacing:-.5px;line-height:1.6;margin:0 0 10px}dialog p{font-size:12px;color:#96909e;margin-bottom:24px}dialog .install{width:100%}dialog button.text-link{width:100%}:focus-visible{outline:2px solid #a299dd;outline-offset:4px}@media(prefers-reduced-motion:reduce){*{transition:none!important}}@media(max-width:360px){main{padding-left:20px;padding-right:20px}.actions{gap:9px}}
dialog .app-continue{display:block;width:100%;padding:12px 0 0;min-height:36px;font-size:12px;color:#817493;text-decoration:none}</style></head><body><main><section class="shell">
<header class="brand"><svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="25" height="18" rx="5" stroke="currentColor" stroke-width="1.5"/><path d="m5 10 9 7a3.2 3.2 0 0 0 4 0l9-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg><h1>비밀편지</h1></header>
<p id="hint"></p>
<div class="actions" id="actions">
<button id="send" class="primary" type="button"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4 18-7Z"/><path d="m10 14 5-5"/></svg>보내기</button>
<button id="open" class="secondary" type="button" disabled><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9L12 3 4 10Z"/><path d="m4 11 8 5 8-5"/></svg>열기</button>
</div>
<a id="senderJump" class="text-link hidden" rel="noopener noreferrer" href="#">보낸 편지 확인</a>
<p id="senderGuide" class="sr-only hidden">이 편지를 보낸 사람은 앱에서 확인하세요. 받은 사람용 열기 버튼을 누르면 수신자의 1회 열람이 사라집니다.</p>
<div id="linkPanel" class="hidden"><form id="linkForm"><label class="sr-only" for="linkInput">받은 편지 링크</label><div class="link-row"><input id="linkInput" type="url" placeholder="받은 링크를 붙여넣으세요" required autocomplete="off" autocapitalize="off" spellcheck="false"><button class="secondary" type="submit">확인</button></div></form><p class="small link-help">앱 설치 없이 웹에서 읽을 수 있습니다.</p></div>
<div id="during" class="hidden"><p id="time"></p><div id="letter"></div><button id="close" class="secondary" type="button">닫기</button>
<details class="report-details"><summary>도움</summary><p id="reportInfo">협박·괴롭힘 등 피해를 받았다면 편지를 닫기 전에 증거 보관을 요청할 수 있습니다. 제출된 편지와 열람키는 30일간 별도 보관됩니다. 자동으로 수사기관에 신고되지는 않습니다.</p><button id="report" class="report hidden" type="button">증거 보관 요청 (30일)</button></details></div>
<p id="notice" role="status" aria-live="polite"></p>
<a id="homeJump" class="text-link hidden" href="/">처음으로</a>
</section></main>
<dialog id="installDialog" aria-labelledby="installTitle"><h2 id="installTitle">보내려면<br>앱 설치가 필요합니다.</h2><p id="installMode">안드로이드용 비밀편지 앱</p><a id="installConfirm" class="install primary" href="https://github.com/wjsdbswn-star/secret-lette/releases/latest/download/secret-letter.apk" rel="noopener noreferrer">설치하겠습니다</a><a id="openApp" class="app-continue" href="secretletter://compose">이미 설치했어요</a><button id="installCancel" class="text-link" type="button">닫기</button></dialog>
<script>
(function(){
'use strict';
const $=id=>document.getElementById(id);
const idMatch=location.pathname.match(/^\/[ls]\/([A-Za-z0-9_-]{24})\/?$/);
const id=idMatch?.[1], secret=new URLSearchParams(location.hash.slice(1)).get('k');
const installDialog=$('installDialog');
$('send').onclick=()=>installDialog.showModal();
$('installCancel').onclick=()=>installDialog.close();
installDialog.addEventListener('click',event=>{if(event.target===installDialog)installDialog.close();});
$('installConfirm').onclick=event=>{
 if(/iPhone|iPad|iPod/.test(navigator.userAgent)){
  event.preventDefault();installDialog.close();$('notice').textContent='아이폰 앱은 준비 중입니다. 받은 편지는 설치 없이 열 수 있습니다.';
 }
};
$('linkForm').onsubmit=event=>{
 event.preventDefault();
 try{
  const target=new URL($('linkInput').value.trim());
  const validPath=/^\/[ls]\/[A-Za-z0-9_-]{24}\/?$/.test(target.pathname);
  const key=new URLSearchParams(target.hash.slice(1)).get('k');
  const trusted=target.origin===location.origin||target.origin==='https://secret-letter-mobile-v10.wjsdbswn.workers.dev';
  if(target.protocol!=='https:'||!trusted||target.username||target.password||target.search||!validPath||!key||!/^[A-Za-z0-9_-]{43}$/.test(key))throw Error();
  location.assign(target.href);
 }catch{$('notice').textContent='받은 편지 링크를 다시 확인해 주세요.';}
};

if(!id && location.pathname!=='/'){
 $('notice').textContent='편지 주소를 확인해 주세요.';return;
}
if(!id){
 $('open').disabled=false;
 $('open').onclick=()=>{$('linkPanel').classList.remove('hidden');$('linkInput').focus();};
 return;
}
$('hint').textContent='열면 시간이 시작됩니다.';
if(!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)){
 $('notice').textContent='편지 암호키가 없거나 링크가 잘못되었습니다.';return;
}
$('open').disabled=false;
if(location.pathname.startsWith('/l/')){
 $('senderGuide').classList.remove('hidden');

 $('senderJump').href='secretletter://sent/'+id;
 $('senderJump').classList.remove('hidden');
}
let watch=null,plainShown=false,reportEvidence=null;
const base64url=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),ch=>ch.charCodeAt(0));
const close=()=>{
 if(watch){clearInterval(watch);watch=null;}
 plainShown=false;reportEvidence=null;$('actions').classList.add('hidden');$('senderJump').classList.add('hidden');$('homeJump').classList.remove('hidden');$('letter').textContent='';$('report').classList.add('hidden');$('during').classList.add('hidden');$('open').classList.add('hidden');
 $('hint').classList.remove('hidden');$('hint').textContent='편지가 닫혔습니다.';$('notice').textContent='';
};
$('close').onclick=close;
$('report').onclick=async()=>{
 if(!reportEvidence)return;
 if(!confirm('읽은 편지의 암호문과 열람키를 30일간 별도 보관합니다. 운영자가 보관된 편지를 복호화할 수 있고, 적법한 절차에 따라 제출될 수 있습니다. 계속할까요?'))return;
 $('report').disabled=true;
 $('notice').textContent='증거 보관 요청 중…';
 try{
   const r=await fetch('/v10/report',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(reportEvidence),cache:'no-store'});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'보관 실패');
   $('notice').textContent='30일 증거 보관 접수 완료. 확인번호: '+data.reportId+
     ' / 수사기관에 자동 신고되는 것은 아닙니다.';
   $('report').classList.add('hidden');
   reportEvidence=null;
 }catch(e){
   $('notice').textContent='증거 보관 실패: '+(e?.message||'다시 시도해 주세요.');
   $('report').disabled=false;
 }
};
document.addEventListener('visibilitychange',()=>{if(document.hidden && plainShown)close();});
window.addEventListener('pagehide',()=>{if(plainShown)close();});
$('open').onclick=async()=>{
 $('open').disabled=true;$('notice').textContent='암호화된 편지를 여는 중입니다…';
 const start=performance.now();
 try {
  const endpoint=location.pathname.startsWith('/s/')?'/v11/open':'/v10/open';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store'});
  const record=await r.json();
  if(!r.ok)throw Error(record.error||'편지를 읽을 수 없습니다.');
  const ttl=record.durationSeconds;
  if(!Number.isInteger(ttl)||ttl<1 || ttl>2678399)throw Error('편지 데이터 오류');
  const rawKey=base64url(secret);
  if(rawKey.length!==32)throw Error('암호키 오류');
  const cryptoKey=await crypto.subtle.importKey('raw',rawKey,'AES-GCM',false,['decrypt']);
  rawKey.fill(0);
  const aad=new TextEncoder().encode('secret-letter-v10|'+id+'|'+record.mode+'|'+ttl);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64url(record.iv),additionalData:aad},cryptoKey,base64url(record.ciphertext));
  const deadline=record.deadlineAt, serverNow=record.serverNow;
  if(deadline <= serverNow+(performance.now()-start))throw Error('편지 열람 시간이 끝났습니다.');
  $('letter').textContent=new TextDecoder().decode(raw);
  if(record.reportToken && endpoint==='/v10/open'){
   reportEvidence={id,reportToken:record.reportToken,key:secret,mode:record.mode,
     durationSeconds:record.durationSeconds,iv:record.iv,ciphertext:record.ciphertext};
   $('report').disabled=false;$('report').classList.remove('hidden');
  }
  new Uint8Array(raw).fill(0);
  $('actions').classList.add('hidden');$('senderJump').classList.add('hidden');$('open').classList.add('hidden');$('hint').classList.add('hidden');
  $('during').classList.remove('hidden');$('notice').textContent='';plainShown=true;
  // 주소에 있던 키를 화면 주소줄에서 숨김. 서버에 키가 저장되는 것은 아닙니다.
  history.replaceState(null,'',location.pathname);
  const tick=()=>{
   if(!plainShown)return;
   const ms=Math.max(0,deadline-serverNow-(performance.now()-start));
   if(ms===0){close();return;}
   let sec=Math.ceil(ms/1000),d=Math.floor(sec/86400);sec%=86400;
   const h=Math.floor(sec/3600);sec%=3600;
   const m=Math.floor(sec/60),s=sec%60;
   $('time').textContent='남은 시간 '+(d?d+'일 ':'')+[h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
  };
  watch=setInterval(tick,200);tick();
 }catch(e){$('notice').textContent='열람 실패: '+(e?.message||'알 수 없는 오류');$('open').disabled=false;}
};
})();
</script></body></html>`;
export function landingResponse() {
  return new Response(HTML,{headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  }});
}

