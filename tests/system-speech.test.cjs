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
