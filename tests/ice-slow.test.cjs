const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenGame}=require('../engine.js');
function fixture(){const g=new GardenGame({random:()=>.4});g.start();g.setFireStrength(0);g.enemies=[];const z=g.spawn(900,280,'walker',false);z.speed=1;return {g,z};}
function advance(g,time){for(let i=0;i<time*60;i++)g.update(1/60);}
test('ice runs walking at half cadence and normal movement resumes on expiry',()=>{
 const a=fixture(),b=fixture();a.g.freeze=6;const pa=a.z.gait,pb=b.z.gait;
 advance(a.g,1);advance(b.g,1);assert.ok(a.z.x<900);assert.ok(Math.abs((a.z.gait-pa)/(b.z.gait-pb)-.5)<1e-8);
 a.g.freeze=0;const phase=a.z.gait;advance(a.g,1);assert.ok(Math.abs((a.z.gait-phase)/(b.z.gait-pb)-1)<1e-8);
});
test('continuous recasts never immobilize enemies or compound other slows',()=>{
 const {g,z}=fixture();let previous=z.x;
 for(let i=0;i<20;i++){g.cast(1);advance(g,.5);assert.ok(z.x<previous);previous=z.x;assert.ok(g.freeze>0);}
 const a=fixture(),b=fixture();a.g.freeze=6;a.z.slowTime=6;a.z.chill=.7;
 const pa=a.z.gait,pb=b.z.gait;advance(a.g,1);advance(b.g,1);
 assert.ok(Math.abs((a.z.gait-pa)/(b.z.gait-pb)-.3)<1e-8);
});
test('ice does not disable biting or healer abilities',()=>{
 const {g,z}=fixture();z.x=194;g.freeze=20;const hp=g.health;advance(g,1);assert.ok(g.health<hp);
 const h=fixture();const healer=h.g.spawn(850,280,'healer',false);healer.ability=.1;h.z.hp=h.z.maxHp/2;h.g.freeze=20;const health=h.z.hp;advance(h.g,.2);assert.ok(h.z.hp>health);
});
test('actual recharge faster than ice duration cannot keep an enemy motionless',()=>{
 const {g,z}=fixture();g.stacks.recharge=20;const start=z.x;
 assert.ok(g.skills[1].duration/g.rechargeRate<6);
 for(let frame=0;frame<20*60;frame++){
  if(g.skills[1].cd===0)g.input('s');
  g.update(1/60);assert.ok(g.freeze>0);assert.ok(g.freeze<=6);
 }
 assert.ok(g.casts>=8);assert.ok(z.x<start-5);
});
