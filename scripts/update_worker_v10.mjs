/**
 * 비밀편지 기존 v10 Worker 업데이트. 신규 Worker/D1/Pages를 만들지 않습니다.
 * 로컬 PC에서 실행하며 최초 Cloudflare 로그인 승인 외 사용자 입력을 최소화합니다.
 */
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(root,'worker');
const wrangler=path.join(folder,'node_modules','.bin',process.platform==='win32'?'wrangler.cmd':'wrangler');
const configPath=path.join(folder,'wrangler.auto.toml');
const expectedUrl='https://secret-letter-mobile-v10.wjsdbswn.workers.dev';
function run(bin,args,{quiet=false,cwd=root}={}){
 const r=spawnSync(bin,args,{cwd,stdio:quiet?'pipe':'inherit',encoding:'utf8',shell:process.platform==='win32'});
 if(r.error||r.status!==0)throw Error((r.stderr||r.stdout||r.error?.message||'').slice(-1100)||'명령 실패: '+bin);
 return (r.stdout||'').trim();
}
function records(output){
 let json;
 try{json=JSON.parse(output);}catch{const start=output.indexOf('['),end=output.lastIndexOf(']');json=JSON.parse(output.slice(start,end+1));}
 return Array.isArray(json)?json:(json?.result||json?.databases||[]);
}
async function main(){
 const source=readFileSync(path.join(folder,'wrangler.toml'),'utf8');
 if(!source.includes('name = "secret-letter-mobile-v10"')||!source.includes('database_name = "secret-letter-mobile-v10"'))throw Error('기존 v10 설정을 찾을 수 없습니다. 배포하지 않습니다.');
 if(process.argv.includes('--dry-run')){console.log('DRY RUN OK: 기존 v10 Worker/D1만 갱신; 신규 자원 생성 없음');return;}
 console.log('[1/4] Cloudflare 배포 프로그램 준비');
 if(!existsSync(wrangler))run(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',folder,'--no-audit','--no-fund'],{cwd:root});
 console.log('[2/4] Cloudflare 계정 확인 (최초 사용 시 로그인 승인 필요)');
 try{const who=run(wrangler,['whoami'],{quiet:true});if(/not logged in|not authenticated|not currently logged/i.test(who))throw Error('login');}
 catch{run(wrangler,['login']);run(wrangler,['whoami'],{quiet:true});}
 console.log('[3/4] 기존 D1 찾기 (없으면 새로 만들지 않고 중단)');
 const found=records(run(wrangler,['d1','list','--json'],{quiet:true})).filter(x=>x.name==='secret-letter-mobile-v10');
 if(found.length!==1)throw Error('기존 D1을 정확히 한 개 찾지 못했습니다. 잘못된 Cloudflare 계정일 수 있으므로 배포하지 않습니다.');
 const dbid=found[0].uuid||found[0].id||found[0].database_id;
 if(typeof dbid!=='string'||!/^[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}$/i.test(dbid))throw Error('D1 데이터베이스 ID를 확인하지 못했습니다.');
 const config=source.replace('database_name = "secret-letter-mobile-v10"','database_name = "secret-letter-mobile-v10"\ndatabase_id = "'+dbid+'"');
 if(!config.includes('database_id = "'+dbid+'"'))throw Error('D1 바인딩 구성 실패.');
 writeFileSync(configPath,config,'utf8');
 console.log('[4/4] 기존 Worker 업데이트 (기존 D1 데이터는 삭제하지 않음)');
 const out=run(wrangler,['deploy','--config','wrangler.auto.toml'],{quiet:true,cwd:folder});
 console.log(out);
 if(!out.includes('secret-letter-mobile-v10'))console.log('주의: 배포 대상 Worker 이름을 다시 확인해 주세요.');
 const health=await fetch(expectedUrl+'/v10/health',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await health.json();
 if(health.status!==200||data.ok!==true)throw Error('업데이트 후 v10 서버 연결 확인 실패');
 const r=await fetch(expectedUrl+'/v10/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'A'.repeat(24)}),signal:AbortSignal.timeout(15000)});
 const j=await r.json();
 if(r.status!==200||j.available!==false)throw Error('서버는 접속되지만 발신자 미리보기 기능이 배포되지 않았습니다.');
 const landing=await fetch(expectedUrl+'/',{cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!(await landing.text()).includes('id="senderJump"'))throw Error('웹의 발신자 확인 버튼 배포를 확인하지 못했습니다.');
 console.log('\n성공: v10.9 Worker 업데이트 및 미리보기 상태 확인 완료.');
 console.log('서버:',expectedUrl);
}
main().catch(e=>{console.error('\n업데이트 실패:',e.message);console.error('기존 편지 기록이나 데이터베이스를 초기화하지 않았습니다.');process.exitCode=1;});
