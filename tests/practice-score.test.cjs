const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenGame}=require('../engine.js');
require('../save.js');
function setup(repeats=1,level=0){
 const g=new GardenGame({random:()=>.4});g.learningMode='english';g.englishLevel=level;g.maxLearningLoad=repeats;
 g.pickLearningCode=()=> 'APPLE';g.start();g.wave=1+(repeats-1)*3;
 // Freeze has no kill score, so the reward can be compared independently.
 g.select(1);return g;
}
function word(g){for(const c of 'APPLE')g.input(c);}
test('the same word completed twice earns twice the practice score of once',()=>{
 const one=setup();word(one);assert.equal(one.practiceScore,10);assert.equal(one.score,10);
 const two=setup(2);word(two);assert.equal(two.practiceScore,0);word(two);assert.equal(two.practiceScore,20);assert.equal(two.score,20);
 const five=setup(5);for(let i=0;i<5;i++)word(five);assert.equal(five.practiceScore,50);
});
test('higher issued difficulty earns more, and late settings changes do not inflate an existing prompt',()=>{
 const hard=setup(1,4);word(hard);assert.equal(hard.practiceScore,50);
 const changed=setup(1,0);changed.englishLevel=4;word(changed);assert.equal(changed.practiceScore,10);
 changed.skills[1].cd=0;changed.skills[1].code=changed.nextCode(1);changed.select(1);word(changed);assert.equal(changed.practiceScore,60);
});
test('partial input, repeated backspaces, wrong letters and empty fields cannot farm rewards',()=>{
 const g=setup();g.input('A');for(let i=0;i<10;i++){g.backspace();g.input('A');}assert.equal(g.practiceScore,0);
 g.input('Z');assert.equal(g.practiceScore,0);for(const c of 'PPLE')g.input(c);assert.equal(g.practiceScore,10);
 const empty=setup();empty.enemies=[];word(empty);assert.equal(empty.practiceScore,0);
 const raw=setup();raw.cast(1);assert.equal(raw.practiceScore,0);
});
test('score and prompt difficulty survive save/restore, including unfinished repetitions',()=>{
 // Use a real vocabulary entry so normal save validation applies.
 const real=new GardenGame({random:()=>.4});real.learningMode='english';real.englishLevel=2;real.maxLearningLoad=2;real.start();real.wave=4;real.select(1);
 const code=real.skills[1].code;for(const c of code)real.input(c);
 const snapshot=global.GuluSave.encode(real);assert.ok(global.GuluSave.validate(snapshot));
 const resumed=new GardenGame();assert.equal(global.GuluSave.restore(resumed,snapshot),true);resumed.resume();resumed.select(1);for(const c of code)resumed.input(c);
 assert.equal(resumed.practiceScore,(code.match(/[A-Z]/g)||[]).length*2*3*2);
});
