const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenGame}=require('../engine.js');
const {encode,restore}=require('../save.js');
function fixture(pierce=3,bounces=0){
 const g=new GardenGame({random:()=>.5});g.start();g.enemies=[];g.stacks={};if(pierce)g.stacks.pierce=pierce;if(bounces)g.stacks.ricochet=bounces;
 const targets=Array.from({length:8},(_,i)=>{const z=g.spawn(450+i*35,280,'walker',false);z.hp=z.maxHp=10000;return z;});g.shoot();const bullet=g.bullets[0];bullet.damage=100;
 return {g,targets,bullet};
}
test('one penetration upgrade hits only two targets; each extra upgrade adds one target',()=>{
 for(const layers of [0,1,2,3]){
  const {g,targets,bullet}=fixture(layers);
  for(const target of targets)g.hitBullet(bullet,target);
  assert.equal(targets.filter(z=>z.hp<z.maxHp).length,layers+1);
  assert.equal(bullet.hitIds.size,layers+1);assert.equal(bullet.life,0);
 }
});
test('penetration loses 30% base damage per target and ends when its budget is exhausted',()=>{
 const {g,targets,bullet}=fixture();
 [100,70,49,34.3].forEach((damage,i)=>{g.hitBullet(bullet,targets[i]);assert.ok(Math.abs((10000-targets[i].hp)-damage)<1e-8);});
 assert.equal(bullet.life,0);g.hitBullet(bullet,targets[4]);assert.equal(targets[4].hp,10000);
});
test('ricochet and penetration share attenuation and cannot repeat the same target',()=>{
 const {g,targets,bullet}=fixture(2,2);
 for(let i=0;i<5;i++){g.hitBullet(bullet,targets[i]);assert.ok(Math.abs((10000-targets[i].hp)-100*Math.pow(.7,i))<1e-8);const hp=targets[i].hp;g.hitBullet(bullet,targets[i]);assert.equal(targets[i].hp,hp);}
 assert.equal(bullet.life,0);assert.equal(bullet.hitIds.size,5);
});
test('near-zero energy stops the projectile even with many remaining penetrations',()=>{
 const {g,targets,bullet}=fixture(100);bullet.damage=.6;g.hitBullet(bullet,targets[0]);assert.equal(bullet.life,0);assert.ok(bullet.pierce>0);
 g.hitBullet(bullet,targets[1]);assert.equal(targets[1].hp,10000);
});
test('saved bullets keep their hit history and cannot regain full damage after loading',()=>{
 const {g,targets,bullet}=fixture();g.hitBullet(bullet,targets[0]);const targetId=targets[1].id;
 const snapshot=encode(g),loaded=new GardenGame();assert.equal(restore(loaded,snapshot),true);
 const next=loaded.enemies.find(z=>z.id===targetId);loaded.hitBullet(loaded.bullets[0],next);assert.ok(Math.abs(10000-next.hp-70)<1e-8);
});
test('a real moving projectile with one pierce upgrade leaves the third aligned enemy untouched',()=>{
 const g=new GardenGame({random:()=>.5});g.start();g.enemies=[];g.spawned=g.quota;g.stacks.pierce=1;
 const targets=[400,500,600].map(x=>{const z=g.spawn(x,282,'walker',false);z.hp=z.maxHp=1000;z.speed=0;return z;});
 g.setAim(600,282);g.shoot();for(let i=0;i<60;i++)g.update(1/60);
 assert.ok(Math.abs(1000-targets[0].hp-24)<1e-8);assert.ok(Math.abs(1000-targets[1].hp-16.8)<1e-8);assert.equal(targets[2].hp,1000);
 assert.equal(g.bullets.length,0);
});
