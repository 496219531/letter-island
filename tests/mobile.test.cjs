const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isPhone,allowedMode,createSpeech}=require('../mobile.js');
test('phone mode policy removes only pure typing, preserving desktop modes',()=>{
  for(const mode of ['adaptive','letters']){assert.equal(allowedMode(mode,true),'english');assert.equal(allowedMode(mode,false),mode);}
  for(const mode of ['english','sentences','speaking'])assert.equal(allowedMode(mode,true),mode);
  assert.equal(isPhone({matchMedia:q=>({matches:true})}),true);
  assert.equal(isPhone({matchMedia:q=>({matches:q.includes('width')})}),false);
});
function setup(){
 let instance;const results=[],errors=[];
 class Recognition{constructor(){instance=this;}start(){}stop(){this.stopped=true;}abort(){this.aborted=true;}}
 const mic=createSpeech({Recognition,onResult:(...x)=>results.push(x),onError:e=>errors.push(e)});
 return {mic,results,errors,get r(){return instance;}};
}
test('phone speech stops on release and delivers final text to the original skill',()=>{
 const s=setup(),target={index:1,code:'HELLO THERE'};s.mic.start(target);s.r.onstart();assert.equal(s.mic.phase,'recording');
 s.r.onresult({resultIndex:0,results:[Object.assign([{transcript:'Hello there'}],{isFinal:true})]});
 assert.equal(s.results.length,0);s.mic.release();assert.equal(s.r.stopped,true);s.r.onend();
 assert.deepEqual(s.results,[['Hello there',target,{audioId:null}]]);assert.equal(s.mic.phase,'idle');
});
test('release during permission preparation and cancellation suppress late recognition',()=>{
 const s=setup();s.mic.start({index:0});const old=s.r;s.mic.release();assert.equal(old.aborted,true);old.onstart();old.onend();assert.equal(s.results.length,0);
 s.mic.start({index:2});s.r.onstart();s.mic.cancel();s.r.onend();assert.equal(s.results.length,0);assert.equal(s.mic.held,false);
});
test('permission failure clears recording and allows retry',()=>{
 const s=setup();s.mic.start({index:0});s.r.onerror({error:'not-allowed'});assert.equal(s.mic.phase,'idle');assert.match(s.errors[0],/权限/);s.mic.start({index:1});assert.equal(s.mic.phase,'preparing');s.mic.cancel();
});

test('skill hints retain ownership through selection, cooldown and punctuation',()=>{
 const {keySkillHints}=require('../mobile.js');
 const skills=[{code:'APPLE',typed:0,cd:0},{code:'ICE CREAM',typed:0,cd:0},{code:'MELON',typed:0,cd:0}];
 assert.deepEqual(keySkillHints(skills,-1,'english'),{A:0,I:1,M:2});
 skills[1].typed=3;assert.deepEqual(keySkillHints(skills,1,'english'),{' ':1});
 skills[1].cd=2;assert.deepEqual(keySkillHints(skills,-1,'english'),{A:0,M:2});
 skills[2].code='APRICOT';assert.deepEqual(keySkillHints(skills,-1,'english'),{A:0});
 assert.deepEqual(keySkillHints(skills,-1,'speaking'),{});
});
