const assert = require('node:assert/strict');
const { GardenGame, CARDS, TYPES } = require('../engine.js');
const make = () => {const g=new GardenGame({random:()=>.35});g.setFireStrength(1);return g;};
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
test('typing keeps enemies at full speed and pause freezes all game timers',()=>{
  const a=make(),b=make();a.start();b.start();a.skills[0].code='AF';a.input('a');const x=a.enemies[0].x;advance(a,1);advance(b,1);assert.equal(a.enemies[0].x,b.enemies[0].x);a.pause();const before=JSON.stringify([a.enemies,a.skills,a.time]);advance(a,2);assert.equal(JSON.stringify([a.enemies,a.skills,a.time]),before);
});
test('a visible letter prompt stays fixed across waves until used and recharged',()=>{
  const g=make();g.start();g.wave=2;assert.equal(g.skills[0].code,'A');g.input('a');advance(g,8.1);assert.equal(g.skills[0].code.length,2);const code=g.skills[0].code;g.wave=3;assert.equal(g.skills[0].code,code);g.adaptive=false;assert.equal(g.nextCode(0),'A');
});
test('no enemies means no wasted cooldown',()=>{
  const g=make();g.start();g.enemies=[];g.input('a');assert.equal(g.casts,0);assert.equal(g.skills[0].cd,0);assert.equal(g.typing,-1);
});
test('unattended game ends at zero health; restarting clears effects and timers',()=>{
  const g=make();g.start();advance(g,180);assert.equal(g.status,'lost');assert.equal(g.health,0);g.start();assert.equal(g.health,8);assert.equal(g.score,0);assert.equal(g.casts,0);assert.equal(g.status,'playing');assert.equal(g.enemies.length,3);assert.equal(g.effects.length,0);
});

test('infinite waves stop for three unique choices and continue beyond wave five',()=>{
 const g=make();g.start();
 for(let wave=1;wave<=12;wave++){
  g.enemies=[];g.spawned=g.quota;g.update(.016);assert.equal(g.status,'upgrade');assert.equal(g.offers.length,3);assert.equal(new Set(g.offers.map(c=>c.id)).size,3);
  const time=g.time;advance(g,3);assert.equal(g.time,time);assert.equal(g.chooseCard('invalid'),false);
  assert.equal(g.chooseCard(g.offers[0].id),true);assert.equal(g.wave,wave+1);assert.equal(g.status,'playing');assert.equal(g.chooseCard(CARDS[0].id),false);
 }
 assert.equal(Object.values(g.stacks).reduce((a,b)=>a+b,0),12);assert.ok(g.quota>40);
});
test('stacking cards changes damage, multishot, pierce and maximum shield',()=>{
 const g=make();g.start();
 for(const id of ['power','power','multishot','pierce','fortify','fortify']){g.status='upgrade';g.offers=[CARDS.find(c=>c.id===id)];g.chooseCard(id);}
 assert.equal(g.power,1.5);assert.equal(g.maxHealth,12);assert.equal(g.health,12);g.bullets=[];g.shoot();assert.equal(g.bullets.length,2);assert.equal(g.bullets[0].damage,36);assert.equal(g.bullets[0].pierce,1);
});
test('special enemies armor, shields, healer, splitters, bombers and bosses work',()=>{
 const g=make();g.start();g.enemies=[];
 const armored=g.spawn(800,200,'armor');g.damage(armored,24);assert.equal(armored.hp,armored.maxHp-12);
 const shield=g.spawn(800,240,'shield');g.damage(shield,24);assert.equal(shield.hp,shield.maxHp);assert.ok(shield.shield<shield.maxHp*.65);
 const healer=g.spawn(820,210,'healer');healer.ability=0;g.update(.016);assert.ok(armored.hp>armored.maxHp-12);
 const splitter=g.spawn(750,300,'splitter');const spawned=g.spawned;g.damage(splitter,10000,'laser');assert.equal(g.enemies.filter(z=>z.type==='mini').length,2);assert.equal(g.spawned,spawned);
 const bomber=g.spawn(194,400,'bomber');const hp=g.health;g.update(.016);assert.equal(g.health,hp-2);
 g.wave=5;g.spawned=g.quota-1;const boss=g.spawn();assert.equal(boss.type,'boss');boss.ability=0;g.update(.016);assert.ok(g.enemies.some(z=>z.type==='runner'));
});
test('enemy health, speed and population scale across waves',()=>{
 const g=make();g.start();const early=g.spawn(900,200,'walker');g.wave=10;const late=g.spawn(900,200,'walker');assert.ok(late.hp>early.hp*4);assert.ok(late.speed>early.speed);assert.equal(CARDS.length,24);assert.equal(Object.keys(TYPES).length,9);
});

test('walking stays full speed while typing and stops for ice and pause',()=>{
 const a=make(),b=make();a.start();b.start();a.skills[0].code='AF';a.input('a');
 const phase=a.enemies[0].gait;advance(a,1);advance(b,1);
 assert.ok(Math.abs((a.enemies[0].gait-phase)/(b.enemies[0].gait-phase)-1)<.001);
 a.freeze=3;const frozen=a.enemies[0].gait;advance(a,1);assert.equal(a.enemies[0].gait,frozen);
 a.pause();advance(a,1);assert.equal(a.enemies[0].gait,frozen);
 const g=make();g.start();g.enemies=[];const runner=g.spawn(900,200,'runner'),boss=g.spawn(900,400,'boss');
 const rp=runner.gait,bp=boss.gait;advance(g,1);assert.ok(runner.gait-rp>(boss.gait-bp)*2);
});

test('default fire is 30 percent and zero blocks manual and auto shots while skills still work',()=>{
 const g=new GardenGame();assert.equal(g.fireStrength,.3);g.start();g.auto=true;g.shooting=true;g.shoot();assert.ok(g.bullets.length);
 g.setFireStrength(0);assert.equal(g.bullets.length,0);g.shoot();advance(g,1);assert.equal(g.bullets.length,0);
 g.input('s');assert.equal(g.casts,1);assert.ok(g.freeze>0);g.start();assert.equal(g.fireStrength,0);
});
test('100 percent preserves original rate and lower settings reduce it for both firing modes',()=>{
 const count=(value,auto)=>{let shots=0;const g=new GardenGame({emit:t=>{if(t==='shot')shots++;}});g.setFireStrength(value);g.start();g.auto=auto;g.shooting=!auto;advance(g,3);return shots;};
 for(const auto of [true,false]){const full=count(1,auto),low=count(.3,auto);assert.ok(full>=18&&full<=21);assert.ok(low>=5&&low<=7);assert.ok(low<full*.4);assert.equal(count(0,auto),0);}
 const g=make();g.setFireStrength(-1);assert.equal(g.fireStrength,0);g.setFireStrength(2);assert.equal(g.fireStrength,1);g.setFireStrength(NaN);assert.equal(g.fireStrength,1);
});
test('spell length and recharge rate grow through late waves while fixed mode remains one letter',()=>{
 const g=make();g.start();for(const [wave,length] of [[1,1],[3,3],[5,6],[7,10],[10,16],[17,30],[32,60],[100,60]]){
  g.wave=wave;assert.equal(g.spellLength,length);assert.equal(g.nextCode(0).length,length);
 }
 g.wave=10;assert.equal(g.rechargeRate,2.44);g.stacks.recharge=2;assert.ok(Math.abs(g.rechargeRate-3.416)<.0001);
 g.adaptive=false;assert.equal(g.nextCode(0),'A');assert.equal(g.spellLength,1);
});
test('long spells keep progress across row boundaries, errors and pause and only cast after the final letter',()=>{
 const g=make();g.start();g.wave=10;g.skills[0].code=g.nextCode(0);const code=g.skills[0].code;
 for(const c of code.slice(0,7))g.input(c);assert.equal(g.skills[0].typed,7);assert.equal(g.casts,0);
 g.input(code[7]==='Z'?'X':'Z');assert.equal(g.skills[0].typed,7);g.pause();g.input(code[7]);assert.equal(g.skills[0].typed,7);g.resume();
 for(const c of code.slice(7))g.input(c);assert.equal(g.casts,1);assert.equal(g.skills[0].typed,0);
});
test('late wave cooldowns recover faster in real time and pause still stops recovery',()=>{
 const a=make(),b=make();a.start();b.start();b.wave=10;a.skills[0].cd=8;b.skills[0].cd=8;advance(a,1);advance(b,1);
 assert.ok(b.skills[0].cd<a.skills[0].cd-1);b.pause();const cd=b.skills[0].cd;advance(b,2);assert.equal(b.skills[0].cd,cd);
});

test('typing cannot slow spawning, freeze expiry, or enemy abilities',()=>{
 const a=make(),b=make();a.start();b.start();a.skills[0].code='AFJ';a.input('a');a.freeze=2;b.freeze=2;
 advance(a,6);advance(b,6);assert.equal(a.freeze,0);assert.equal(a.spawned,b.spawned);assert.equal(a.spawnIn,b.spawnIn);
 assert.deepEqual(a.enemies.map(z=>[z.x,z.gait,z.ability]),b.enemies.map(z=>[z.x,z.gait,z.ability]));
 a.select(2);const x=a.enemies[0].x;advance(a,1);assert.ok(a.enemies[0].x<x);
});

test('letter cap affects only future prompts, clamps bounds and survives restart',()=>{
 const g=make();g.start();g.wave=30;g.skills[0].code=g.nextCode(0);g.input('a');const code=g.skills[0].code;
 g.setMaxSpellLength(5);assert.equal(g.skills[0].code,code);assert.equal(g.skills[0].typed,1);assert.equal(g.nextCode(0).length,5);
 g.setMaxSpellLength(0);assert.equal(g.nextCode(1),'S');g.setMaxSpellLength(99);assert.equal(g.maxSpellLength,60);g.setMaxSpellLength(NaN);assert.equal(g.maxSpellLength,60);
 g.setMaxSpellLength(7);g.start();assert.equal(g.maxSpellLength,7);g.wave=20;g.adaptive=false;assert.equal(g.spellLength,1);
});
test('optional slow motion needs partial input and immediately stops when switched off',()=>{
 const a=make(),b=make();a.start();b.start();assert.equal(a.magicSlow,false);a.magicSlow=true;a.skills[0].code='AFJ';a.select(0);assert.equal(a.typingSlow,false);
 a.input('a');assert.equal(a.typingSlow,true);const ax=a.enemies[0].gait,bx=b.enemies[0].gait;
 advance(a,.5);advance(b,.5);assert.ok(Math.abs((a.enemies[0].gait-ax)/(b.enemies[0].gait-bx)-.22)<.001);
 a.magicSlow=false;const x=a.enemies[0].gait,y=b.enemies[0].gait;advance(a,.5);advance(b,.5);assert.ok(Math.abs((a.enemies[0].gait-x)-(b.enemies[0].gait-y))<.001);
});

test('sunflowers are chewed over time; zero defense has rescue time and repair restores flowers',()=>{
 const g=make();g.start();g.enemies=[];g.setFireStrength(0);const z=g.spawn(194,110,'walker');const initial=g.health;
 advance(g,.3);assert.equal(g.health,initial);const x=z.x;advance(g,.4);assert.equal(g.health,initial-.25);assert.equal(g.flowerHealth[0],.75);assert.equal(z.x,x);assert.ok(z.hp>0);
 g.freeze=2;const hp=g.health;advance(g,1);assert.equal(g.health,hp);
 g.freeze=0;g.health=0;advance(g,1);assert.equal(g.status,'playing');assert.ok(g.breachElapsed>0);g.health=2;assert.equal(g.breachElapsed,0);assert.equal(g.health,2);assert.ok(g.flowerHealth.some(h=>h>0));
 g.health=0;advance(g,2);assert.equal(g.status,'playing');g.pause();advance(g,4);assert.ok(Math.abs(g.breachElapsed-2)<.0001);g.resume();advance(g,1.2);assert.equal(g.status,'lost');
});
test('shots start at the illustrated muzzle and travel toward the crosshair',()=>{
 const g=make();g.start();g.auto=false;
 for(const [x,y] of [[800,110],[800,450],[200,280]]){
  g.setAim(x,y);g.bullets=[];g.shoot();const b=g.bullets[0],m=g.muzzle();assert.equal(b.x,m.x);assert.equal(b.y,m.y);
  assert.ok(Math.abs(b.vx*(y-m.y)-b.vy*(x-m.x))<.00001);
 }
});
