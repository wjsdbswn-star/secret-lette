/** Android build assistant for Windows. Requires Node.js, Android Studio + SDK. */
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mobile=path.join(root,'mobile');
const win=process.platform==='win32';
function run(bin,args,cwd=mobile){const r=spawnSync(bin,args,{cwd,stdio:'inherit',shell:win});if(r.error||r.status!==0)throw Error(bin+' '+args.join(' ')+' 실행 실패');}
try{
  if(!existsSync(path.join(mobile,'.env')))console.log('서버 주소가 아직 없습니다. APK는 생성할 수 있으며, 앱 설치 후 관리자 설정에서 v10 Worker/Pages를 연결하면 편지를 주고받을 수 있습니다.');
  console.log('[1/4] 앱 라이브러리 설치');run('npm',['install','--no-audit','--no-fund']);
  console.log('[2/4] 앱 웹 코드 빌드');run('npx',['--no-install','vite','build']);
  if(!existsSync(path.join(mobile,'android'))){console.log('[3/4] 안드로이드 프로젝트 생성');run('npx',['--no-install','cap','add','android']);}
  run('node',['scripts/patch_native.mjs'],root);
  run('npx',['--no-install','cap','sync','android']);
  console.log('[4/4] APK 빌드');
  if(!process.env.ANDROID_HOME&&!process.env.ANDROID_SDK_ROOT){
    console.log('Android SDK 환경변수가 설정되어 있지 않습니다. Android Studio가 있다면 프로젝트를 엽니다.');
    run('npx',['--no-install','cap','open','android']);
    console.log('Android Studio > Build > Build APK(s)에서 생성하세요.');
  }else{
    const a=path.join(mobile,'android');run(win?'gradlew.bat':'./gradlew',['assembleDebug'],a);
    const source=path.join(a,'app/build/outputs/apk/debug/app-debug.apk');
    if(!existsSync(source))throw Error('APK 빌드 결과가 발견되지 않았습니다.');
    const dest=path.join(root,'비밀편지_안드로이드_시험용.apk');copyFileSync(source,dest);
    console.log('테스트 APK 생성:',dest);
  }
}catch(e){console.error('안드로이드 빌드 중단:',e.message);process.exitCode=1;}
