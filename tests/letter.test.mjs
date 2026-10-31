import test from 'node:test';
import assert from 'node:assert/strict';
import {encryptLetter,decryptLetter,buildShareLink,parseIncomingLink} from '../mobile/src/letter.js';
const web='https://aa4cef21.secret-letter-web-wjsdbswn.pages.dev/';
test('암호화→복호화: 한글·이모지 및 짧은 URL, 서버에는 키/원문 불포함',async()=>{
 const original='비밀편지 내용 👋'.repeat(40), x=await encryptLetter(original,'single',30);
 const link=buildShareLink(web,x.id,x.key);
 assert.ok(link.length<160,`링크 길이 ${link.length}`);
 assert.ok(!link.includes(original));
 const apiPayload={id:x.id,mode:x.mode,seconds:x.seconds,iv:x.iv,ciphertext:x.ciphertext};
 assert.ok(!JSON.stringify(apiPayload).includes(original));
 assert.ok(!JSON.stringify(apiPayload).includes(x.key));
 assert.deepEqual(parseIncomingLink(link,web),{id:x.id,key:x.key});
 assert.deepEqual(parseIncomingLink('secretletter://open/'+x.id+'#k='+x.key,web),{id:x.id,key:x.key});
 assert.equal(await decryptLetter({mode:x.mode,durationSeconds:x.seconds,iv:x.iv,ciphertext:x.ciphertext},x.key,x.id),original);
});
test('열쇠가 틀리거나 암호문이 변경되면 복호화 거절',async()=>{
 const a=await encryptLetter('원본','group',120);const b=await encryptLetter('다른 편지','single',30);
 const row={mode:a.mode,durationSeconds:a.seconds,iv:a.iv,ciphertext:a.ciphertext};
 await assert.rejects(()=>decryptLetter(row,b.key,a.id));
 await assert.rejects(()=>decryptLetter({...row,durationSeconds:10},a.key,a.id));
 await assert.rejects(()=>decryptLetter({...row,ciphertext:(a.ciphertext[0]==='A'?'B':'A')+a.ciphertext.slice(1)},a.key,a.id));
});
test('비밀편지 URL은 키 없는 경우 거절',async()=>{
 const a=await encryptLetter('A','single',60);
 assert.throws(()=>parseIncomingLink(web+'l/'+a.id,web));
 assert.throws(()=>parseIncomingLink('https://evil.example/l/'+a.id+'#k='+a.key,web));
});
test('새 공유 링크는 #k 해시태그를 만들지 않으며 이전 수신 방식과 호환된다',async()=>{
 const a=await encryptLetter('해시태그로 나뉘지 않는 링크','single',60);
 const link=buildShareLink(web,a.id,a.key),url=new URL(link);
 assert.equal(url.search,'');assert.equal(url.pathname,'/l/'+a.id);assert.equal(url.hash,'#?k='+a.key);
 assert.doesNotMatch(link,/#[\p{L}\p{N}_]+/u);
 assert.equal(new URLSearchParams(url.hash.slice(1)).get('k'),a.key,'이전 버전의 수신 파서도 새 링크를 읽는다');
 assert.deepEqual(parseIncomingLink(link,web),{id:a.id,key:a.key});
 assert.deepEqual(parseIncomingLink(link.replace('#?k=','#k='),web),{id:a.id,key:a.key});
});
