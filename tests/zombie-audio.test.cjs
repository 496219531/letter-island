const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenAudio,samples,LEVELS,CAPS}=require('../sound.js');
function tracker(){const audio=new GardenAudio(()=>{throw Error('Tracker should not create audio hardware');}),events=[];audio.play=(kind,args)=>events.push({kind,args});return {audio,events};}
function run(a,game,seconds){for(let i=0;i<seconds*60;i++)a.update(1/60,game);}
test('walking sounds stay quiet and globally sparse even for large crowds',()=>{
 const {audio,events}=tracker();const crowd={status:'playing',enemies:Array.from({length:100},(_,i)=>({hp:1,speed:20,x:500+i}))};
 run(audio,crowd,10);const steps=events.filter(e=>e.kind==='step');assert.ok(steps.length>=3&&steps.length<=8);const groans=events.filter(e=>e.kind==='groan');assert.ok(groans.length>=1&&groans.length<=2);assert.equal(events.length,steps.length+groans.length);
 assert.ok(LEVELS.step<LEVELS.shot/3);assert.equal(CAPS.step,1);
});
test('stationary/paused/muted/recording states do not produce ambient footsteps',()=>{
 for(const state of ['ready','paused','upgrade']){const {audio,events}=tracker();run(audio,{status:state,enemies:[{hp:1,speed:20,x:500}]},5);assert.equal(events.length,0);}
 for(const setting of ['enabled','volume','recording']){const {audio,events}=tracker();audio[setting]=setting==='recording'?true:setting==='volume'?0:false;run(audio,{status:'playing',enemies:[{hp:1,speed:20,x:500}]},5);assert.equal(events.length,0);}
 const {audio,events}=tracker();run(audio,{status:'playing',enemies:[{hp:0,speed:20,x:500},{hp:1,speed:0,x:500}]},5);assert.equal(events.length,0);
});
test('chewing is one shared channel and ice slows footstep cadence',()=>{
 const chew=tracker();run(chew.audio,{status:'playing',enemies:Array.from({length:80},()=>({hp:1,speed:20,x:194,eating:true}))},5);
 const bites=chew.events.filter(e=>e.kind==='nibble');assert.ok(bites.length>0&&bites.length<=9);assert.ok(chew.events.some(e=>e.kind==='groan'));
 const a=tracker(),b=tracker(),game={status:'playing',enemies:[{hp:1,speed:20,x:500}]};run(a.audio,game,12);run(b.audio,{...game,freeze:6},12);assert.ok(b.events.length<a.events.length);
});
test('new wave, footsteps and celebration samples are finite and distinct at the cached 22kHz rate',()=>{
 const clips=['horde','step','celebrate'].map(kind=>{const data=samples(kind,1,22050);assert.ok(data.every(Number.isFinite));assert.ok(data.some(v=>Math.abs(v)>.1));assert.ok(data.every(v=>Math.abs(v)<=.701));assert.equal(data[0],0);assert.equal(data.at(-1),0);return data;});
 assert.notEqual(clips[0].length,clips[1].length);assert.notEqual(clips[0].length,clips[2].length);
});
