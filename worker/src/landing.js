// 앱 설치 없이 편지 내용을 보여주지 않는 안내 페이지입니다.
// URL fragment의 복호화 키는 네트워크 요청으로 서버에 전달되지 않습니다.
const HTML = `<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow,noarchive">
<title>비밀편지 도착</title><style>
*{box-sizing:border-box}body{background:#f7f8f6;color:#253b30;font-family:system-ui,-apple-system,sans-serif;margin:0}
main{max-width:450px;margin:11vh auto 0;padding:20px}section{border:1px solid #dce5de;border-radius:24px;padding:28px 22px;background:#fff;text-align:center}
h1{font-size:24px}p{color:#5d6d63;line-height:1.65}button{width:100%;margin:7px 0;padding:15px;border:0;border-radius:12px;background:#276347;color:white;font-size:16px;font-weight:bold}
button.secondary{background:#eaf2ed;color:#276347}button:disabled{opacity:.5}#notice{font-size:14px}
</style></head><body><main><section><div style="font-size:38px">✉️</div><h1>비밀편지가 도착했어요</h1>
<p>비밀편지는 앱에서만 읽을 수 있습니다.</p>
<button id="open" disabled>비밀편지 앱에서 열기</button><button class="secondary" id="copy" disabled>링크 복사</button>
<p id="notice" role="status"></p><small>앱이 설치되어 있지 않다면 보내는 사람에게 설치 파일을 요청해 주세요.</small>
</section></main><script>
(function(){
  const match=location.pathname.match(/^\\/l\\/([A-Za-z0-9_-]{24})\\/?$/);
  const key=new URLSearchParams(location.hash.slice(1)).get('k');
  const open=document.getElementById('open'),copy=document.getElementById('copy'),notice=document.getElementById('notice');
  if(!match||!key||!/^[A-Za-z0-9_-]{43}$/.test(key)){notice.textContent='편지 주소가 잘못되었거나 열쇠가 없습니다.';return;}
  open.disabled=false;copy.disabled=false;
  open.onclick=()=>{location.href='secretletter://open/'+match[1]+'#k='+key;notice.textContent='앱이 열리지 않으면 링크를 복사한 후 비밀편지 앱의 편지 읽기에 붙여넣으세요.'};
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(location.href);notice.textContent='링크를 복사했습니다.'}catch{notice.textContent='주소창에서 링크를 직접 복사해 주세요.'}};
})();
</script></body></html>`;
export function landingResponse() {
  return new Response(HTML,{headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  }});
}