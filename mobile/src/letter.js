// WebCrypto를 사용합니다. 이 파일은 백엔드로 복호화 키를 보내지 않습니다.
const E = new TextEncoder();
const D = new TextDecoder();
export const MAX_SECONDS = 30*86400 + 23*3600 + 59*60 + 59;

export function toBase64Url(bytes) {
  let s=''; for (const b of bytes) s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function fromBase64Url(s) {
  if (typeof s!=='string' || s.length>8192 || !/^[\w-]+$/.test(s)) throw Error('잘못된 암호문 또는 열쇠입니다.');
  const a=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(a,c=>c.charCodeAt(0));
}
export function randomBytes(size) {return crypto.getRandomValues(new Uint8Array(size));}
const aad=(id,mode,ttl)=>E.encode(`secret-letter-v10|${id}|${mode}|${ttl}`);
export async function encryptLetter(content,mode,ttl) {
  if(typeof content!=='string' || !content.trim() || content.length>1600) throw Error('편지 내용을 1~1600자로 입력해 주세요.');
  if(!['single','group'].includes(mode) || !Number.isInteger(ttl) || ttl<1 || ttl>MAX_SECONDS) throw Error('설정한 시간이 올바르지 않습니다.');
  const id=toBase64Url(randomBytes(18)), secret=randomBytes(32), iv=randomBytes(12);
  const key=await crypto.subtle.importKey('raw',secret,{name:'AES-GCM'},false,['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(id,mode,ttl)},key,E.encode(content)));
  const result={id, key:toBase64Url(secret), mode, seconds:ttl, iv:toBase64Url(iv), ciphertext:toBase64Url(ct)};
  secret.fill(0);
  return result;
}
export async function decryptLetter(record,secretString,id) {
  if(record?.mode!=='single' && record?.mode!=='group') throw Error('편지의 열람 방식이 잘못되었습니다.');
  if(!Number.isInteger(record.durationSeconds) || record.durationSeconds<1 || record.durationSeconds>MAX_SECONDS) throw Error('편지의 유효기간이 잘못되었습니다.');
  const secret=fromBase64Url(secretString),iv=fromBase64Url(record.iv),ct=fromBase64Url(record.ciphertext);
  if(secret.length!==32 || iv.length!==12 || ct.length<17 || ct.length>6144) throw Error('암호문 또는 열쇠 형식이 올바르지 않습니다.');
  const key=await crypto.subtle.importKey('raw',secret,{name:'AES-GCM'},false,['decrypt']);
  secret.fill(0);
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad(id,record.mode,record.durationSeconds)},key,ct);
  const plaintext=D.decode(raw);
  new Uint8Array(raw).fill(0);
  return plaintext;
}
export function buildShareLink(webBase,id,key) {
  const u=new URL(webBase);
  if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/') throw Error('웹 주소 설정이 올바르지 않습니다.');
  if(!/^[\w-]{24}$/.test(id)||fromBase64Url(key).length!==32)throw Error('링크 데이터가 잘못되었습니다.');
  // '?' keeps '#k' from becoming a hashtag; legacy URLSearchParams readers accept both.
  return `${u.origin}/l/${id}#?k=${key}`;
}
export function parseIncomingLink(raw, webBase) {
  const url=new URL(raw), expected=new URL(webBase), isWeb=url.protocol==='https:'&&url.origin===expected.origin;
  const isScheme=url.protocol==='secretletter:'&&url.hostname==='open';
  if(!isWeb&&!isScheme)throw Error('비밀편지 주소가 아닙니다.');
  const match=url.pathname.match(isWeb ? /^\/l\/([\w-]{24})\/?$/ : /^\/([\w-]{24})\/?$/);
  if(!match)throw Error('편지 번호를 확인해 주세요.');
  const parts=new URLSearchParams(url.hash.slice(1));
  const secret=parts.get('k');
  if(!secret||fromBase64Url(secret).length!==32)throw Error('편지 열쇠가 없는 링크입니다.');
  return {id:match[1],key:secret};
}

