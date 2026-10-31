/** Native iOS app builder. CI creates an explicitly UNSIGNED device archive. */
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mobile=path.join(root,'mobile');
const ci=process.argv.includes('--ci');
function run(bin,args,cwd=mobile){const r=spawnSync(bin,args,{cwd,stdio:'inherit'});if(r.error||r.status!==0)throw Error(bin+' '+args.join(' ')+' 실행 실패');}
try {
  if(process.platform!=='darwin')throw Error('아이폰 앱을 실제 빌드하려면 Mac과 Xcode가 필요합니다.');
  run('npm',['install','--no-audit','--no-fund']);
  run('npx',['--no-install','vite','build']);
  if(!existsSync(path.join(mobile,'ios')))run('npx',['--no-install','cap','add','ios']);
  run('node',['scripts/patch_native.mjs'],root);
  run('npx',['--no-install','cap','sync','ios']);
  const plist=readFileSync(path.join(mobile,'ios/App/App/Info.plist'),'utf8');
  if(!plist.includes('<string>secretletter</string>'))throw Error('iOS 앱 연결 주소가 등록되지 않았습니다.');
  if(ci){
    const version=JSON.parse(readFileSync(path.join(mobile,'package.json'),'utf8')).version;
    const output=path.join(root,'artifacts');mkdirSync(output,{recursive:true});
    const archive=path.join(output,'SecretLetter-UNSIGNED.xcarchive');
    run('xcodebuild',['-workspace','ios/App/App.xcworkspace','-scheme','App','-configuration','Release','-sdk','iphoneos','-destination','generic/platform=iOS','-archivePath',archive,
      'MARKETING_VERSION='+version,'CURRENT_PROJECT_VERSION='+(process.env.GITHUB_RUN_NUMBER||'1'),'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','CODE_SIGN_IDENTITY=','DEVELOPMENT_TEAM=','archive']);
    const app=path.join(archive,'Products/Applications/App.app');
    if(!existsSync(path.join(app,'App')))throw Error('아이폰 네이티브 실행 파일을 찾지 못했습니다.');
    if(!existsSync(path.join(app,'public/index.html')))throw Error('앱에 작성 화면이 포함되지 않았습니다.');
    run('ditto',['-c','-k','--sequesterRsrc','--keepParent',archive,path.join(output,'secret-letter-ios-UNSIGNED-archive.zip')],root);
    console.log('SUCCESS: Native iPhone archive compiled. UNSIGNED: not installable on a phone until Apple signing and provisioning are configured.');
  }else{
    run('npx',['--no-install','cap','open','ios']);
    console.log('Xcode에서 Signing & Capabilities에 본인의 개발팀을 지정한 다음 실제 iPhone 대상으로 Run을 실행합니다.');
  }
}catch(e){console.error('아이폰 빌드 준비 중단:',e.message);process.exitCode=1;}
