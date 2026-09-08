import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['build.mjs'],{stdio:'inherit'});
await mkdir('ios/GuluGarden/Web',{recursive:true});
await cp('dist','ios/GuluGarden/Web',{recursive:true});
await cp('ios/GuluGarden/iphone.css','ios/GuluGarden/Web/iphone.css');
let game=await readFile('ios/GuluGarden/Web/game.js','utf8');
game=game.replace('第 1 波！试试敲 A 放激光 🌈','第 1 波！选择大招，完成英语练习 🌈');
game=game.replace('requestMicrophone(){','requestMicrophone(){\n    if(window.GuluNative)return GuluNative.authorize().then(()=>({getTracks:()=>[]}));');
await writeFile('ios/GuluGarden/Web/game.js',game);
let mobile=await readFile('ios/GuluGarden/Web/mobile.js','utf8');
mobile=mobile.replace('const phone=isPhone(root);','const phone=Boolean(root.GuluNative)||isPhone(root);');
await writeFile('ios/GuluGarden/Web/mobile.js',mobile);

let html=await readFile('ios/GuluGarden/Web/index.html','utf8');
html=html.replace('鼠标瞄准，按住就能突突突。','自动射击守住小院，点击大招开始练习。').replace('敲字母放大招，每波选卡变强！','用下方英文键盘输入，或按住麦克风朗读。');
await writeFile('ios/GuluGarden/Web/index.html',html);
