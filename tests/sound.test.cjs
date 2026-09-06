const assert=require('node:assert/strict');const {GardenAudio,samples,SPECS}=require('../sound.js');
for(const kind of Object.keys(SPECS))for(let v=0;v<3;v++){const a=samples(kind,v);assert.ok(a.length>0);assert.ok(a.every(Number.isFinite));assert.ok(a.some(x=>Math.abs(x)>.01));assert.ok(a.every(x=>Math.abs(x)<1));assert.ok(Math.abs(a.at(-1))<.001);}
assert.notDeepEqual(samples('metal'),samples('flesh'));assert.notDeepEqual(samples('groan',0),samples('groan',1));
let contexts=0,connections=0;const sources=[];const node=()=>({connect(){connections++;},disconnect(){connections--;}});
const fake={currentTime:0,state:'running',destination:{},createGain:()=>({...node(),gain:{value:0}}),createDynamicsCompressor:()=>({...node(),threshold:{value:0},ratio:{value:0}}),createStereoPanner:()=>({...node(),pan:{value:0}}),createBuffer:(_,size)=>({getChannelData:()=>new Float32Array(size)}),createBufferSource(){const s={...node(),start(){},stop(){}};sources.push(s);return s;}};
const a=new GardenAudio(()=>{contexts++;return fake;});for(let i=0;i<1000;i++)a.play('flesh');assert.equal(sources.length,1);
for(let i=0;i<100;i++){fake.currentTime+=1;a.play('metal');}assert.equal(a.voices.size,32);assert.equal(contexts,1);assert.ok(a.cache.size<=6);
a.setEnabled(false);assert.equal(a.voices.size,0);assert.equal(connections,2);a.play('boss');assert.equal(a.voices.size,0);a.setEnabled(true);fake.currentTime+=10;a.play('groan');assert.equal(a.voices.size,1);sources.at(-1).onended();assert.equal(a.voices.size,0);assert.equal(connections,2);
const g={status:'paused',freeze:0,enemies:[{hp:1,x:400}]};a.update(10,g);assert.equal(a.voices.size,0);g.status='playing';g.freeze=2;a.update(10,g);assert.equal(a.voices.size,0);g.freeze=0;fake.currentTime+=10;a.update(10,g);assert.equal(a.voices.size,1);a.stop();assert.equal(connections,2);
console.log('PASS 45 distinct sound variants bounded and finite; event rate limits, 32 voice cap, mute/end cleanup and pause/freeze ambient silence.');
