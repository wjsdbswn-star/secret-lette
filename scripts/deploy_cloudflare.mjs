/**
 * Cloudflare v10 독립 배포 자동화. 기존 9차 Worker/Pages/D1을 수정하지 않습니다.
 * Run from project root: node scripts/deploy_cloudflare.mjs
 * 최초 로그인은 사용자 승인이 필요합니다. 비밀 키/편지 원문을 서버에 보낼 일이 없습니다.
 */
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const worker=path.join(root,'worker');
const mobile=path.join(root,'mobile');
const web=path.join(root,'web');
const dbName='secret-letter-mobile-v10';
const projectName='secret-letter-mobile-v10-read';
const cfgFile=path.join(worker,'wrangler.generated.toml');
const resultFile=path.join(root,'배포완료_주소.txt');
const dry=process.argv.includes('--dry-run');
const win=process.platform==='win32';

function invoke(bin,args,options={}){
  const r=spawnSync(bin,args,{cwd:options.cwd||root,encoding:'utf8',stdio:options.quiet?'pipe':'inherit',shell:win,env:process.env});
  if(r.error)throw new Error(`${bin} 실행 실패: ${r.error.message}`);
  if(r.status!==0)throw new Error(`${bin} ${args.join(' ')} 명령 실패 (코드 ${r.status})${options.quiet?': '+(r.stderr||r.stdout).slice(-650):''}`);
  return (r.stdout||'').trim();
}
function wrangler(args,quiet=false,cwd=root){
  // Config placeholder를 가진 기존 worker/wrangler.toml 자동 탐색을 피하도록 기본은 프로젝트 루트에서 실행합니다.
  const exe=path.join(worker,'node_modules','.bin',win?'wrangler.cmd':'wrangler');
  return invoke(exe,args,{cwd,quiet});
}
function parseJSON(raw){
  try{return JSON.parse(raw);}catch{}
  for(const ch of ['[','{']){
    const start=raw.indexOf(ch),end=raw.lastIndexOf(ch==='['?']':'}');
    if(start>=0&&end>=start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  }
  throw Error('Cloudflare 결과 JSON을 해석할 수 없습니다. Wrangler 버전을 확인해 주세요.');
}
function records(v){if(Array.isArray(v))return v;return v?.result||v?.databases||v?.projects||v?.items||[];}
async function retryFetch(url,ok){
  for(let n=0;n<5;n++){
    try {const r=await fetch(url,{signal:AbortSignal.timeout(12000),cache:'no-store'});if(r.ok && await ok(r))return true;}catch{}
    await new Promise(r=>setTimeout(r,1500));
  }
  return false;
}

async function main(){
  console.log('\n비밀편지 v10 전용 Cloudflare 배포 (기존 9차는 보존)');
  console.log('신규 Worker:',dbName,'/ 신규 D1:',dbName,'/ 신규 Pages:',projectName);
  if(dry){console.log('DRY RUN: 명령·프로젝트 구성만 확인, 로그인·생성·배포하지 않습니다.');return;}
  const localBin=path.join(worker,'node_modules','.bin',win?'wrangler.cmd':'wrangler');
  if(!existsSync(localBin)){
    console.log('\n[1/6] Cloudflare 도구 설치 중 (최초 1회 인터넷 연결 필요)');
    invoke('npm',['install','--prefix',worker,'--no-audit','--no-fund']);
  }
  console.log('\n[2/6] Cloudflare 로그인 확인');
  let authenticated=false;
  try {const w=wrangler(['whoami'],true);authenticated=!/not authenticated|not logged in|you are not logged in|not currently logged/i.test(w);}catch {}
  if(!authenticated){
    console.log('Cloudflare 로그인 화면에서 승인해 주세요. 로그인 정보는 이 프로그램에 저장하지 않습니다.');
    wrangler(['login']);
    wrangler(['whoami'],true);
  }
  console.log('\n[3/6] 전용 D1 확인 및 필요시 생성');
  let databases=records(parseJSON(wrangler(['d1','list','--json'],true)));
  let database=databases.find(x=>x.name===dbName);
  if(!database){
    wrangler(['d1','create',dbName]);
    databases=records(parseJSON(wrangler(['d1','list','--json'],true)));
    database=databases.find(x=>x.name===dbName);
  }
  const dbid=database?.uuid||database?.id||database?.database_id;
  if(!/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(dbid||''))throw Error('새 D1 UUID 확인에 실패했습니다. wrangler d1 list를 확인하세요.');
  const template=readFileSync(path.join(worker,'wrangler.toml'),'utf8');
  writeFileSync(cfgFile,template.replace('REPLACE_WITH_REAL_D1_DATABASE_ID',dbid),'utf8');
  // database schema.sql CREATE TABLE IF NOT EXISTS: 재시작/반복 실행 가능
  wrangler(['d1','execute',dbName,'--remote','--file=./schema.sql','--yes','--config',cfgFile],false,worker);
  console.log('\n[4/6] 독립 Worker 배포');
  const deployed=wrangler(['deploy','--config',cfgFile],true,worker);
  console.log(deployed);
  const workerMatch=deployed.match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/i);
  if(!workerMatch)throw Error('Worker 배포 출력에서 URL을 찾지 못했습니다. 출력의 workers.dev 주소를 확인해 주세요.');
  const workerURL=workerMatch[0];
  const healthy=await retryFetch(workerURL+'/v10/health',async r=>{
    try {const j=await r.json();return j.ok===true&&j.service==='secret-letter-v10';}catch{return false;}
  });
  if(!healthy)throw Error('Worker는 배포되었지만 /v10/health 확인에 실패했습니다. D1 바인딩을 확인해 주세요.');
  console.log('\n[5/6] 앱 설치 안내 Pages 배포');
  const projects=records(parseJSON(wrangler(['pages','project','list','--json'],true)));
  if(!projects.some(x=>x.name===projectName)){
    wrangler(['pages','project','create',projectName,'--production-branch=main']);
  }
  wrangler(['pages','deploy',web,'--project-name',projectName,'--branch=main']);
  const webURL=`https://${projectName}.pages.dev/`;
  const landingOK=await retryFetch(webURL,async r=> (await r.text()).includes('비밀편지가 도착했어요'));
  if(!landingOK)throw Error('Pages 배포를 완료했으나 안내 웹페이지 검증에 실패했습니다. 배포 프로젝트 주소를 확인해 주세요.');
  console.log('\n[6/6] 앱에서 사용할 공개 주소 자동 설정');
  writeFileSync(path.join(mobile,'.env'),`VITE_API_BASE=${workerURL}\nVITE_WEB_BASE=${webURL}\n`,'utf8');
  writeFileSync(resultFile,`비밀편지 앱 v10 배포 정보\nWorker: ${workerURL}\n안내 페이지: ${webURL}\nD1 이름: ${dbName}\nPages 프로젝트: ${projectName}\n\n기존 9차 배포에는 변경사항 없음.\n다음 단계: 시작_안드로이드앱만들기.cmd 실행.\n`,'utf8');
  console.log('\n배포 확인 완료!');
  console.log('서버:',workerURL,'\n설치 안내:',webURL);
  console.log('모바일 설정과 배포완료_주소.txt가 자동 생성되었습니다.');
}
main().catch(e=>{console.error('\n배포 중단:',e.message);console.error('이미 생성된 클라우드 자원은 삭제하지 않습니다. 수정 후 다시 실행해도 됩니다.');process.exitCode=1;});
