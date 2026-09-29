const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DuelMatch}=require('../duel.cjs');
function match(){const m=new DuelMatch({random:()=>.3});m.join('甲');m.join('乙');m.connect(0,true);m.connect(1,true);m.begin();m.waveIn=999;m.games.forEach(g=>g.auto=false);return m;}
function ticks(m,n){for(let i=0;i<Math.round(n*20);i++)m.tick(.05);}
function cast(m,index=0,side=0){m.command(side,{type:'select',index});for(const key of m.games[side].skills[index].code)m.command(side,{type:'key',key});}
function spawn(g,x,y,type='walker',hp){const z=g.spawn(x,y,type,false);z.speed=0;if(hp)z.hp=z.maxHp=hp;return z;}

test('laser telegraphs one lane, then counts real kills and pushes without clearing other lanes',()=>{
 const m=match(),g=m.games[0];g.setAim(500,290);
 spawn(g,450,290);const tank=spawn(g,500,290,'armor',1000),other=spawn(g,400,215);
 const ally=spawn(m.games[1],800,430);
 cast(m);assert.equal(g.casts,1);assert.equal(g.kills,0);assert.equal(tank.hp,1000);
 assert.ok(g.effects.some(e=>e.kind==='laserCharge'));ticks(m,.3);assert.equal(tank.hp,1000);
 ticks(m,.05);assert.equal(tank.hp,750);assert.equal(other.hp,other.maxHp);assert.equal(ally.hp,ally.maxHp);
 assert.deepEqual([g.laserResult.hits,g.laserResult.kills,g.laserResult.pushed,g.laserResult.lane],[2,1,1,3]);
 assert.equal(g.laserResult.damage,322);assert.ok(g.effects.some(e=>e.kind==='duelLaser'));
 ticks(m,.25);assert.ok(Math.abs(tank.x-572)<1e-8);assert.ok(tank.staggerTime>0);
 assert.deepEqual(m.games.map(x=>x.health),[56,56]);
});
test('impact damage is resolved after the windup so the opposing ward can protect troops',()=>{
 const m=match(),g=m.games[0],tank=spawn(g,500,290,'armor',1000);g.setAim(500,290);
 cast(m);cast(m,4,1);ticks(m,.35);
 assert.equal(tank.hp,850);assert.equal(g.laserResult.damage,150);
 assert.equal(m.snapshot(1).fields[0].laserResult.hits,1);
});
test('laser locks its lane, with truthful empty result when targets leave during charge',()=>{
 const m=match(),g=m.games[0],z=spawn(g,450,290);g.setAim(450,290);cast(m);
 z.y=215;g.setAim(450,215);ticks(m,.35);
 assert.equal(z.hp,z.maxHp);assert.equal(g.laserResult.hits,0);assert.equal(g.laserResult.lane,3);
 assert.match(g.feedback.text,/离开范围/);
});
test('a staggered survivor cannot bite enemy troops or the garden fence',()=>{
 const m=match(),g=m.games[0],foe=spawn(g,450,290,'armor',1000);g.setAim(450,290);cast(m);ticks(m,.35);
 const ally=spawn(m.games[1],550,290,'armor',1000);foe.duelBiteIn=0;m.clash(.05);
 assert.equal(ally.hp,1000);assert.equal(g.canBiteDefense(foe),false);
});
test('disconnect pauses windup and reconnect resolves the shot exactly once',()=>{
 const m=match(),g=m.games[0],z=spawn(g,450,290,'armor',1000);g.setAim(450,290);cast(m);ticks(m,.1);
 m.connect(1,false);ticks(m,2);assert.equal(z.hp,1000);assert.equal(g.laserResult,null);
 m.connect(1,true);ticks(m,.25);assert.equal(z.hp,750);ticks(m,1);assert.equal(z.hp,750);assert.equal(g.laserSerial,1);
});
test('held laser waits until released, and rematch drops unfinished windups',()=>{
 const m=match(),g=m.games[0];spawn(g,450,290);g.setAim(450,290);
 m.command(0,{type:'reserve',value:true});cast(m);ticks(m,.5);assert.equal(g.pendingLasers.length,0);
 const held=g.heldSpell;m.command(0,{type:'release',id:held.id,round:m.round});assert.equal(g.pendingLasers.length,1);
 assert.throws(()=>m.command(0,{type:'release',id:held.id,round:m.round}),/已释放/);
 m.end(0,'测试');m.command(0,{type:'ready'});m.command(1,{type:'ready'});
 assert.equal(m.games[0].pendingLasers.length,0);assert.equal(m.games[0].laserResult,null);
});
