const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPressToTalk,createVoicePermissions,encodeWav}=require('../press-to-talk.js');
const reply=value=>({ok:true,json:async()=>value});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('press records, release stops the microphone before recognition, and returns the captured target',async()=>{
  const recognition=deferred(),events=[],results=[];let stops=0;
  const mic=createPressToTalk({capture:async()=>({stop(){stops++;return encodeWav([new Float32Array(16000)],16000);}}),request:async path=>path.endsWith('authorize')?reply({ok:true}):recognition.promise,onState:s=>events.push(s),onResult:(text,target)=>results.push({text,target})});
  await mic.start({index:2,code:'HELLO'});assert.equal(mic.phase,'recording');assert.equal(stops,0);
  const pending=mic.release();assert.equal(stops,1);assert.equal(mic.phase,'recognizing');mic.release();assert.equal(stops,1);
  recognition.resolve(reply({text:'Hello'}));await pending;assert.deepEqual(results,[{text:'Hello',target:{index:2,code:'HELLO'}}]);assert.deepEqual(events,['preparing','recording','recognizing','idle']);
});
test('releasing before system authorization completes never starts delayed recording',async()=>{
  const authorization=deferred();let captures=0;
  const mic=createPressToTalk({request:()=>authorization.promise,capture:async()=>{captures++;return {stop(){}};}});
  const pending=mic.start({index:0});mic.release();authorization.resolve(reply({ok:true}));await pending;
  assert.equal(captures,0);assert.equal(mic.phase,'idle');
});
test('releasing during microphone setup immediately stops the eventual stream without upload',async()=>{
  const setup=deferred(),capturing=deferred();let stopped=0,uploads=0;
  const mic=createPressToTalk({request:async path=>{if(path.endsWith('recognize'))uploads++;return reply({ok:true});},capture:()=>{capturing.resolve();return setup.promise;}});
  const pending=mic.start({index:0});await capturing.promise;mic.release();setup.resolve({stop(){stopped++;}});await pending;
  assert.equal(stopped,1);assert.equal(uploads,0);assert.equal(mic.phase,'idle');
});
test('changing question or leaving the game discards a late recognition result',async()=>{
  const recognition=deferred();let delivered=0;
  const mic=createPressToTalk({capture:async()=>({stop:()=>new ArrayBuffer(44)}),request:async path=>path.endsWith('authorize')?reply({ok:true}):recognition.promise,onResult:()=>delivered++});
  await mic.start({index:0});const pending=mic.release();mic.cancel();recognition.resolve(reply({text:'Old question'}));await pending;assert.equal(delivered,0);assert.equal(mic.phase,'idle');
});
test('recording duration limit closes the microphone and recognizes only once',async()=>{
  const done=deferred();let stops=0;
  const mic=createPressToTalk({maxMs:5,capture:async()=>({stop(){stops++;return new ArrayBuffer(44);}}),request:async path=>reply(path.endsWith('authorize')?{ok:true}:{text:'Hello'}),onResult:()=>done.resolve()});
  await mic.start({index:0});await done.promise;mic.release();assert.equal(stops,1);assert.equal(mic.phase,'idle');
});
test('WAV encoding preserves timing, mono format and clipped PCM samples',async()=>{
  const {validateRecording}=await import('../speech-bridge.mjs');
  const values=new Float32Array(16000);values.set([-2,-.5,0,.5,2]);
  const wav=Buffer.from(encodeWav([values],16000));validateRecording(wav);
  assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readInt16LE(44),-32768);assert.equal(wav.readInt16LE(52),32767);
  assert.throws(()=>validateRecording(Buffer.alloc(45)));assert.throws(()=>validateRecording(Buffer.from(encodeWav([new Float32Array(1)],16000))));
});
test('microphone permission is requested in the click gesture, before native authorization',async()=>{
  const micGrant=deferred(),nativeGrant=deferred(),events=[];let stopped=0;
  const permissions=createVoicePermissions({requestMicrophone(){events.push('getUserMedia');return micGrant.promise;},authorizeNative(){events.push('native');assert.equal(stopped,1);return nativeGrant.promise;},onState:s=>events.push(s)});
  const pending=permissions.enable();assert.deepEqual(events,['microphone','getUserMedia']);
  assert.equal(permissions.enable(),pending,'duplicate clicks must not request permission twice');
  micGrant.resolve({getTracks:()=>[{stop(){stopped++;}}]});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(events,['microphone','getUserMedia','system','native']);nativeGrant.resolve();assert.equal(await pending,true);assert.equal(events.at(-1),'ready');
});
test('denied microphone permission reports failure without asking for native access and permits retry',async()=>{
  let denied=true,native=0;const phases=[];
  const permissions=createVoicePermissions({requestMicrophone(){if(denied)throw new Error('denied');return Promise.resolve({getTracks:()=>[{stop(){}}]});},authorizeNative:async()=>{native++;},onState:s=>phases.push(s)});
  await assert.rejects(permissions.enable(),/denied/);assert.equal(native,0);assert.equal(phases.at(-1),'error');denied=false;await permissions.enable();assert.equal(native,1);assert.equal(phases.at(-1),'ready');
});
