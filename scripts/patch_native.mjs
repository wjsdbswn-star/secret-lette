/** npx cap add android / ios 후 한 번 실행하세요. Custom URL Scheme을 등록합니다.
 * 유니버설 링크/앱 링크 도메인 인증은 개발자 계정/서명 지문에 맞게 별도 설정합니다.
 */
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const base=resolve(process.cwd(),'mobile');
const android=resolve(base,'android/app/src/main/AndroidManifest.xml');
const gradle=resolve(base,'android/app/build.gradle');
const ios=resolve(base,'ios/App/App/Info.plist');
if(existsSync(gradle)){
  const version=JSON.parse(readFileSync(resolve(base,'package.json'),'utf8')).version;
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('앱 버전 형식이 올바르지 않습니다.');
  const [major,minor,patch]=version.split('.').map(Number);
  if(minor>999||patch>999)throw Error('앱 버전 범위가 올바르지 않습니다.');
  const code=major*1000000+minor*1000+patch;
  if(code<1||code>2100000000)throw Error('Android 버전 코드 범위가 올바르지 않습니다.');
  const content=readFileSync(gradle,'utf8').replace(/versionCode\s+\d+/,'versionCode '+code).replace(/versionName\s+"[^"]*"/,'versionName "'+version+'"');
  writeFileSync(gradle,content);console.log('Android 앱 업데이트 버전 설정: '+version+' ('+code+')');
}
if(existsSync(android)){
  let content=readFileSync(android,'utf8');
  if(!content.includes('android:scheme="secretletter"')){
    const insert=`\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="secretletter" android:host="open" />\n                <data android:scheme="secretletter" android:host="sent" />\n                <data android:scheme="secretletter" android:host="compose" />\n            </intent-filter>\n`;
    const idx=content.indexOf('</activity>');
    if(idx<0)throw Error('AndroidManifest.xml에 activity가 없습니다.');
    content=content.slice(0,idx)+insert+content.slice(idx);
    writeFileSync(android,content);console.log('Android custom scheme 등록');
  }
  if(!content.includes('android:host="compose"')){
    content=content.replace(/(<data android:scheme="secretletter"[^>]*\/>)/,'$1\n                <data android:scheme="secretletter" android:host="compose" />');
    writeFileSync(android,content);
  }
}
if(existsSync(ios)){
  let content=readFileSync(ios,'utf8');
  if(!content.includes('<string>secretletter</string>')){
    const insert=`  <key>CFBundleURLTypes</key>\n  <array><dict><key>CFBundleURLSchemes</key><array><string>secretletter</string></array></dict></array>\n`;
    const idx=content.lastIndexOf('</dict>');
    if(idx<0)throw Error('Info.plist의 dict를 찾지 못했습니다.');
    content=content.slice(0,idx)+insert+content.slice(idx);
    writeFileSync(ios,content);console.log('iOS custom scheme 등록');
  }
}
console.log('이미 등록한 플랫폼은 건너뜁니다.');
