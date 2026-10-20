import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const read=u=>readFileSync(new URL(u,import.meta.url),'utf8');
test('앱은 기존 9차 웹 주소를 기본값으로 사용하지 않는다',()=>{
 const mobile=read('../mobile/src/main.js');
 assert.match(mobile,/VITE_WEB_BASE\s*\|\|\s*''/);
 assert.ok(!mobile.includes('aa4cef21.secret-letter'));
 assert.match(mobile,/if\(!api\(\)\|\|!webBase\(\)\)/);
 assert.match(mobile,/secret-letter-web-wjsdbswn/);
 assert.match(mobile,/WEB_KEY/);
});
test('앱 열기 실패 시 링크 복사/붙여넣기 제공',()=>{
 const ui=read('../mobile/index.html'),web=read('../web/index.html'),code=read('../mobile/src/main.js');
 assert.match(ui,/id="pasteLink"/);
 assert.match(ui,/id="checkLink"/);
 assert.match(web,/id="copyLink"/);
 assert.match(code,/receiveLink\(raw\)/);
});
test('신규 Cloudflare 배포 시험 모드는 자원을 생성하지 않는다',()=>{
 const result=execFileSync('node',[fileURLToPath(new URL('../scripts/deploy_cloudflare.mjs',import.meta.url)),'--dry-run'],{encoding:'utf8'});
 assert.match(result,/DRY RUN/);
 assert.match(result,/기존 9차는 보존/);
});

test('서버 미연결에서도 앱 암호화 자체 시험 제공',()=>{
 const ui=read('../mobile/index.html'),script=read('../mobile/src/main.js');
 assert.match(ui,/id="offlineDemo"/);assert.match(script,/offlineDemo/);
 assert.match(ui,/id="webInput"/);
});


test('새 링크가 유효하지 않으면 이전 열람 대기를 지운다',()=>{
 const script=read('../mobile/src/main.js');
 assert.match(script,/async function receiveLink\(url\)\{[\s\S]*?incoming=null; \$\('open'\)\.disabled=true;[\s\S]*?stopReading\(false\);[\s\S]*?parseIncomingLink\(url,webBase\(\)\)/);
});
test('네이티브 앱이 백그라운드로 가면 열린 편지를 닫는다',()=>{
 const script=read('../mobile/src/main.js');
 assert.match(script,/App\.addListener\('appStateChange',[\s\S]*?!isActive&&watch\)stopReading\(\)/);
});
test('GitHub APK 빌드 직전에 자동 테스트를 수행한다',()=>{
 const workflow=read('../.github/workflows/android-apk.yml');
 assert.match(workflow,/name: 보안 및 소멸 기능 자동 테스트[\s\S]*?run: npm test/);
 assert.match(workflow,/name: 비밀편지-안드로이드-설치파일/);
});

test('보내기 버튼 한 번으로 암호화 등록 후 공유 창을 연다',()=>{
 const html=read('../mobile/index.html'),script=read('../mobile/src/main.js');
 assert.match(html,/id="send"[^>]*>↗ 비밀편지 보내기<\/button>/);
 assert.match(script,/await request\('create',[\s\S]*?await sharePrepared\(\)/);
 assert.match(script,/async function sharePrepared\(\)/);
 assert.match(script,/if\(!api\(\)\|\|!webBase\(\)\)/);
});

test('앱은 Cloudflare 공개 주소를 자동으로 찾아 검증한다',()=>{
 const script=read('../mobile/src/main.js'),cfg=JSON.parse(read('../server-config.json'));
 assert.match(script,/SERVICE_CONFIG_URL='https:\/\/wjsdbswn-star\.github\.io\/secret-lette\/server-config\.json'/);
 assert.match(script,/await fetch\(a\+'\/v10\/health'/);
 assert.match(script,/if\(!api\(\)\|\|!webBase\(\)\)await ensureServiceConfig\(\)/);
 assert.deepEqual(Object.keys(cfg).sort(),['apiBase','webBase']);
});
