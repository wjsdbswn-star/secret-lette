'use strict';
// URL 조각(#k=...)은 웹서버로 전달되지 않습니다. 이 페이지에서는 절대로 복호화하지 않습니다.
const $=s=>document.querySelector(s);
const btn=$('#open'),copyBtn=$('#copyLink');
const m=location.pathname.match(/^\/l\/([A-Za-z0-9_-]{24})\/?$/);
const key=new URLSearchParams(location.hash.slice(1)).get('k');
if(!m || !key || !/^[A-Za-z0-9_-]{43}$/.test(key)){
  $('#error').textContent='편지 주소가 잘못되었거나 열쇠가 빠졌습니다.';
} else {
  btn.disabled=false;copyBtn.disabled=false;
  copyBtn.addEventListener('click',async()=>{
    try {
      await navigator.clipboard.writeText(location.href);
      $('#error').textContent='링크를 복사했습니다. 비밀편지 앱의 「편지 읽기」 화면에 붙여넣으세요.';
    } catch(e) {
      $('#error').textContent='이 브라우저에서 자동 복사가 막혔습니다. 주소창 링크를 직접 복사해 주세요.';
    }
  });
  btn.addEventListener('click',()=>{
    // Android/iOS의 custom URL scheme은 모바일 네이티브 프로젝트에 등록되어야 합니다.
    location.href=`secretletter://open/${m[1]}#k=${key}`;
    $('#error').textContent='앱이 열리지 않으면 비밀편지 앱을 설치한 후 다시 눌러 주세요.';
  });
}
