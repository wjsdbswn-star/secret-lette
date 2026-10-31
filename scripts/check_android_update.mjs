// Compare public APK metadata before publishing an in-place update. No private
// signing material is read or printed. A different certificate never passes.
import {spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function canUpdate(previous,next){
 return Boolean(previous?.id&&previous.id===next?.id&&
  /^[a-f0-9]{64}$/.test(previous.certificate||'')&&previous.certificate===next.certificate&&
  Number.isSafeInteger(previous.versionCode)&&Number.isSafeInteger(next.versionCode)&&next.versionCode>=previous.versionCode);
}
function run(bin,args){
 const r=spawnSync(bin,args,{encoding:'utf8'});
 if(r.error||r.status!==0)throw Error('APK metadata verification failed: '+bin+' '+(r.stderr||r.error?.message||''));
 return r.stdout;
}
function inspect(apk,signer,aapt){
 const certificate=run(signer,['verify','--print-certs',apk]).match(/Signer #1 certificate SHA-256 digest:\s*([a-fA-F0-9]{64})/)?.[1]?.toLowerCase();
 const info=run(aapt,['dump','badging',apk]);
 const id=info.match(/package: name='([^']+)'/)?.[1];
 const code=info.match(/versionCode='(\d+)'/)?.[1];
 if(!certificate||!id||!code)throw Error('APK ID, version or certificate could not be read.');
 return {id,versionCode:Number(code),certificate};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];
  for(const flag of ['--previous','--next','--apksigner','--aapt'])if(!args.includes(flag)||!get(flag))throw Error('Missing '+flag);
  const previous=inspect(get('--previous'),get('--apksigner'),get('--aapt'));
  const next=inspect(get('--next'),get('--apksigner'),get('--aapt'));
  const compatible=canUpdate(previous,next);
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'compatible='+compatible+'\n');
  console.log(JSON.stringify({compatible,previous,next},null,2));
  console.log(compatible?'UPDATE VERIFIED: same application and certificate; version does not decrease.':'UPDATE BLOCKED: do not uninstall the existing app. Original signing material is needed.');
 }catch(e){console.error(e.message);process.exitCode=1;}
}
