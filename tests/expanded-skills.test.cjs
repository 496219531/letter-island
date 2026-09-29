const {test}=require('node:test'),assert=require('node:assert/strict');
const {GardenGame,SKILLS}=require('../engine.js'),save=require('../save.js');
function setup(kind){const g=new GardenGame({random:()=>.4});g.start();g.enemies=[];g.spawnIn=100;g.fireStrength=0;Object.assign(g.skills[0],SKILLS[kind],{kind});return g;}
function spawn(g,x=600,y=280,type='walker',hp=10000){const z=g.spawn(x,y,type,false);z.hp=z.maxHp=hp;return z;}
function tick(g,t){for(let i=0;i<t*60;i++)g.update(1/60);}
test('new skills have four-character names and lightning hits ten different enemies with rising damage',()=>{for(const kind of ['charm','rage','lightning','blackhole','clones','deathchain','judgment'])assert.equal(SKILLS[kind].name.length,4);const g=setup('lightning');const zs=Array.from({length:12},(_,i)=>spawn(g,300+i*55));g.cast(0);assert.equal(zs.filter(z=>z.hp<z.maxHp).length,10);assert.ok(zs[8].maxHp-zs[8].hp>zs[0].maxHp-zs[0].hp);});
test('charm ignores the aim point and converts one frontline hostile per lane',()=>{const g=setup('charm');g.auto=true;const lane0=spawn(g,200,140,'boss'),rear0=spawn(g,800,140),lane3=spawn(g,400,365),rear3=spawn(g,820,365);g.setAim(810,400);g.cast(0);assert.ok(lane0.charmed&&lane3.charmed);assert.ok(!rear0.charmed&&!rear3.charmed);const effect=g.effects.find(e=>e.kind==='charm');assert.deepEqual(effect.targets,[{x:lane0.x,y:lane0.y},{x:lane3.x,y:lane3.y}]);const snapshot=save.encode(g);assert.ok(save.validate(snapshot));const loaded=new GardenGame();assert.ok(save.restore(loaded,snapshot));assert.ok(loaded.enemies.find(z=>z.boss).charmed);});
test('black hole uses the reduced 105px radius, pulls and damages hostiles, finishes with a blast and preserves allies',()=>{const g=setup('blackhole');const a=spawn(g,600),b=spawn(g,680),friend=spawn(g,620,100);friend.charmed=true;g.cast(0);const effect=g.effects.find(e=>e.kind==='blackhole');assert.equal(effect?.radius,105);tick(g,1);assert.ok(a.hp<10000&&b.hp<10000);assert.equal(friend.hp,10000);g.enemies=g.enemies.filter(z=>z!==friend);const hp=a.hp;tick(g,2.2);assert.ok(a.hp<hp);assert.ok(!g.effects.some(e=>e.kind==='blackhole'));});
test('clones fire independently while normal shooting is off and double inherited damage',()=>{const g=setup('clones');spawn(g,1000);g.stacks.multishot=2;g.stacks.power=2;g.cast(0);g.update(1/60);assert.equal(g.bullets.length,6);assert.ok(g.bullets.every(b=>b.damage===72));g.pause();const duration=g.clones;tick(g,1);assert.equal(g.clones,duration);g.resume();tick(g,8.1);assert.equal(g.clones,0);});
test('death chain propagates each kill once without hurting allies or recurring after expiration',()=>{const g=setup('deathchain');const a=spawn(g,400,280,'walker',100),b=spawn(g,550,280,'walker',100),c=spawn(g,700,280,'walker',100),friend=spawn(g,450,280,'walker',100);friend.charmed=true;g.cast(0);g.damage(a,101);assert.ok(b.hp<=0&&c.hp<=0);assert.equal(g.kills,3);assert.equal(g.score,30);assert.equal(friend.hp,100);assert.equal(g.deathQueue.length,0);const z=spawn(g,900,100);g.cast(0);tick(g,8.2);assert.equal(z.deathMark,0);});
test('judgment automatically executes the six healthiest enemies and supports target upgrades',()=>{let g=setup('judgment');const zs=Array.from({length:8},(_,i)=>spawn(g,300+i*55,280,'walker',1000+i*100));g.cast(0);assert.equal(zs.filter(z=>z.hp<=0).length,6);g=setup('judgment');g.stacks.judgmentTargets=2;const boss=spawn(g,900,280,'boss',10000);const others=Array.from({length:7},(_,i)=>spawn(g,400+i*40,280,'walker',1000));g.cast(0);assert.equal(others.filter(z=>z.hp<=0).length,7);assert.equal(boss.hp,4500);});
test('all persistent new skill states round-trip through saves and legacy snapshots still load',()=>{for(const kind of ['lightning','blackhole','clones','deathchain','judgment']){const g=setup(kind);spawn(g);g.cast(0);const snapshot=save.encode(g);assert.ok(save.validate(snapshot),kind);const loaded=new GardenGame();assert.ok(save.restore(loaded,snapshot));assert.equal(loaded.skills[0].kind,kind);loaded.resume();loaded.update(.02);}const g=setup('clones');const snapshot=save.encode(g);delete snapshot.state.clones;delete snapshot.state.cloneShot;assert.ok(save.restore(g,snapshot));assert.equal(g.clones,0);});
test('each clone matches ordinary captain cadence without a skill speed bonus',()=>{
 for(const strength of [.1,.3,1])for(const rapid of [0,3]){
  const g=setup('clones');spawn(g,1000);g.fireStrength=strength;g.stacks.rapid=rapid;g.auto=true;
  const counts={captain:0,upper:0,lower:0};g.shoot=origin=>{counts[!origin?'captain':origin.y<g.hero.y?'upper':'lower']++;};
  g.cast(0);tick(g,2);assert.equal(counts.upper,counts.captain);assert.equal(counts.lower,counts.captain);
 }
});
test('clones keep ordinary cadence during rage and use default cadence when normal fire is off',()=>{
 const g=setup('clones');spawn(g,1000);g.cast(0);assert.equal(g.ordinaryShotInterval,.5);g.rage=5;
 const counts={captain:0,clone:0};g.shoot=origin=>{counts[origin?'clone':'captain']++;};tick(g,2);
 assert.ok(counts.captain>counts.clone/2);assert.ok(counts.clone/2<=4);
});

test('clone damage doubles after power upgrades without changing normal or rage bullets',()=>{
 const g=setup('clones');const target=spawn(g,1000);g.fireStrength=.3;g.stacks.power=4;
 g.shoot();assert.ok(g.bullets.every(b=>b.damage===48));g.bullets=[];
 g.cast(0);g.update(1/60);assert.equal(g.bullets.length,2);assert.ok(g.bullets.every(b=>b.damage===96));g.bullets=[];
 g.rage=5;g.shoot();assert.equal(g.bullets.length,10);assert.ok(g.bullets.every(b=>b.damage===144));g.bullets=[];
 g.shoot({x:135,y:192,target});assert.equal(g.bullets.length,1);assert.equal(g.bullets[0].damage,96);
});

test('special upgrade cards require their equipped skill, stop at caps, and retain stacks after expiry',()=>{
 const {CARDS}=require('../engine.js'),rules={blackholeRadius:['blackhole',5],cloneCount:['clones',4],deathchainPower:['deathchain'],lightningTargets:['lightning',5],charmTargets:['charm',2],rageDuration:['rage',10],judgmentTargets:['judgment',6]};
 for(const [id,[kind,max]] of Object.entries(rules)){
  const g=new GardenGame();g.start();const card=CARDS.find(c=>c.id===id);assert.ok(card);assert.equal(g.canOfferCard(card),false);
  Object.assign(g.skills[0],SKILLS[kind],{kind,remainingUses:1,baseKind:'laser'});assert.equal(g.canOfferCard(card),true);
  g.status='upgrade';g.offers=[card];assert.ok(g.chooseCard(id));assert.equal(g.stack(id),1);
  spawn(g);g.cast(0);assert.equal(g.skills[0].kind,'laser');assert.equal(g.stack(id),1);assert.equal(g.canOfferCard(card),false);
  Object.assign(g.skills[0],SKILLS[kind],{kind,remainingUses:5});if(max!==undefined){g.stacks[id]=max;assert.equal(g.canOfferCard(card),false);}
  const loaded=new GardenGame();assert.ok(save.restore(loaded,save.encode(g)));assert.equal(loaded.stack(id),g.stack(id));assert.equal(loaded.skills[0].kind,kind);
 }
});
test('black hole radius upgrades cover more enemies and preserve their radius through restore',()=>{
 const g=setup('blackhole');g.stacks.blackholeRadius=3;g.setSkillAim(500,280);const inside=spawn(g,665),outside=spawn(g,690);g.cast(0);
 assert.equal(g.effects[0].radius,180);const loaded=new GardenGame();assert.ok(save.restore(loaded,save.encode(g)));assert.equal(loaded.effects[0].radius,180);loaded.resume();loaded.update(.01);
 assert.ok(loaded.enemies.find(z=>z.id===inside.id).hp<10000);assert.equal(loaded.enemies.find(z=>z.id===outside.id).hp,10000);
 g.stacks.blackholeRadius=100;assert.equal(g.blackholeRadius,230);
 const legacy=save.encode(g);delete legacy.state.effects[0].radiusVersion;legacy.state.effects[0].radius=210;assert.ok(save.restore(loaded,legacy));assert.equal(loaded.effects[0].radius,105);
});
test('clone cards add shooters and share the same six-position limit used for rendering',()=>{
 const g=setup('clones');g.stacks.cloneCount=100;g.stacks.power=2;spawn(g,1000);g.cast(0);g.update(.01);
 assert.equal(g.cloneCount,6);assert.equal(g.cloneOrigins().length,6);assert.equal(g.bullets.length,6);assert.ok(g.bullets.every(b=>b.damage===72));
 const positions=g.cloneOrigins();assert.deepEqual(g.bullets.map(b=>b.py),positions.map(p=>p.y));
});
test('lightning and judgment target upgrades obey their caps and effects remain saveable',()=>{
 for(const [kind,card,count] of [['lightning','lightningTargets',20],['judgment','judgmentTargets',12]]){
  const g=setup(kind);g.stacks[card]=100;const enemies=Array.from({length:25},(_,i)=>spawn(g,300+i*20));g.cast(0);assert.equal(enemies.filter(z=>z.hp<z.maxHp).length,count);
  assert.ok(save.validate(save.encode(g)));const loaded=new GardenGame();assert.ok(save.restore(loaded,save.encode(g)));
 }
});
test('charm upgrades convert the three foremost enemies of each lane at most',()=>{
 const g=setup('charm');g.stacks.charmTargets=100;const lanes=[];
 for(let lane=0;lane<5;lane++)lanes.push(Array.from({length:4},(_,i)=>spawn(g,300+i*100,140+lane*75)));
 g.cast(0);for(const members of lanes){assert.ok(members.slice(0,3).every(z=>z.charmed));assert.ok(!members[3].charmed);}
 assert.equal(g.effects.find(e=>e.kind==='charm').targets.length,15);assert.ok(save.validate(save.encode(g)));
});
test('chain explosion cards multiply each detonation while rage duration stops at fifteen seconds',()=>{
 for(const layers of [0,2]){const g=setup('deathchain');g.stacks.deathchainPower=layers;const marked=spawn(g,400,280,'walker',100),neighbor=spawn(g,500,280);g.cast(0);g.damage(marked,1000);assert.equal(neighbor.hp,10000-360*(1+.25*layers));}
 const g=setup('rage');g.stacks.rageDuration=100;spawn(g);g.cast(0);assert.equal(g.rage,15);assert.ok(save.validate(save.encode(g)));
});
test('six clones cap rendered volleys while preserving upgraded total damage',()=>{
 const g=setup('clones');g.stacks.cloneCount=4;g.stacks.multishot=99;g.stacks.power=2;spawn(g,1000);g.cast(0);g.update(.01);
 assert.equal(g.bullets.length,30);assert.equal(g.bullets.reduce((sum,b)=>sum+b.damage,0),6*100*24*1.5*2);
});

test('damage skills keep their relative power across waves while ordinary bullets stay unchanged',()=>{
 const ratios=new Map();
 for(const wave of [1,5,15,30,50])for(const kind of ['laser','melon','rage','clones','lightning','blackhole']){
  const g=setup(kind);g.wave=wave;const z=spawn(g,700,280,'walker',10000*g.skillGrowth);g.setSkillAim(700,280);g.stacks.magic=2;
  const hits=[];g.damage=(enemy,damage,source)=>hits.push({damage,source});g.cast(0);
  let amount;
  if(kind==='laser'||kind==='lightning')amount=hits[0].damage;
  if(kind==='melon')amount=g.effects.find(e=>e.kind==='melon').damage;
  if(kind==='rage'){g.shoot();amount=g.bullets[0].damage;assert.equal(g.bullets.length,10);}
  if(kind==='clones'){g.update(.01);amount=g.bullets[0].damage;assert.equal(g.bullets.length,2);}
  if(kind==='blackhole'){g.update(.01);amount=hits.find(h=>h.source==='blackhole').damage;}
  const ratio=amount/z.maxHp,key=kind;if(!ratios.has(key))ratios.set(key,ratio);assert.ok(Math.abs(ratio-ratios.get(key))<1e-10,kind+' wave '+wave);
  g.rage=0;g.clones=0;g.bullets=[];g.fireStrength=.3;g.shoot();assert.equal(g.bullets[0].damage,24);
 }
});
test('ice grows ordinary-bullet damage once, preserves special growth through saves, and ends cleanly',()=>{
 for(const wave of [1,15,50])for(const kind of ['normal','rage','clones']){
  const g=setup('clones');g.wave=wave;const z=spawn(g,900,280,'walker',1e9*g.skillGrowth);g.fireStrength=.3;
  if(kind==='rage')g.rage=5;
  if(kind==='clones')g.shoot({x:135,y:192,target:z});else g.shoot();
  g.freeze=6;const snapshot=save.encode(g),loaded=new GardenGame();assert.ok(save.restore(loaded,snapshot));const target=loaded.enemies[0],before=target.hp;
  loaded.hitBullet(loaded.bullets[0],target);
  const expected=24*({normal:1,rage:3,clones:2}[kind])*g.skillGrowth*2;
  assert.ok(Math.abs((before-target.hp)/expected-1)<1e-6,kind+' wave '+wave);
  loaded.freeze=0;loaded.rage=0;loaded.bullets=[];loaded.shoot();assert.equal(loaded.bullets[0].damage,24);
  snapshot.state.bullets[0].skillShot='bad';assert.equal(save.validate(snapshot),false);
 }
});
test('percentage-based judgment, charm and death chain do not multiply enemy health twice',()=>{
 for(const wave of [1,15,50]){
  const judgment=setup('judgment');judgment.wave=wave;const boss=spawn(judgment,900,280,'boss',10000*judgment.skillGrowth);judgment.cast(0);assert.ok(Math.abs(boss.hp/boss.maxHp-.45)<1e-10);
  const charm=setup('charm');charm.wave=wave;const ally=spawn(charm,500,280,'boss',10000*charm.skillGrowth);charm.cast(0);assert.ok(ally.charmed);assert.equal(ally.hp,ally.maxHp);
  const chain=setup('deathchain');chain.wave=wave;chain.stacks.deathchainPower=2;const marked=spawn(chain,400,280,'walker',100*chain.skillGrowth),neighbor=spawn(chain,500,280,'walker',10000*chain.skillGrowth);chain.cast(0);chain.damage(marked,marked.hp+1);assert.ok(Math.abs((neighbor.maxHp-neighbor.hp)/chain.skillGrowth-540)<1e-8);
 }
});
test('growth keeps specialist attribute bonuses multiplicative and remains finite in extreme waves',()=>{
 const g=setup('laser');g.wave=30;const unupgraded=g.laserDamage;g.stacks.magic=2;g.stacks.laserPower=2;assert.ok(Math.abs(g.laserDamage/unupgraded-2.25)<1e-10);
 const restored=new GardenGame();assert.ok(save.restore(restored,save.encode(g)));assert.equal(restored.skillGrowth,g.skillGrowth);assert.equal(restored.laserDamage,g.laserDamage);
 g.wave=10000;assert.equal(g.skillGrowth,1e12);assert.ok(Number.isFinite(g.laserDamage));assert.ok(Number.isFinite(g.spawn(900,280,'boss',false).hp));
});

test('external tools have six health per stack and zombies consume one layer at a time',()=>{
 const g=setup('laser');g.stacks.recharge=2;const site=g.upgradeSites().find(p=>p.id==='recharge');const z=spawn(g,site.x+20,site.y,'walker',1e9);z.speed=0;z.biteIn=0;
 const x=z.x;g.update(.01);assert.equal(g.upgradeHealth.recharge,11);assert.equal(g.stack('recharge'),2);assert.equal(z.x,x);assert.equal(z.eating,true);
 for(let i=0;i<5;i++){z.biteIn=0;g.update(.01);}assert.equal(g.stack('recharge'),1);assert.equal(g.upgradeHealth.recharge,6);
 for(let i=0;i<6;i++){z.biteIn=0;g.update(.01);}assert.equal(g.stack('recharge'),0);assert.ok(!g.upgradeSites().some(p=>p.id==='recharge'));
 z.speed=20;g.update(.05);assert.ok(z.x<x);
});
test('allied and out-of-lane zombies ignore tools, but ice does not stop chewing',()=>{
 const g=setup('laser');g.stacks.recharge=1;const site=g.upgradeSites()[0];const friend=spawn(g,site.x+20,site.y);friend.charmed=true;friend.biteIn=0;friend.speed=0;
 const other=spawn(g,site.x+20,site.y+75);other.speed=0;other.biteIn=0;g.update(.01);assert.equal(g.upgradeHealth.recharge,undefined);
 g.enemies=[];const foe=spawn(g,site.x+20,site.y);foe.biteIn=0;foe.speed=0;g.freeze=6;g.update(.01);assert.equal(g.upgradeHealth.recharge,5);
});
test('loss of defensive structures removes future bonuses and does not reverse healing',()=>{
 const {CARDS}=require('../engine.js'),g=setup('laser');g.stacks.fortify=2;g.maxHealth=12;g.health=12;g.damageUpgrade('fortify',6);assert.equal(g.maxHealth,10);assert.equal(g.health,10);assert.ok(save.validate(save.encode(g)));
 g.stacks.repair=1;const hp=g.health;g.damageUpgrade('repair',6);assert.equal(g.health,hp);assert.equal(g.stack('repair'),0);
 g.stacks.magic=1;const damage=g.laserDamage;g.damageUpgrade('magic',6);assert.ok(g.laserDamage<damage);
 g.status='upgrade';g.offers=[CARDS.find(c=>c.id==='magic')];assert.ok(g.chooseCard('magic'));assert.equal(g.stack('magic'),1);assert.equal(g.upgradeHealth.magic,6);
 g.damageUpgrade('magic',2);g.status='upgrade';g.offers=[CARDS.find(c=>c.id==='magic')];g.chooseCard('magic');assert.equal(g.stack('magic'),2);assert.equal(g.upgradeHealth.magic,10);
});
test('damaged tool health survives restore, invalid saves are rejected, and old saves start undamaged',()=>{
 const g=setup('laser');g.stacks.recharge=2;g.damageUpgrade('recharge',2);const snapshot=save.encode(g),loaded=new GardenGame();assert.ok(save.restore(loaded,snapshot));assert.equal(loaded.upgradeHealth.recharge,10);assert.equal(loaded.stack('recharge'),2);
 loaded.damageUpgrade('recharge',4);assert.equal(loaded.stack('recharge'),1);
 for(const bad of [0,13,-1,'4',6]){snapshot.state.upgradeHealth.recharge=bad;assert.equal(save.validate(snapshot),false);}
 delete snapshot.state.upgradeHealth;assert.ok(save.restore(loaded,snapshot));assert.deepEqual(loaded.upgradeHealth,{});assert.equal(loaded.stack('recharge'),2);loaded.start();assert.equal(loaded.upgradeSites().length,0);
});
test('cactus health doubles with two stacks; internal damage and skill upgrades cannot be eaten',()=>{
 const g=setup('laser');g.stacks.thorns=2;assert.equal(g.upgradeSites().filter(p=>p.id==='thorns').length,8);g.damageUpgrade('thorns',5);assert.equal(g.upgradeHealth.thorns,7);assert.equal(g.stack('thorns'),2);g.damageUpgrade('thorns',1);assert.equal(g.stack('thorns'),1);g.damageUpgrade('thorns',6);assert.ok(!g.upgradeSites().some(p=>p.id==='thorns'));
 for(const id of ['power','rapid','critPower','laserPower','cloneCount','lightningTargets','charmTargets','judgmentTargets','rageDuration','blackholeRadius']){g.stacks[id]=2;assert.equal(g.damageUpgrade(id,100),false);assert.equal(g.stack(id),2);assert.ok(!g.upgradeSites().some(p=>p.id===id));}
});
