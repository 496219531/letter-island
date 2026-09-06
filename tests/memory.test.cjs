const assert=require('node:assert/strict');
const {GardenGame}=require('../engine.js');
const {encode,restore}=require('../save.js');
// Exercise an hour of combat with stacked weapons, enemies and repeated save replacement.
const g=new GardenGame({random:()=>.35});
const peaks={enemies:0,bullets:0,effects:0,dead:0};
const heaps=[];let snapshot;
for(let batch=0;batch<6;batch++){
 g.start();g.wave=30;g.quota=100000;g.maxHealth=g.health=100000;g.auto=true;g.setFireStrength(1);
 g.stacks={rapid:20,multishot:20,pierce:10,ricochet:10,poison:3,splash:2,twinmelon:10};
 for(let frame=0;frame<12000;frame++){
  if(frame%100===0&&g.enemies.length)g.cast(2);
  g.update(.05);
  if(frame%40===0)snapshot=encode(g);
  for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],g[key].length);
 }
 assert.equal(g.status,'playing');assert.ok(restore(g,snapshot));g.start();
 for(const key of ['bullets','effects','dead'])assert.equal(g[key].length,0);
 assert.equal(g.enemies.length,3);assert.deepEqual(g.stacks,{});
 if(global.gc){global.gc();heaps.push(process.memoryUsage().heapUsed);}
}
assert.ok(peaks.enemies<=300);assert.ok(peaks.bullets<=1500);assert.ok(peaks.effects<=100);assert.ok(peaks.dead<=300);
if(heaps.length)assert.ok(heaps.at(-1)-heaps[1]<8*1024*1024,'retained heap grows by more than 8 MiB after warm-up');
console.log('PASS one simulated hour, save replacement and restart cleanup',JSON.stringify({peaks,heapMiB:heaps.map(n=>+(n/1048576).toFixed(2))}));
