const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SimulationClock}=require('../performance.js');
const {GardenGame}=require('../engine.js');
test('30fps and slow 12fps frames advance the same game simulation as 60fps',()=>{
 const outcomes=[];
 for(const fps of [60,30,12]){
  const clock=new SimulationClock(),game=new GardenGame({random:()=>.5});game.start();let ticks=0;
  for(let frame=0;frame<fps*10;frame++)clock.advance(1/fps,dt=>{ticks++;game.update(dt);});
  outcomes.push({ticks,time:game.time,health:game.health,score:game.score,spawned:game.spawned,enemies:game.enemies.map(e=>({x:e.x,y:e.y,hp:e.hp}))});
 }
 assert.equal(outcomes[0].ticks,600);assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[0],outcomes[2]);
});
test('a long suspended frame has bounded catch-up work; invalid deltas do not poison the clock',()=>{
 const clock=new SimulationClock();let ticks=0;assert.equal(clock.advance(60,()=>ticks++),15);assert.equal(ticks,15);
 for(const value of [NaN,Infinity,-1])assert.equal(clock.advance(value,()=>ticks++),0);
 assert.equal(clock.advance(1/60,()=>ticks++),1);
});
test('App migrates to eco once, then preserves an explicit standard preference',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),values=new Map([['gulu-render-quality','standard']]);
 function boot(){const root={GuluNative:{},document:{body:{dataset:{}},dispatchEvent(){},addEventListener(){}},Event:class{},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};vm.runInNewContext(fs.readFileSync(require.resolve('../performance.js'),'utf8'),root);return root.GuluPerformance;}
 const first=boot();assert.equal(first.mode,'eco');assert.equal(first.current.fps,30);first.set('standard');assert.equal(boot().mode,'standard');
});
test('paint scheduling does not lose frames at exact 30Hz boundaries',()=>{
 const {paintSteps}=require('../performance.js');
 for(const hz of [30,60,120]){let clock=0,last=0,drawn=0;for(let n=1;n<=hz*6;n++){const time=n*1000/hz,dt=last?(time-last)/1000:0;last=time;clock+=dt;const steps=paintSteps(clock,1/30);if(steps){drawn++;clock=Math.max(0,clock-steps/30);}}assert.ok(drawn>=179&&drawn<=180,hz+'Hz produced '+drawn+' frames');}
});
test('30Hz callback jitter does not introduce extra skipped frames',()=>{const {paintSteps}=require('../performance.js');let carry=0,drawn=0;for(let i=0;i<180;i++){carry+=[.032,.035,.033][i%3];const steps=paintSteps(carry,1/30);if(steps){drawn++;carry=Math.max(0,carry-steps/30);}}assert.equal(drawn,180);});
