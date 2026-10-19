import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../web/landing.js',import.meta.url),'utf8');
function simulate(pathname,hash){
  const callbacks={}; const elements={
    '#open':{disabled:true,addEventListener(evt,handler){callbacks[evt]=handler;}},
    '#copyLink':{disabled:true,addEventListener(evt,handler){callbacks['copy_'+evt]=handler;}},
    '#error':{textContent:''},
  };
  const location={pathname,hash,href:''};
  vm.runInNewContext(source,{location,document:{querySelector(s){return elements[s];}},URLSearchParams});
  return {elements,callbacks,location};
}
test('안내 웹페이지는 정상 링크에만 앱 열기 버튼을 활성화한다',()=>{
 const id='a'.repeat(24), key='b'.repeat(43);
 const site=simulate('/l/'+id,'#k='+key);
 assert.equal(site.elements['#open'].disabled,false);
 assert.equal(site.elements['#copyLink'].disabled,false);
 site.callbacks.click();
 assert.equal(site.location.href,'secretletter://open/'+id+'#k='+key);
});
test('잘못된 링크에서 앱 열기 버튼을 비활성화한다',()=>{
 const id='a'.repeat(24),site=simulate('/l/'+id,'');
 assert.equal(site.elements['#open'].disabled,true);
 assert.equal(site.elements['#copyLink'].disabled,true);
 assert.match(site.elements['#error'].textContent,/열쇠/);
});
