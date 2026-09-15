const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenGame}=require('../engine.js');
const {encode,validate,restore}=require('../save.js');
test('laser deals 250 base damage and remains boosted by magic upgrades',()=>{
 for(const stacks of [0,2]){
  const g=new GardenGame({random:()=>.4});g.start();g.enemies=[];g.stacks.magic=stacks;
  const z=g.spawn(500,g.hero.y,'walker',false);z.hp=z.maxHp=10000;g.setAim(z.x,z.y);
  const expected=250*g.magicPower;g.cast(0);assert.equal(10000-z.hp,expected);
 }
});
test('laser cooldown is shortest, ice longest at every tested wave/recharge combination',()=>{
 const g=new GardenGame();g.start();assert.deepEqual(g.skills.map(s=>s.duration),[6,14,11]);
 for(const wave of [1,10,50])for(const recharge of [0,3,20]){
  g.wave=wave;g.stacks.recharge=recharge;
  const [laser,ice,melon]=g.skills.map(s=>s.duration/g.rechargeRate);
  assert.ok(laser<melon&&melon<ice);
 }
});
test('legacy saves retain the same fractional cooldown progress under the new balance',()=>{
 const g=new GardenGame();g.start();const save=encode(g);
 [8,12,11].forEach((duration,i)=>{save.state.skills[i].duration=duration;save.state.skills[i].cd=duration/2;});
 assert.ok(validate(save));const loaded=new GardenGame();assert.ok(restore(loaded,save));
 assert.deepEqual(loaded.skills.map(s=>s.duration),[6,14,11]);assert.deepEqual(loaded.skills.map(s=>s.cd),[3,7,5.5]);
 assert.deepEqual(save.state.skills.map(s=>s.duration),[8,12,11]);
 const current=encode(loaded);assert.ok(validate(current));
});
