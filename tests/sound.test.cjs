const assert=require('node:assert/strict');const {GardenAudio,samples,SPECS,CAPS,LEVELS,RATE}=require('../sound.js');
for(const kind of Object.keys(SPECS))for(let v=0;v<3;v++){
 const a=samples(kind,v);assert.ok(a.length>0);assert.ok(a.every(Number.isFinite));assert.ok(a.some(x=>Math.abs(x)>.01));assert.ok(a.every(x=>Math.abs(x)<=.701));assert.equal(a[0],0);assert.equal(a.at(-1),0);
 const rms=Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);assert.ok(rms<.34,kind+' sustained level too high');
}
assert.notDeepEqual(samples('metal'),samples('flesh'));assert.notDeepEqual(samples('groan',0),samples('groan',1));
// Frequently repeated effects should not contain a sustained sub-bass voice.
for(const kind of ['shot','flesh','kill','nibble']){
 const a=samples(kind,1);let low=0,total=0,bass=0;const alpha=1-Math.exp(-2*Math.PI*150/RATE);
 for(const x of a){low+=alpha*(x-low);total+=x*x;bass+=low*low;}
 assert.ok(bass/total<.16,kind+' has excessive bass');
}
let contexts=0,connections=0;const sources=[],gains=[];const node=()=>({connect(){connections++;},disconnect(){connections--;}});
const fake={currentTime:0,state:'running',destination:{},createGain(){const g={...node(),gain:{value:0}};gains.push(g);return g;},createDynamicsCompressor:()=>({...node(),threshold:{value:0},ratio:{value:0},knee:{value:0},attack:{value:0},release:{value:0}}),createStereoPanner:()=>({...node(),pan:{value:0}}),createBuffer:(_,size)=>({getChannelData:()=>new Float32Array(size)}),createBufferSource(){const s={...node(),start(){},stop(){}};sources.push(s);return s;}};
const a=new GardenAudio(()=>{contexts++;return fake;});for(let i=0;i<1000;i++)a.play('flesh');assert.equal(sources.length,1);
for(let i=0;i<100;i++){fake.currentTime+=1;a.play('metal');}assert.equal([...a.voices].filter(v=>v.kind==='metal').length,CAPS.metal);
for(let i=0;i<100;i++){fake.currentTime+=1;a.tone(800);}assert.equal(a.voices.size,32);assert.equal(contexts,1);assert.ok(a.cache.size<=6);
a.setEnabled(false);assert.equal(a.voices.size,0);assert.equal(connections,2);a.play('boss');assert.equal(a.voices.size,0);
a.setEnabled(true);a.setVolume(.25);assert.equal(a.master.gain.value,.25*.65);a.setVolume(NaN);assert.equal(a.volume,.25);a.setVolume(2);assert.equal(a.volume,1);
fake.currentTime+=10;a.play('laser');a.play('shot');assert.equal(gains.at(-1).gain.value,LEVELS.shot*.5);a.stop();assert.equal(connections,2);
const g={status:'playing',freeze:0,enemies:[{hp:1,x:400}]};for(let i=0;i<20;i++)a.update(10,g);assert.equal(a.voices.size,0,'ambient growls should not restart');
a.setVolume(0);a.play('shot');a.tone(800);assert.equal(a.voices.size,0);a.setVolume(.6);fake.currentTime+=10;a.play('kill');sources.at(-1).onended();assert.equal(a.voices.size,0);assert.equal(connections,2);
console.log('PASS 45 sound variants: no clipping, smooth edges, reduced bass, per-event limits, voice cleanup, volume, spell mix and quiet idle.');

// Recording gain is temporary and preserves volume changes and mute state.
a.setVolume(.8);a.setRecording(true);assert.equal(a.volume,.8);assert.ok(Math.abs(a.master.gain.value-.8*.65*.15)<1e-9);
a.setVolume(.4);assert.ok(Math.abs(a.master.gain.value-.4*.65*.15)<1e-9);
a.setRecording(false);assert.equal(a.master.gain.value,.4*.65);
a.setEnabled(false);a.setRecording(true);a.setRecording(false);assert.equal(a.enabled,false);
a.setEnabled(true);a.setVolume(0);a.setRecording(true);a.setRecording(false);assert.equal(a.master.gain.value,0);
const cold=new GardenAudio(()=>fake);cold.setRecording(true);cold.init();assert.equal(cold.master.gain.value,.6*.65*.15);cold.setRecording(false);assert.equal(cold.master.gain.value,.6*.65);
console.log('PASS recording ducking, lazy initialization, volume changes and mute preservation');
