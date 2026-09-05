const assert = require('node:assert/strict');
const { GardenGame } = require('../engine.js');
const make = () => new GardenGame({random:()=>.35});
const advance = (game, seconds) => { for(let i=0;i<seconds*60;i++)game.update(1/60); };
const test = (name, fn) => { fn(); console.log('PASS',name); };
test('ordinary shots collide with enemies and score kills',()=>{
  const g=make();g.start();g.auto=true;advance(g,2);assert.ok(g.kills>=1);assert.ok(g.score>=10);
});
test('laser only damages targets inside the aimed corridor',()=>{
  const g=make();g.start();g.enemies=[];g.setAim(800,282);const a=g.spawn(700,282);const b=g.spawn(700,445);g.input('a');assert.ok(a.hp<=0);assert.equal(b.hp,b.maxHp);assert.equal(g.casts,1);assert.equal(g.skills[0].cd,8);
});
test('cooldowns reject recasts and become ready again',()=>{
  const g=make();g.start();g.input('s');g.input('s');assert.equal(g.casts,1);advance(g,12.1);assert.equal(g.skills[1].cd,0);g.input('s');assert.equal(g.casts,2);
});
test('freeze stops movement and doubles ordinary bullet damage',()=>{
  const g=make();g.start();g.enemies=[];const z=g.spawn(400,282);g.input('s');const x=z.x;advance(g,.25);assert.equal(z.x,x);g.shooting=true;g.setAim(400,282);advance(g,.45);assert.ok(z.hp<=24);
});
test('melon lands after a delay and hits only its blast radius',()=>{
  const g=make();g.start();g.enemies=[];const a=g.spawn(700,282);const b=g.spawn(250,445);g.setAim(700,282);g.input('d');assert.equal(a.hp,a.maxHp);advance(g,.8);assert.ok(a.hp<=0);assert.equal(b.hp,b.maxHp);
});
test('wrong letters preserve typed progress and health',()=>{
  const g=make();g.start();g.skills[0].code='AFJ';g.input('a');assert.equal(g.typing,0);g.input('x');assert.equal(g.skills[0].typed,1);assert.equal(g.health,8);g.input('f');g.input('j');assert.equal(g.casts,1);assert.equal(g.correct,3);
});
test('typing slows enemies and pause freezes all game timers',()=>{
  const a=make(),b=make();a.start();b.start();a.skills[0].code='AF';a.input('a');const x=a.enemies[0].x;advance(a,1);advance(b,1);assert.ok(x-a.enemies[0].x < (x-b.enemies[0].x)*.3);a.pause();const before=JSON.stringify([a.enemies,a.skills,a.time]);advance(a,2);assert.equal(JSON.stringify([a.enemies,a.skills,a.time]),before);
});
test('a visible letter prompt stays fixed across waves until used and recharged',()=>{
  const g=make();g.start();g.wave=2;assert.equal(g.skills[0].code,'A');g.input('a');advance(g,8.1);assert.equal(g.skills[0].code.length,2);const code=g.skills[0].code;g.wave=3;assert.equal(g.skills[0].code,code);g.adaptive=false;assert.equal(g.nextCode(0),'A');
});
test('no enemies means no wasted cooldown',()=>{
  const g=make();g.start();g.enemies=[];g.input('a');assert.equal(g.casts,0);assert.equal(g.skills[0].cd,0);assert.equal(g.typing,-1);
});
test('all three waves can be completed with ordinary auto fire',()=>{
  const g=make();g.start();g.auto=true;advance(g,180);assert.equal(g.status,'won');assert.equal(g.wave,3);assert.equal(g.spawned,g.quota);assert.ok(g.kills>20);assert.ok(g.health>0);
});
test('unattended game ends at zero health; restarting clears effects and timers',()=>{
  const g=make();g.start();advance(g,180);assert.equal(g.status,'lost');assert.equal(g.health,0);g.start();assert.equal(g.health,8);assert.equal(g.score,0);assert.equal(g.casts,0);assert.equal(g.status,'playing');assert.equal(g.enemies.length,3);assert.equal(g.effects.length,0);
});
