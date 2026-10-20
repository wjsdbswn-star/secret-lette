// 비밀편지 v10 웹 열람 페이지. 브라우저에서만 AES-GCM 복호화합니다.
// #k= 복호화 열쇠는 HTTP 요청 /v10/open에 전송되지 않습니다.
const HTML = String.raw`<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive">
<meta name="theme-color" content="#f7f8f6"><title>✉️ 비밀편지가 도착했어요</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="비밀편지">
<meta property="og:title" content="✉️ 비밀편지가 도착했어요">
<meta property="og:description" content="앱 설치 없이 열어보세요. 시간이 지나면 닫히는 편지입니다.">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="✉️ 비밀편지가 도착했어요">
<meta name="twitter:description" content="앱 설치 없이 웹에서 읽는 비밀편지">
<style>
*{box-sizing:border-box}body{background:#f7f8f6;color:#233c30;font-family:system-ui,-apple-system,"Apple SD Gothic Neo",sans-serif;margin:0}
main{max-width:480px;margin:8vh auto 30px;padding:18px}
section{border:1px solid #dce5de;border-radius:22px;padding:28px 22px;background:#fff;text-align:center;box-shadow:0 10px 26px #163a2110}
h1{font-size:23px}p{color:#5d6d63;line-height:1.65}
button,.install{display:block;width:100%;padding:15px;border:0;border-radius:12px;background:#276347;color:#fff;font-size:16px;font-weight:750;text-decoration:none;margin:14px auto;cursor:pointer}
.install{background:#eaf2ed;color:#276347}button:disabled{opacity:.5}#notice{font-size:14px;color:#a13243;white-space:pre-wrap}
#letter{white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;line-height:1.8;padding:20px;border-radius:13px;background:#f0f6f1;font-size:17px}
.report{background:#fff8eb;color:#705230;border:1px solid #eed5a8;font-size:14px}
#reportInfo{font-size:12px;line-height:1.6;color:#75634d}
#time{font-weight:700;color:#276347;font-variant-numeric:tabular-nums} .hidden{display:none!important}
.small{font-size:12px;color:#738377}
</style></head><body><main><section>
<div style="font-size:36px">✉️</div><h1>비밀편지가 도착했어요</h1>
<p id="hint">앱 설치 없이 웹에서 읽을 수 있습니다.<br>편지 열기를 누르면 열람 시간이 시작됩니다.</p>
<button id="open" disabled>편지 열기</button>
<div id="during" class="hidden"><p id="time"></p><div id="letter"></div>
<p id="reportInfo">협박·괴롭힘 등 피해를 받았다면 편지를 닫기 전에 증거 보관을 요청할 수 있습니다. 제출된 편지와 열람키는 30일간 별도 보관됩니다. 자동으로 수사기관에 신고되지는 않습니다.</p>
<button id="report" class="report hidden" type="button">⚑ 증거 보관 요청 (30일)</button>
<button id="close" class="install">편지 닫기</button></div>
<p id="notice" role="status"></p>
<hr style="border:0;border-top:1px solid #e4ebe5;margin:25px 0 18px">
<p>나도 비밀편지를 보내고 싶다면?</p>
<a class="install" href="https://github.com/wjsdbswn-star/secret-lette/releases/latest" rel="noopener noreferrer">비밀편지 앱 설치하기 (안드로이드)</a>
<p class="small">편지 작성과 보내기는 앱에서만 가능합니다. 아이폰 앱은 아직 시험 개발 중입니다.</p>
</section></main><script>
(function(){
'use strict';
const $=id=>document.getElementById(id);
const idMatch=location.pathname.match(/^\/[ls]\/([A-Za-z0-9_-]{24})\/?$/);
const id=idMatch?.[1], secret=new URLSearchParams(location.hash.slice(1)).get('k');
if(!id && location.pathname!=='/'){
 $('notice').textContent='편지 주소를 확인해 주세요.';return;
}
if(!id){$('hint').textContent='비밀편지를 받으셨다면 받은 링크를 열어주세요.';return;}
if(!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)){
 $('notice').textContent='편지 암호키가 없거나 링크가 잘못되었습니다.';return;
}
$('open').disabled=false;
let watch=null,plainShown=false,reportEvidence=null;
const base64url=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),ch=>ch.charCodeAt(0));
const close=()=>{
 if(watch){clearInterval(watch);watch=null;}
 plainShown=false;reportEvidence=null;$('letter').textContent='';$('report').classList.add('hidden');$('during').classList.add('hidden');$('open').classList.add('hidden');
 $('hint').textContent='편지가 닫혔습니다.';$('notice').textContent='';
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
  $('open').classList.add('hidden');$('hint').classList.add('hidden');
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
