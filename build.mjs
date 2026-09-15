import { mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['build-dialogues.mjs'], { stdio: 'inherit' });
for (const script of ['zombie-recorder.js', 'performance.js', 'custom-library.js', 'library-ui.js', 'speech-review.js', 'mode-copy.js', 'mobile.js', 'dialogues.js', 'build-dialogues.mjs', 'speech-bridge.mjs', 'press-to-talk.js', 'pcm-capture.js', 'system-speech.js', 'launch.mjs', 'game-ui.js', 'vocabulary.js', 'engine.js', 'save.js', 'sound.js', 'game.js', 'adventure.js', 'duel.cjs', 'lan-server.mjs', 'duel-client.js']) execFileSync(process.execPath, ['--check', script], { stdio: 'inherit' });
// Hosting uploads the complete dist directory, so always remove files left by
// older builds before assembling the deployable bundle.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const file of ['zombie-recorder.html', 'zombie-recorder.js', 'performance.js', 'performance.css', 'library.css', 'custom-library.js', 'library-ui.js', 'speech-review.js', 'mode-copy.js', 'mobile.js', 'mobile.css', 'index.html', 'dialogues.js', 'dialogue-guide.html', 'press-to-talk.js', 'pcm-capture.js', 'system-speech.js', 'immersive.css', 'game-ui.js', 'vocabulary.js', 'vocabulary-guide.html', 'licenses', 'styles.css', 'engine.js', 'save.js', 'sound.js', 'game.js', 'adventure.html', 'adventure.css', 'adventure.js', 'duel.html', 'duel.css', 'duel-client.js', 'assets']) {
  await cp(file, `dist/${file}`, { recursive: true });
}
// Reuse the tested App UI on phones; native-only controls stay hidden on the web.
const bridge=await readFile('ios/GuluGarden/bridge.js','utf8');
const begin=bridge.indexOf("  document.addEventListener('DOMContentLoaded',()=>{");
if(begin<0)throw new Error('Mobile shell entry point missing');
let mobileShell=bridge.slice(begin,bridge.lastIndexOf('\n})();'));
mobileShell=mobileShell.replace("document.body.classList.add('native-iphone');", "if(window.GuluNative||!window.GuluMobile?.active)return;document.body.classList.add('native-iphone','browser-phone');");
mobileShell=mobileShell.replaceAll('GuluNative.getScreenDirection','GuluWebOrientation.getScreenDirection').replaceAll('GuluNative.setScreenDirection','GuluWebOrientation.setScreenDirection');
mobileShell=mobileShell.replaceAll('竖屏（锁定）','竖屏').replaceAll('横屏（锁定）','横屏');
mobileShell=mobileShell.replace('手动选择后立即切换，转动手机不会自动改变方向。','直接切换游戏画面方向，无需浏览器方向锁定。');
mobileShell=mobileShell.replace('已锁定方向，下次打开会保留。','已切换屏幕方向。');
mobileShell=mobileShell.replace('选择横屏方向后使用；单词提示看板与键盘均为半透明。','横屏时使用；可切换右侧操作台或双拇指键盘。');
mobileShell=mobileShell.replace("const landscape=matchMedia('(orientation: landscape)');",'const landscape=GuluWebOrientation.landscape;');
mobileShell=mobileShell.replace("const home=document.getElementById('startScreen');", `const speechOption=document.querySelector('#difficulty option[value="speaking"]');if(speechOption&&(!window.isSecureContext||!(window.SpeechRecognition||window.webkitSpeechRecognition))){speechOption.disabled=true;speechOption.textContent='口语（当前浏览器暂不支持）';if(document.querySelector('#difficulty').value==='speaking'){document.querySelector('#difficulty').value='english';game.learningMode='english';updateTypingControls();}}document.querySelector('.start-panel>p').textContent='点选大招，输入提示中的词句，守住小院。';const home=document.getElementById('startScreen');`);
await writeFile('dist/mobile-app.js', '(function(){\n'+mobileShell+'\n})();\n');
let phoneCSS=await readFile('ios/GuluGarden/iphone.css','utf8');
const landscapeStart=phoneCSS.indexOf('@media(orientation:landscape){');
if(landscapeStart<0||!phoneCSS.trimEnd().endsWith('}'))throw new Error('Landscape style block missing');
const landscapeCSS=phoneCSS.slice(landscapeStart+'@media(orientation:landscape){'.length).trimEnd().slice(0,-1);
phoneCSS=phoneCSS.slice(0,landscapeStart)+landscapeCSS.replaceAll('body.native-iphone','body.native-iphone[data-web-direction="landscape"]');
await writeFile('dist/iphone.css',phoneCSS+'\n'+await readFile('web-layout.css','utf8'));
await cp('web-runtime.js','dist/web-runtime.js');
await cp('community.js','dist/community.js');
await cp('community.css','dist/community.css');
let html = await readFile('dist/index.html', 'utf8');
html=html.replace('</head>','<link rel="stylesheet" href="community.css"></head>');
html=html.replace('</body>','<script src="web-runtime.js"></script><script src="mobile-app.js"></script><script src="community.js"></script></body>');
await writeFile('dist/index.html',html);
let duelHTML=await readFile('dist/duel.html','utf8');duelHTML=duelHTML.replace('</head>','<link rel="stylesheet" href="community.css"></head>').replace('</body>','<script src="community.js"></script></body>');await writeFile('dist/duel.html',duelHTML);
if (!html.includes('id="startButton"') || !html.includes('lang="zh-CN"')) throw new Error('Missing game entry point');
// Image URLs change only when their content changes, allowing long-lived caching.
const imageVersions=new Map();
for(const name of await readdir('dist/assets'))if(name.endsWith('.png'))imageVersions.set('assets/'+name,createHash('sha256').update(await readFile('dist/assets/'+name)).digest('hex').slice(0,12));
for(const name of await readdir('dist'))if(/\.(js|css|html)$/.test(name)){
  const path='dist/'+name,text=await readFile(path,'utf8');
  await writeFile(path,text.replace(/assets\/[A-Za-z0-9_-]+\.png/g,value=>imageVersions.has(value)?value+'?v='+imageVersions.get(value):value));
}
console.log('Built Gulu Arcade into dist/');
