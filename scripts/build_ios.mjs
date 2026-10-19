/** iOS Xcode project assistant. Runs only on macOS with Xcode installed. */
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mobile=path.join(root,'mobile');
function run(bin,args,cwd=mobile){const r=spawnSync(bin,args,{cwd,stdio:'inherit'});if(r.error||r.status!==0)throw Error(bin+' '+args.join(' ')+' 실행 실패');}
try {
  if(process.platform!=='darwin')throw Error('아이폰 앱을 실제 빌드하려면 Mac과 Xcode가 필요합니다.');
  if(!existsSync(path.join(mobile,'.env')))throw Error('Cloudflare 배포 후 생성되는 mobile/.env 파일이 필요합니다.');
  run('npm',['install','--no-audit','--no-fund']);
  run('npx',['--no-install','vite','build']);
  if(!existsSync(path.join(mobile,'ios')))run('npx',['--no-install','cap','add','ios']);
  run('node',['scripts/patch_native.mjs'],root);
  run('npx',['--no-install','cap','sync','ios']);
  run('npx',['--no-install','cap','open','ios']);
  console.log('Xcode에서 Signing & Capabilities에 본인의 개발팀을 지정한 다음 실제 iPhone 대상으로 Run을 실행합니다.');
}catch(e){console.error('아이폰 빌드 준비 중단:',e.message);process.exitCode=1;}
