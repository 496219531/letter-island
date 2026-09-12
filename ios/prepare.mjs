import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import sound from '../sound.js';
execFileSync(process.execPath,['build.mjs'],{stdio:'inherit'});
await mkdir('ios/GuluGarden/Web',{recursive:true});
await cp('dist','ios/GuluGarden/Web',{recursive:true});
await cp('ios/GuluGarden/iphone.css','ios/GuluGarden/Web/iphone.css');
await mkdir('ios/GuluGarden/Web/sfx',{recursive:true});
for(const kind of [...Object.keys(sound.SPECS),'ui'])for(let variant=0;variant<3;variant++){
  const rate=sound.RATE;
  const data=kind==='ui'?Float32Array.from({length:Math.round(rate*.12)},(_,i)=>{const t=i/rate,p=i/(rate*.12);return Math.sin(2*Math.PI*[659,784,880][variant]*t)*Math.min(1,t/.003)*Math.exp(-t*35)*Math.pow(Math.max(0,1-p),1.5)*.65;}):sound.samples(kind,variant);
  const wav=Buffer.alloc(44+data.length*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(data.length*2,40);
  data.forEach((value,i)=>wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+i*2));
  await writeFile(`ios/GuluGarden/Web/sfx/${kind}-${variant}.wav`,wav);
}
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
