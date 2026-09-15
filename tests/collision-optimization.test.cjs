const {test}=require('node:test'),assert=require('node:assert/strict');const {GardenGame}=require('../engine.js');
test('optimized collision matches the original swept-circle test, including reverse and stationary shots',()=>{
 let seed=9182;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let trial=0;trial<250;trial++){
  const g=new GardenGame({random});g.start();g.enemies=[];g.fireStrength=0;g.spawnIn=1000;
  for(let i=0;i<25;i++){const z=g.spawn(200+random()*800,90+random()*360,i%7===0?'boss':'walker',false);z.speed=0;z.ability=100;z.charmed=i%9===0;}
  // Allies move only if speed>0, so geometry is static in this test.
  const b={x:150+random()*850,y:random()*530,vx:trial%4===0?0:(random()-.5)*8000,vy:trial%4===0?0:(random()-.5)*8000,life:1,hitIds:new Set(g.enemies.filter((_,i)=>i%8===0).map(z=>z.id))};
  const dx=b.vx/60,dy=b.vy/60,len=dx*dx+dy*dy;
  const expected=g.enemies.find(z=>{if(z.charmed||b.hitIds.has(z.id))return false;const t=len?Math.max(0,Math.min(1,((z.x-b.x)*dx+(z.y-b.y)*dy)/len)):0;return Math.hypot(z.x-(b.x+t*dx),z.y-(b.y+t*dy))<z.radius;})?.id;
  let actual;g.hitBullet=(bullet,z)=>{actual=z.id;bullet.life=0;};g.bullets=[b];g.update(1/60);assert.equal(actual,expected,'trial '+trial);
 }
});
test('spatial collision grid checks a small local candidate set for large crowds and bullet bursts',()=>{
 const g=new GardenGame({random:()=>.5});g.start();g.enemies=[];g.spawnIn=1000;g.fireStrength=0;
 for(let i=0;i<100;i++){const z=g.spawn(260+(i%20)*35,140+Math.floor(i/20)*72,'walker',false);z.speed=0;z.ability=100;}
 for(let i=0;i<120;i++)g.bullets.push({x:180,y:290,px:180,py:290,vx:720,vy:0,life:1,damage:1,pierce:0,bounces:0,hitIds:new Set()});
 g.update(1/60);assert.ok(g.collisionGrid);assert.ok(g.collisionCandidates<g.enemies.length*120*.3,'grid should avoid most enemy/bullet pair checks');
});
