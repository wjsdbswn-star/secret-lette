// v11: D1 only stores expiration metadata; AES-GCM ciphertext lives in R2.
// Neither plaintext nor #k decryption secret is sent to the Worker.
// Deletion prevents R2 normal-object recovery but cannot revoke pre-expiry copies.
const MAX_SECONDS=30*86400+23*3600+59*60+59;
const UNOPENED_MS=30*86400*1000;
const B64=/^[A-Za-z0-9_-]+$/;
const json=(body,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS',
 'Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'}
});
const idValid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{24}$/.test(id);
const objectKey=id=>'secure-v11/'+id;
export function secureReady(env){return Boolean(env?.DB&&env?.PRIVATE_BLOBS);}
export async function secureTable(DB){
 await DB.prepare(`CREATE TABLE IF NOT EXISTS letters_v11 (
   id TEXT PRIMARY KEY,
   mode TEXT NOT NULL CHECK(mode IN ('single','group')),
   duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 2678399),
   created_at_ms INTEGER NOT NULL,
   unopened_until_ms INTEGER NOT NULL,
   opened_at_ms INTEGER,
   expires_at_ms INTEGER,
   ready INTEGER NOT NULL DEFAULT 0 CHECK(ready IN(0,1))
 )`).bind().run();
}
export async function secureCreate(DB,R2,r){
 if(!idValid(r.id)||!['single','group'].includes(r.mode)||
  !Number.isInteger(r.seconds)||r.seconds<1||r.seconds>MAX_SECONDS||
  typeof r.iv!=='string'||r.iv.length!==16||!B64.test(r.iv)||
  typeof r.ciphertext!=='string'||r.ciphertext.length<24||r.ciphertext.length>8192||
  !B64.test(r.ciphertext)){
  return json({error:'편지 형식이 올바르지 않습니다.'},400);
 }
 const now=Date.now();
 try {
  await DB.prepare(`INSERT INTO letters_v11
   (id,mode,duration_seconds,created_at_ms,unopened_until_ms,ready)
   VALUES (?,?,?,?,?,0)`).bind(r.id,r.mode,r.seconds,now,now+UNOPENED_MS).run();
 }catch(e){
  if(/UNIQUE|PRIMARY KEY/i.test(e.message))return json({error:'편지 번호가 중복되었습니다.'},409);
  throw e;
 }
 try {
  await R2.put(objectKey(r.id),JSON.stringify({iv:r.iv,ciphertext:r.ciphertext}),{
   httpMetadata:{contentType:'application/json'}
  });
  await DB.prepare('UPDATE letters_v11 SET ready=1 WHERE id=?').bind(r.id).run();
  return json({ok:true,id:r.id,unopenedUntil:now+UNOPENED_MS},201);
 }catch(e){
  try{await R2.delete(objectKey(r.id));}catch{}
  await DB.prepare('DELETE FROM letters_v11 WHERE id=? AND ready=0').bind(r.id).run();
  throw e;
 }
}
async function getPayload(R2,id){
 const object=await R2.get(objectKey(id));
 if(!object)return null;
 const data=JSON.parse(await object.text());
 if(typeof data.iv!=='string'||typeof data.ciphertext!=='string')return null;
 return data;
}
export async function secureOpen(DB,R2,r){
 if(!idValid(r.id))return json({error:'잘못된 편지 주소입니다.'},400);
 const now=Date.now();
 const single=await DB.prepare(`UPDATE letters_v11 SET ready=0,opened_at_ms=?
 WHERE id=? AND mode='single' AND ready=1 AND opened_at_ms IS NULL AND unopened_until_ms>?
 RETURNING duration_seconds AS durationSeconds`).bind(now,r.id,now).first();
 if(single){
  // Keep a tombstone if R2 deletion fails so scheduled cleanup can retry.
  // ready=0 atomically prevents any simultaneous second reader.
  let payload;
  try{payload=await getPayload(R2,r.id);}
  finally{await R2.delete(objectKey(r.id));}
  await DB.prepare('DELETE FROM letters_v11 WHERE id=? AND ready=0').bind(r.id).run();
  if(!payload)return json({error:'편지가 이미 소멸했습니다.'},410);
  return json({ok:true,mode:'single',durationSeconds:single.durationSeconds,
   iv:payload.iv,ciphertext:payload.ciphertext,
   deadlineAt:now+single.durationSeconds*1000,serverNow:Date.now()});
 }
 await DB.prepare(`UPDATE letters_v11 SET opened_at_ms=?,expires_at_ms=?+duration_seconds*1000
 WHERE id=? AND mode='group' AND ready=1 AND opened_at_ms IS NULL AND unopened_until_ms>?`)
 .bind(now,now,r.id,now).run();
 const group=await DB.prepare(`SELECT duration_seconds AS durationSeconds,
 expires_at_ms AS deadlineAt FROM letters_v11
 WHERE id=? AND mode='group' AND ready=1 AND opened_at_ms IS NOT NULL AND expires_at_ms>?`)
 .bind(r.id,Date.now()).first();
 if(!group){
  const expired=await DB.prepare(`SELECT id FROM letters_v11 WHERE id=? AND ready=1 AND
    (unopened_until_ms<=? OR (expires_at_ms IS NOT NULL AND expires_at_ms<=?))`)
    .bind(r.id,Date.now(),Date.now()).first();
  if(expired){
   await R2.delete(objectKey(r.id));
   await DB.prepare('DELETE FROM letters_v11 WHERE id=?').bind(r.id).run();
  }
  return json({error:'편지가 만료되었거나 이미 열렸습니다.',code:'UNAVAILABLE'},410);
 }
 const payload=await getPayload(R2,r.id);
 if(!payload)return json({error:'편지 파일이 이미 삭제되었습니다.',code:'UNAVAILABLE'},410);
 return json({ok:true,mode:'group',iv:payload.iv,ciphertext:payload.ciphertext,
  durationSeconds:group.durationSeconds,deadlineAt:group.deadlineAt,serverNow:Date.now()});
}
export async function secureCleanup(DB,R2){
 const now=Date.now();
 const expired=await DB.prepare(`SELECT id FROM letters_v11 WHERE
   (ready=0 AND (opened_at_ms IS NOT NULL OR created_at_ms<?)) OR
   (opened_at_ms IS NULL AND unopened_until_ms<=?) OR
   (opened_at_ms IS NOT NULL AND expires_at_ms<=?) LIMIT 100`)
   .bind(now-5*60*1000,now,now).all();
 for(const row of expired.results){
  await R2.delete(objectKey(row.id));
  await DB.prepare('DELETE FROM letters_v11 WHERE id=?').bind(row.id).run();
 }
 return expired.results.length;
}
