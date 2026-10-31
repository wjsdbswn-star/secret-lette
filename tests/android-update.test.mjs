import test from 'node:test';
import assert from 'node:assert/strict';
import {canUpdate} from '../scripts/check_android_update.mjs';
const previous={id:'com.secretletter.prototype',versionCode:1,certificate:'a'.repeat(64)};
test('기존 앱 ID와 서명이 같고 버전이 올라간 APK만 업데이트로 인정한다',()=>{
 assert.equal(canUpdate(previous,{...previous,versionCode:10014}),true);
 assert.equal(canUpdate(previous,{...previous}),true);
 assert.equal(canUpdate(previous,{...previous,certificate:'b'.repeat(64),versionCode:10014}),false);
 assert.equal(canUpdate(previous,{...previous,id:'another.app',versionCode:10014}),false);
 assert.equal(canUpdate({...previous,versionCode:10013},{...previous,versionCode:1}),false);
 assert.equal(canUpdate({id:'x'}, {id:'x'}),false);
});
