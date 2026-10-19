// 비밀편지 v10: Cloudflare Worker + D1.
// 개인 신원 인증 없음. URL(특히 #k=...)은 링크를 가진 사람에게 읽기 권한을 줍니다.
// 서버에는 iv, ciphertext, 랜덤 ID와 소멸 메타데이터만 저장합니다.
const MAX_DURATION = 30 * 86400 + 23 * 3600 + 59 * 60 + 59;
const UNOPENED_MS = 30 * 86400 * 1000;
const MAX_BODY_BYTES = 16384;
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
  if (single) return answer({ok:true,mode:'single',iv:single.iv,ciphertext:single.ciphertext,
    durationSeconds:single.durationSeconds,deadlineAt:now+single.durationSeconds*1000,serverNow:Date.now()});

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
  return answer({ok:true,mode:'group',iv:group.iv,ciphertext:group.ciphertext,
    durationSeconds:group.durationSeconds,deadlineAt:group.deadlineAt,serverNow:Date.now()});
}

async function cleanup(db) {
  const now = Date.now();
  await db.prepare(`DELETE FROM letters_v10
    WHERE (opened_at_ms IS NULL AND unopened_until_ms<=?)
       OR (opened_at_ms IS NOT NULL AND expires_at_ms<=?)`)
    .bind(now,now).run();
}

export default {
  async fetch(request, env) {
    if (request.method==='OPTIONS') return new Response(null,{status:204,headers:HEADERS});
    const p = new URL(request.url).pathname.replace(/\/$/,'');
    try {
      if (!env.DB) return answer({error:'D1 DB 바인딩이 없습니다.'},503);
      if (p === '/v10/health' && request.method==='GET') {
        await env.DB.prepare('SELECT id FROM letters_v10 LIMIT 0').all();
        return answer({ok:true,service:'secret-letter-v10'});
      }
      if (request.method!=='POST') return answer({error:'없는 경로입니다.'},404);
      const data=await readBody(request);
      if (p==='/v10/create') return await create(env.DB,data);
      if (p==='/v10/open') return await open(env.DB,data);
      return answer({error:'없는 경로입니다.'},404);
    } catch(e) {
      if (e instanceof SyntaxError || e instanceof Error && /JSON 요청|잘못된 요청|요청이 너무/.test(e.message)) {
        return answer({error:'요청 형식 오류입니다.'},400);
      }
      console.error('Worker error',e?.name, e?.message);
      return answer({error:'서버 오류: DB 연결 및 배포 설정을 확인해 주세요.'},500);
    }
  },
  async scheduled(controller, env, ctx) { ctx.waitUntil(cleanup(env.DB)); },
};
