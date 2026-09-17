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
