import {landingResponse} from './landing.js';
import {secureReady,secureTable,secureCreate,secureOpen,secureCleanup} from './strong-expiry.js';
// 비밀편지 v10: Cloudflare Worker + D1.
// 개인 신원 인증 없음. URL(특히 #k=...)은 링크를 가진 사람에게 읽기 권한을 줍니다.
// 서버에는 iv, ciphertext, 랜덤 ID와 소멸 메타데이터만 저장합니다.
const MAX_DURATION = 30 * 86400 + 23 * 3600 + 59 * 60 + 59;
const UNOPENED_MS = 30 * 86400 * 1000;
const MAX_BODY_BYTES = 16384;
const REPORT_RETENTION_MS = 30 * 86400 * 1000;
const REPORT_TOKEN_MS = 30 * 60 * 1000;
const B64 = /^[A-Za-z0-9_-]+$/;
const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '600',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });
const idOK = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{24}$/.test(id);
const partOK = (s, min, max) => typeof s === 'string' && s.length >= min && s.length <= max && B64.test(s);

async function digestText(value) {
  const raw=new TextEncoder().encode(value);
  const data=await crypto.subtle.digest('SHA-256',raw);
  return Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
}
// 별도 회원가입 없이 정상 사용에 영향을 덜 주도록 시간당 한도를 넉넉하게 둡니다.
async function throttle(db,request,path) {
  const ip=request.headers.get('CF-Connecting-IP');
  if(!ip)return null;
  const hour=Math.floor(Date.now()/3600000);
  const id=await digestText(ip+'|'+hour+'|'+path);
  const r=await db.prepare('INSERT INTO request_limits_v10 (id,hits,expires_at_ms) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits')
    .bind(id,(hour+2)*3600000).first();
  const limit=path==='/v10/create'?60:path==='/v10/report'?20:300;
  return r.hits>limit ? answer({error:'반복 요청이 많습니다. 잠시 후 다시 시도해 주세요.'},429):null;
}
// 복호화 키를 보관하지 않고, 실제 열람했던 브라우저만 신고하도록 수령증을 발급합니다.
async function makeReceipt(db,id,mode,ttl,iv,ciphertext) {
  const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
  const tokenHash=await digestText(token);
  const fingerprint=await digestText(JSON.stringify([id,mode,ttl,iv,ciphertext]));
  await db.prepare('INSERT INTO report_receipts_v10 (token_hash,id,fingerprint,expires_at_ms) VALUES (?,?,?,?)')
    .bind(tokenHash,id,fingerprint,Date.now()+REPORT_TOKEN_MS).run();
  return token;
}
async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw new Error('JSON 요청만 허용합니다.');
  const n = Number(request.headers.get('content-length'));
  if (n > MAX_BODY_BYTES) throw new Error('요청이 너무 큽니다.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) throw new Error('요청이 너무 큽니다.');
  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('잘못된 요청입니다.');
  return obj;
}

// D1 자동 생성 후 첫 호출에서 기존 데이터를 유지하며 테이블을 준비합니다.
async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS letters_v10 (
    id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('single','group')),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 1 AND 2678399),
    iv TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    unopened_until_ms INTEGER NOT NULL,
    opened_at_ms INTEGER,
    expires_at_ms INTEGER
  )`).bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS report_receipts_v10 (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL, fingerprint TEXT NOT NULL, expires_at_ms INTEGER NOT NULL)").bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS reports_v10 (id TEXT PRIMARY KEY, mode TEXT NOT NULL, duration_seconds INTEGER NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL, reader_key TEXT NOT NULL, reported_at_ms INTEGER NOT NULL, delete_after_ms INTEGER NOT NULL)").bind().run();
  await db.prepare("CREATE TABLE IF NOT EXISTS request_limits_v10 (id TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at_ms INTEGER NOT NULL)").bind().run();
}

async function create(db, r) {
  if (!idOK(r.id) || !['single', 'group'].includes(r.mode) ||
      !Number.isInteger(r.seconds) || r.seconds < 1 || r.seconds > MAX_DURATION ||
      !partOK(r.iv, 16, 16) || !partOK(r.ciphertext, 24, 8192)) {
    return answer({ error: '편지 형식이 올바르지 않습니다.' }, 400);
  }
  const now = Date.now();
  try {
    await db.prepare(`INSERT INTO letters_v10
      (id,mode,duration_seconds,iv,ciphertext,created_at_ms,unopened_until_ms)
      VALUES (?,?,?,?,?,?,?)`)
      .bind(r.id,r.mode,r.seconds,r.iv,r.ciphertext,now,now+UNOPENED_MS).run();
  } catch (e) {
    if (/UNIQUE|PRIMARY KEY/i.test(e.message)) return answer({ error:'중복된 편지 번호입니다.' },409);
    throw e;
  }
  return answer({ ok:true, id:r.id, unopenedUntil:now+UNOPENED_MS },201);
}

async function open(db, r) {
  if (!idOK(r.id)) return answer({ error:'잘못된 편지 주소입니다.' },400);
  const now = Date.now();
  // 정확히 1번만 반환하도록 원자적 삭제. 열람 버튼을 누른 요청만 이 API를 호출해야 합니다.
  const single = await db.prepare(`DELETE FROM letters_v10
    WHERE id=? AND mode='single' AND opened_at_ms IS NULL AND unopened_until_ms>?
    RETURNING iv, ciphertext, duration_seconds AS durationSeconds`)
    .bind(r.id,now).first();
  if (single) {
    const reportToken=await makeReceipt(db,r.id,'single',single.durationSeconds,single.iv,single.ciphertext);
    return answer({ok:true,mode:'single',iv:single.iv,ciphertext:single.ciphertext,
      durationSeconds:single.durationSeconds,deadlineAt:now+single.durationSeconds*1000,
      serverNow:Date.now(),reportToken});
  }

  // 여러 명 열람: 첫 실제 열람 요청이 하나의 공통 만료 시각을 설정.
  await db.prepare(`UPDATE letters_v10
    SET opened_at_ms=?, expires_at_ms=? + duration_seconds*1000
    WHERE id=? AND mode='group' AND opened_at_ms IS NULL AND unopened_until_ms>?`)
    .bind(now,now,r.id,now).run();
  const group = await db.prepare(`SELECT iv,ciphertext,expires_at_ms AS deadlineAt,
    duration_seconds AS durationSeconds FROM letters_v10
    WHERE id=? AND mode='group' AND opened_at_ms IS NOT NULL AND expires_at_ms>?`)
    .bind(r.id,Date.now()).first();
  if (!group) return answer({error:'편지가 만료되었거나 이미 열렸습니다.',code:'UNAVAILABLE'},410);
  const reportToken=await makeReceipt(db,r.id,'group',group.durationSeconds,group.iv,group.ciphertext);
  return answer({ok:true,mode:'group',iv:group.iv,ciphertext:group.ciphertext,
    durationSeconds:group.durationSeconds,deadlineAt:group.deadlineAt,serverNow:Date.now(),reportToken});
}

async function statusOf(db,r) {
  if(!idOK(r.id))return answer({error:'잘못된 편지 주소입니다.'},400);
  const now=Date.now();
  // 상태만 확인하고 암호문은 반환하지 않으며 1회 열람을 차감하지 않습니다.
  const row=await db.prepare(`SELECT id FROM letters_v10 WHERE id=? AND
    ((opened_at_ms IS NULL AND unopened_until_ms>?) OR
     (mode='group' AND expires_at_ms>?))`).bind(r.id,now,now).first();
  return answer({available:!!row});
}

async function report(db,r) {
  if(!idOK(r.id)||typeof r.reportToken!=='string'||!/^[0-9a-f]{48}$/.test(r.reportToken)||
     !partOK(r.key,43,43)||!['single','group'].includes(r.mode)||
     !Number.isInteger(r.durationSeconds)||r.durationSeconds<1||r.durationSeconds>MAX_DURATION||
     !partOK(r.iv,16,16)||!partOK(r.ciphertext,24,8192)) {
    return answer({error:'증거 보관 요청 형식이 올바르지 않습니다.'},400);
  }
  // 신고자가 제출한 키가 실제 암호문을 복호화하는지 검증합니다.
  // 신고된 편지에 한해서만 Worker 메모리에서 일시적으로 검증하며 원문은 저장하지 않습니다.
  try {
    const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),ch=>ch.charCodeAt(0));
    const bytes=decode(r.key),iv=decode(r.iv),cipher=decode(r.ciphertext);
    if(bytes.length!==32||iv.length!==12||cipher.length<17||cipher.length>6144)throw Error('length');
    const cryptoKey=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['decrypt']);
    bytes.fill(0);
    const additionalData=new TextEncoder().encode('secret-letter-v10|'+r.id+'|'+r.mode+'|'+r.durationSeconds);
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData},cryptoKey,cipher);
    new Uint8Array(plaintext).fill(0);
  } catch {
    return answer({error:'증거 암호키가 원본 편지와 일치하지 않습니다.'},400);
  }
  const fingerprint=await digestText(JSON.stringify([r.id,r.mode,r.durationSeconds,r.iv,r.ciphertext]));
  const tokenHash=await digestText(r.reportToken);
  // 열람 시 발급한 일회용 수령증으로 제출된 암호문이 실제 발급한 암호문과 일치하는지 확인합니다.
  const receipt=await db.prepare('DELETE FROM report_receipts_v10 WHERE token_hash=? AND id=? AND fingerprint=? AND expires_at_ms>? RETURNING id')
    .bind(tokenHash,r.id,fingerprint,Date.now()).first();
  if(!receipt)return answer({error:'보관 신청 시간이 지나거나 권한이 없습니다.'},403);
  const now=Date.now();
  await db.prepare('INSERT OR IGNORE INTO reports_v10 (id,mode,duration_seconds,iv,ciphertext,reader_key,reported_at_ms,delete_after_ms) VALUES (?,?,?,?,?,?,?,?)')
    .bind(r.id,r.mode,r.durationSeconds,r.iv,r.ciphertext,r.key,now,now+REPORT_RETENTION_MS).run();
  // 원문/키 조회용 공개 엔드포인트는 만들지 않습니다. 적법한 요청은 별도 절차로 검토합니다.
  return answer({ok:true,reportId:r.id,retentionDays:30},201);
}
async function cleanup(db) {
  const now = Date.now();
  await db.prepare(`DELETE FROM letters_v10
    WHERE (opened_at_ms IS NULL AND unopened_until_ms<=?)
       OR (opened_at_ms IS NOT NULL AND expires_at_ms<=?)`)
    .bind(now,now).run();
  await db.prepare('DELETE FROM report_receipts_v10 WHERE expires_at_ms<=?').bind(now).run();
  await db.prepare('DELETE FROM reports_v10 WHERE delete_after_ms<=?').bind(now).run();
  await db.prepare('DELETE FROM request_limits_v10 WHERE expires_at_ms<=?').bind(now).run();
}

export default {
  async fetch(request, env) {
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:HEADERS});
    const p = new URL(request.url).pathname.replace(/\/$/,'');
    try {
      if (request.method==='GET' && (p==='' || /^\/[ls]\/[A-Za-z0-9_-]{24}$/.test(p))) return landingResponse();
      if (p==='/v11/health' && request.method==='GET') {
        return answer({ok:secureReady(env),service:'secret-letter-v11',storage:secureReady(env)?'r2-delete':'not-configured'},secureReady(env)?200:503);
      }
      if (p==='/v11/create' || p==='/v11/open') {
        // Never silently downgrade to v10/D1 ciphertext storage.
        if(!secureReady(env))return answer({error:'고급 소멸 저장소(R2)가 아직 연결되지 않았습니다.'},503);
        if(request.method!=='POST')return answer({error:'POST만 허용합니다.'},405);
        await secureTable(env.DB);
        const input=await readBody(request);
        return p==='/v11/create'
          ?await secureCreate(env.DB,env.PRIVATE_BLOBS,input)
          :await secureOpen(env.DB,env.PRIVATE_BLOBS,input);
      }
      if (!env.DB) return answer({error:'D1 DB 바인딩이 없습니다.'},503);
      if (p!=='/v10/health' && p!=='/v10/create' && p!=='/v10/open' && p!=='/v10/status' && p!=='/v10/report') return answer({error:'없는 경로입니다.'},404);
      await ensureSchema(env.DB);
      if (p==='/v10/health' && request.method==='GET') return answer({ok:true,service:'secret-letter-v10',reportRetentionDays:30});
      if (request.method!=='POST') return answer({error:'없는 경로입니다.'},404);
      const data=await readBody(request);
      const limit=await throttle(env.DB,request,p);
      if(limit)return limit;
      if (p==='/v10/create') return await create(env.DB,data);
      if (p==='/v10/open') return await open(env.DB,data);
      if (p==='/v10/status') return await statusOf(env.DB,data);
      if (p==='/v10/report') return await report(env.DB,data);
      return answer({error:'없는 경로입니다.'},404);
    } catch(e) {
      if (e instanceof SyntaxError || e instanceof Error && /JSON 요청|잘못된 요청|요청이 너무/.test(e.message)) {
        return answer({error:'요청 형식 오류입니다.'},400);
      }
      console.error('Worker error',e?.name, e?.message);
      return answer({error:'서버 오류: DB 연결 및 배포 설정을 확인해 주세요.'},500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async()=>{
      await ensureSchema(env.DB);
      await cleanup(env.DB);
      if (secureReady(env)) {
        await secureTable(env.DB);
        await secureCleanup(env.DB,env.PRIVATE_BLOBS);
      }
    })());
  },
};
