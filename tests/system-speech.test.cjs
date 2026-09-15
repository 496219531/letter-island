const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLocalSpeech}=require('../system-speech.js');
test('demonstrations use only installed local English voices',()=>{
  const spoken=[],voices=[{lang:'en-US',localService:false},{lang:'zh-CN',localService:true},{lang:'en-GB',localService:true}];
  const synth={getVoices:()=>voices,cancel(){},speak(u){spoken.push(u);}};
  class Utterance{constructor(text){this.text=text;}}
  const service=createLocalSpeech(synth,Utterance);assert.ok(service.available());assert.ok(service.speak('Hello'));
  assert.equal(spoken[0].voice,voices[2]);assert.equal(spoken[0].text,'Hello');assert.equal(spoken[0].lang,'en-GB');
  voices.splice(2,1);assert.equal(service.available(),false);assert.equal(service.speak('Hello'),false);assert.equal(spoken.length,1);
});
test('voice availability can update after system voice loading and cancellation stops playback',()=>{
  let voices=[],cancelled=0;
  const synth={getVoices:()=>voices,cancel(){cancelled++;},speak(){}};
  const service=createLocalSpeech(synth,class{});assert.equal(service.available(),false);
  voices=[{lang:'en-US',localService:true}];assert.equal(service.available(),true);service.speak('Hello');service.cancel();assert.equal(cancelled,2);
  assert.equal(createLocalSpeech(undefined,undefined).available(),false);
});
test('each completed repetition queues English then Chinese without cutting off earlier speech',()=>{
 const spoken=[];let cancelled=0;const voices=[{lang:'en-US',localService:true},{lang:'zh-CN',localService:true}];
 const service=createLocalSpeech({getVoices:()=>voices,cancel(){cancelled++;},speak(u){spoken.push(u);}},class{constructor(text){this.text=text;}});
 for(let i=0;i<3;i++)assert.ok(service.enqueueLearning('Apple','苹果',{volume:.4}));
 assert.deepEqual(spoken.map(u=>u.text),['Apple','苹果','Apple','苹果','Apple','苹果']);assert.equal(cancelled,0);
 assert.deepEqual(spoken.slice(0,2).map(u=>u.lang),['en-US','zh-CN']);assert.ok(spoken.every(u=>u.volume===.4));
 service.enqueueLearning('I like apples.','我喜欢苹果',{chinese:false});assert.equal(spoken.at(-1).text,'I like apples.');assert.equal(spoken.length,7);
 service.cancel();assert.equal(cancelled,1);
});
test('missing local Chinese voice falls back to English and reports the limitation',()=>{
 const spoken=[],errors=[];const service=createLocalSpeech({getVoices:()=>[{lang:'en-US',localService:true},{lang:'zh-CN',localService:false}],cancel(){},speak(u){spoken.push(u);}},class{});
 assert.ok(service.enqueueLearning('Apple','苹果',{onError:e=>errors.push(e)}));assert.equal(spoken.length,1);assert.deepEqual(errors,['missing-chinese']);
});
test('engine emits immutable learning text once per completed pass, before changing prompts',()=>{
 const {GardenGame}=require('../engine.js');const events=[];
 const g=new GardenGame({random:()=>.4,emit:(type,data)=>{if(type==='practice-complete')events.push(data);}});
 g.learningMode='english';g.maxLearningLoad=3;g.pickLearningCode=()=> 'APPLE';g.start();g.wave=7;g.select(1);
 g.input('Z');g.input('A');assert.equal(events.length,0);for(const c of 'PPLEAPPLEAPPLE')g.input(c);
 assert.equal(events.length,3);assert.deepEqual(events.map(e=>e.repeat),[1,2,3]);assert.ok(events.every(e=>e.code==='APPLE'&&e.meaning==='苹果'));assert.ok(g.skills[1].cd>0);
 const sentence=new GardenGame({emit:(type,data)=>{if(type==='practice-complete')events.push(data);}});sentence.learningMode='sentences';sentence.start();sentence.select(1);
 const code=sentence.skills[1].code;for(const c of code)sentence.input(c);assert.equal(events.length,4);assert.equal(events[3].code,code);assert.ok(events[3].meaning);
});
