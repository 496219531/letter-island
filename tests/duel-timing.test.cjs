const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DuelMatch}=require('../duel.cjs');
function match(options){const m=new DuelMatch(options);m.join('A');m.join('B');m.connect(0,true);m.connect(1,true);m.begin();m.waveIn=999;m.games.forEach(g=>g.auto=false);return m;}
function type(m,index,side=0){m.command(side,{type:'select',index});for(const key of m.games[side].skills[index].code)m.command(side,{type:'key',key});}
function reserve(m,index){m.command(0,{type:'reserve',value:true});type(m,index);return {...m.games[0].heldSpell,round:m.round,type:'release'};}
function ticks(m,n){for(let i=0;i<n*20;i++)m.tick(.05);}

test('a completed charge waits without damage or cooldown, then releases once',()=>{
  const m=match(),g=m.games[0],enemy=g.spawn(400,282,'armor',false);enemy.hp=enemy.maxHp=10000;
  const release=reserve(m,0),hp=enemy.hp;
  assert.equal(g.casts,0);assert.equal(enemy.hp,hp);assert.equal(g.skills[0].cd,0);
  type(m,0);assert.equal(g.casts,0);assert.throws(()=>m.command(0,{type:'reserve',value:true}),/只能保留/);
  assert.equal(m.snapshot(1).heldSpell,null);
  m.command(0,release);assert.equal(g.casts,1);assert.ok(enemy.hp<hp);assert.ok(g.skills[0].cd>0);
  assert.throws(()=>m.command(0,release),/已释放/);assert.equal(g.casts,1);
});
test('empty offensive release retains the charge, support may release onto future troops',()=>{
  const m=match(),release=reserve(m,0);
  assert.throws(()=>m.command(0,release),/没有敌兵/);assert.ok(m.games[0].heldSpell);
  const other=match(),ward=reserve(other,4);other.command(0,ward);other.send(0,'walker',false,140);
  assert.ok(other.games[1].enemies[0].wardTime>0);
});
test('holding preserves English repetition credit, concurrent typing and pause state',()=>{
  const m=match({mode:'english'}),g=m.games[0];g.wave=4;
  m.command(0,{type:'reserve',value:true});type(m,4);assert.equal(g.heldSpell,null);
  type(m,4);const held={...g.heldSpell};assert.ok(held);assert.equal(g.skills[4].repeatsDone,1);
  m.command(0,{type:'select',index:5});m.command(0,{type:'key',key:g.skills[5].code[0]});const progress=g.skills[5].typed;
  m.connect(1,false);ticks(m,2);assert.deepEqual(g.heldSpell,held);
  assert.throws(()=>m.command(0,{type:'release',id:held.id,round:m.round}),/重连/);
  m.connect(1,true);m.command(0,{type:'release',id:held.id,round:m.round});
  assert.equal(g.typing,5);assert.equal(g.skills[5].typed,progress);
  assert.equal(g.practiceScore,g.skills[4].code.replace(/[^A-Z]/g,'').length*4);
});
test('rematch rejects stale releases even if the new charge reuses an id',()=>{
  const m=match(),old=reserve(m,4);m.end(0,'test');m.command(0,{type:'ready'});m.command(1,{type:'ready'});
  assert.equal(m.games[0].heldSpell,null);const next=reserve(m,4);assert.equal(old.id,next.id);
  assert.throws(()=>m.command(0,old),/上一局/);assert.ok(m.games[0].heldSpell);
});
test('freeze plus lightning increases actual damage and consumes ice once',()=>{
  const m=match(),g=m.games[0],z=g.spawn(450,290,'armor',false);z.hp=z.maxHp=10000;
  type(m,1);type(m,3);assert.equal(g.freeze,0);assert.equal(z.hp,10000-2500*1.35);
  assert.ok(g.effects.some(e=>e.kind==='shatter'));assert.match(g.feedback.text,/碎冰/);
  g.skills[3].cd=0;const before=z.hp;type(m,3);assert.equal(before-z.hp,2500);
});
test('broken wards repel nearby enemies once per step, and expiry alone does not repel',()=>{
  const m=match(),army=m.games[1],foes=m.games[0];
  const a=army.spawn(530,290,'walker',false),b=army.spawn(532,290,'walker',false);
  const enemy=foes.spawn(480,290,'armor',false),far=foes.spawn(480,140,'armor',false);
  type(m,4);army.damage(a,60,'laser');army.damage(b,60,'laser');m.resolveWardBreaks();
  assert.equal(a.wardTime,0);assert.equal(enemy.x,525);assert.equal(far.x,480);
  m.resolveWardBreaks();assert.equal(enemy.x,525);
  const expires=army.spawn(700,140,'armor',false);expires.wardTime=.01;army.update(.05);
  assert.equal(army.pendingWardBreaks.length,0);
  const atSpawn=foes.spawn(820,430,'mini',false);army.pendingWardBreaks.push({x:195,y:430});
  m.resolveWardBreaks();assert.equal(atSpawn.x,820,'recoil must never pull a unit forward at its spawn edge');
});
