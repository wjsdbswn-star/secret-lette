// 보낸 사람 전용 임시 확인 기록. 평문은 저장하지 않습니다.
// 암호문과 키를 함께 기기에 두므로 장기 보관하지 않고 15분 후 앱 재실행/조회 시 정리합니다.
export const SENT_PREVIEW_MS=15*60*1000;
const STORAGE_KEY='secretletter-sent-preview-v1';
const VALID_ID=/^[A-Za-z0-9_-]{24}$/;
function prune(storage,now){
  let arr=[];
  try{const parsed=JSON.parse(storage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))arr=parsed;}catch{}
  arr=arr.filter(x=>x&&VALID_ID.test(x.id)&&Number.isFinite(x.createdAt)&&x.createdAt<=now&&now-x.createdAt<SENT_PREVIEW_MS).slice(-5);
  if(arr.length)storage.setItem(STORAGE_KEY,JSON.stringify(arr));
  else storage.removeItem(STORAGE_KEY);
  return arr;
}
export function rememberSent(encrypted,storage=localStorage,now=Date.now()){
  if(!VALID_ID.test(encrypted?.id)||typeof encrypted?.key!=='string'||typeof encrypted?.ciphertext!=='string')throw Error('저장할 편지 형식이 올바르지 않습니다.');
  const arr=prune(storage,now).filter(x=>x.id!==encrypted.id);
  arr.push({id:encrypted.id,key:encrypted.key,iv:encrypted.iv,ciphertext:encrypted.ciphertext,mode:encrypted.mode,seconds:encrypted.seconds,createdAt:now});
  storage.setItem(STORAGE_KEY,JSON.stringify(arr.slice(-5)));
}
export function lookupSent(id,storage=localStorage,now=Date.now()){
  if(!VALID_ID.test(id))return null;
  return prune(storage,now).find(x=>x.id===id)||null;
}
export function forgetSent(id,storage=localStorage,now=Date.now()){
  const arr=prune(storage,now).filter(x=>x.id!==id);
  if(arr.length)storage.setItem(STORAGE_KEY,JSON.stringify(arr));else storage.removeItem(STORAGE_KEY);
}
export function parseSentDeepLink(raw){
  try{const u=new URL(raw);if(u.protocol!=='secretletter:'||u.hostname!=='sent'||u.search||u.hash)return null;const id=u.pathname.slice(1);return VALID_ID.test(id)?id:null;}catch{return null;}
}
