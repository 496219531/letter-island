const assert=require('node:assert/strict');
const {GardenGame,CARDS}=require('../engine.js');
const {encode,validate,restore}=require('../save.js');
const test=(name,fn)=>{fn();console.log('PASS',name);};
test('round trip preserves combat, upgrades, settings, typed progress and projectile hit sets',()=>{
 const g=new GardenGame({random:()=>.4});g.start();g.wave=10;g.stacks={power:3,pierce:2,recharge:2};g.health=5;g.score=430;g.auto=true;g.adaptive=true;g.setFireStrength(.2);
 g.skills[0].code=g.nextCode(0);g.input('a');g.shoot();g.bullets[0].hitIds.add(g.enemies[0].id);
 g.effects.push({kind:'melon',x:500,y:300,life:.3,fullLife:.75,damage:400,radius:250});
 const save=JSON.parse(JSON.stringify(encode(g)));assert.ok(validate(save));const loaded=new GardenGame();assert.ok(restore(loaded,save));
 assert.equal(loaded.status,'paused');assert.equal(loaded.wave,10);assert.equal(loaded.skills[0].typed,1);assert.deepEqual(loaded.stacks,g.stacks);assert.deepEqual(loaded.enemies,g.enemies);assert.deepEqual(loaded.effects,g.effects);assert.deepEqual(loaded.bullets[0].hitIds,g.bullets[0].hitIds);assert.equal(loaded.shooting,false);assert.equal(loaded.fireStrength,.2);
 loaded.resume();loaded.update(.05);assert.ok(loaded.effects[0].life<.3);assert.equal(save.state.effects[0].life,.3);
});
test('upgrade offer saves without reroll and can only be chosen once on restore',()=>{
 const g=new GardenGame();g.start();g.enemies=[];g.spawned=g.quota;g.update(.01);const ids=g.offers.map(c=>c.id);const save=encode(g);assert.ok(validate(save));
 const loaded=new GardenGame();restore(loaded,save);assert.equal(loaded.status,'upgrade');assert.deepEqual(loaded.offers.map(c=>c.id),ids);assert.equal(loaded.chooseCard(ids[0]),true);assert.equal(loaded.chooseCard(ids[0]),false);assert.equal(loaded.wave,2);
});
test('corrupt and incompatible saves are rejected without changing the current game',()=>{
 const g=new GardenGame();g.start();const save=encode(g),before=g.health;
 for(const mutate of [s=>s.version=99,s=>s.state.skills[0].code='<bad>',s=>s.state.enemies[0].x=null,s=>s.state.health=0,s=>s.state.stacks={unknown:1},s=>s.state.bullets=[{}],s=>s.state.skills[0].typed=100]){
 const bad=JSON.parse(JSON.stringify(save));mutate(bad);assert.equal(validate(bad),false);assert.equal(restore(g,bad),false);assert.equal(g.health,before);
 }
});
test('finished or not-started games cannot replace an active save',()=>{
 const g=new GardenGame();assert.equal(encode(g),null);g.start();g.finish(false);assert.equal(encode(g),null);
});
