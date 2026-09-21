const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../game.js'),'utf8');
function setup(){
 const nodes=new Map();const node=()=>({dataset:{},classList:{toggle(){},remove(){}},setAttribute(){},replaceChildren(){this.children=[];},append(...items){(this.children??=[]).push(...items);}});
 const context={game:{learningMode:'speaking',typing:0,status:'playing',skills:[{code:'HELLO THERE',cd:0},{code:'GOOD MORNING',cd:0}]},microphone:{phase:'idle',held:false},permissionPhase:'ready',speechAuthorized:true,nativeSpeechReady:true,nativeSpeech:true,phoneSpeech:true,speechFeedback:'',speechAttempts:new Map(),speechResult:{index:0,code:'HELLO THERE',text:'hello',matched:false},GuluSpeechReview:require('../speech-review.js'),localSpeech:{available:()=>true},document:{createElement:node,createTextNode:text=>({textContent:text})},$:(id)=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function updateSpeechControl(){'),source.indexOf('function layoutSpeechFeedback(){')),context);
 return {context,nodes,update:()=>context.updateSpeechControl()};
}
test('final results persist through recording, recognition and successful cooldown',()=>{
 const s=setup();for(const phase of ['idle','recording','recognizing']){s.context.microphone.phase=phase;s.update();assert.equal(s.nodes.get('#speechDiff').hidden,false);assert.equal(s.context.speechResult.text,'hello');}
 s.context.speechResult={index:0,code:'HELLO THERE',text:'hello there',matched:true};s.context.game.skills[0].cd=5;s.update();assert.equal(s.nodes.get('#speechDiff').hidden,false);assert.match(s.nodes.get('#speechTranscript').textContent,/匹配成功/);
});
test('missing words are underlined; changing spell or prompt clears visible result',()=>{
 const s=setup();s.update();assert.ok(s.nodes.get('#speechDiff').children.some(n=>n.className==='speech-result-error'&&n.textContent==='there'));
 s.context.game.typing=1;s.update();assert.equal(s.context.speechResult,null);assert.equal(s.nodes.get('#speechDiff').hidden,true);
 const t=setup();t.context.game.skills[0].code='NEW SENTENCE';t.update();assert.equal(t.context.speechResult,null);
});
test('whole recording surface reflects press, recording, recognition and cancellation immediately',()=>{
 const s=setup();for(const [phase,held] of [['preparing',true],['recording',true],['recognizing',false],['idle',false]]){
  Object.assign(s.context.microphone,{phase,held});s.update();const surface=s.nodes.get('#speechControl');assert.equal(surface.dataset.speechPhase,phase);assert.equal(surface.dataset.held,String(held));assert.equal(s.nodes.get('#speechDiff').hidden,false);
 }
});
test('example stays visible and is disabled during recording and recognition',()=>{
 const s=setup();s.update();assert.equal(s.nodes.get('#speechExample').hidden,false);assert.equal(s.nodes.get('#speechExample').disabled,false);
 for(const phase of ['preparing','recording','recognizing']){s.context.microphone.phase=phase;s.update();assert.equal(s.nodes.get('#speechExample').disabled,true);}
});
test('example reads the current target in English without selecting or skipping it',()=>{
 const calls=[],context={game:{learningMode:'speaking',status:'playing',typing:0,skills:[{code:'HELLO',cd:0},{code:'GOODBYE',cd:0}]},microphone:{phase:'idle'},permissionPhase:'idle',lookupSentence:code=>({text:code==='HELLO'?'Hello there.':'Goodbye.'}),pendingLearningReadout:[{}],window:{},localSpeech:{speak:text=>{calls.push(text);return true;},cancel(){}},updateSpeechControl(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function playSpeechExample(event){'),source.indexOf("$('#speechExample').addEventListener('click',playSpeechExample);")),context);
 let stopped=0;context.playSpeechExample({stopPropagation(){stopped++;}});assert.deepEqual(calls,['Hello there.']);assert.equal(stopped,1);assert.equal(context.game.typing,0);assert.equal(context.pendingLearningReadout.length,0);
 context.game.typing=1;context.playSpeechExample();assert.equal(calls.at(-1),'Goodbye.');
 context.microphone.phase='recording';context.playSpeechExample();assert.equal(calls.length,2);
 context.microphone.phase='idle';const native=[];context.window.GuluNative=context.GuluNative={speakLearning:payload=>{native.push(payload);return Promise.resolve();}};
 context.playSpeechExample();assert.equal(native[0].text,'Goodbye.');assert.equal(native[0].chinese,false);assert.equal(native[0].language,'en');
});
