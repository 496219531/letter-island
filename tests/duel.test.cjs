const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DuelMatch}=require('../duel.cjs');
function match(config) {
  const m=new DuelMatch(config);m.join('甲');m.join('乙');m.connect(0,true);m.connect(1,true);
  m.command(0,{type:'ready'});m.command(1,{type:'ready'});
  return m;
}
function ticks(m,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)m.tick(.05);}
test('room starts only after both connected players are ready; full rooms reject guests',()=>{
  const m=new DuelMatch();m.join('甲');m.connect(0,true);m.command(0,{type:'ready'});assert.equal(m.status,'waiting');
  m.join('乙');assert.throws(()=>m.command(1,{type:'ready'}));m.connect(1,true);m.command(1,{type:'ready'});assert.equal(m.status,'playing');
  assert.throws(()=>m.join('丙'));assert.throws(()=>new DuelMatch({mode:'speaking'}));
});
test('automatic troops and paid units attack only the opposing yard',()=>{
  const m=match();ticks(m,1.1);assert.equal(m.games[0].enemies.length,1);assert.equal(m.games[1].enemies.length,1);
  assert.equal(m.games[0].enemies[0].owner,1);assert.equal(m.games[1].enemies[0].owner,0);
  const before=m.players[0].sun;m.command(0,{type:'send',unit:'runner'});
  assert.equal(m.games[0].enemies.length,1);assert.equal(m.games[1].enemies.at(-1).type,'runner');assert.equal(m.players[0].sun,before-18);
  assert.throws(()=>m.command(0,{type:'send',unit:'runner'}),/冷却/);
  m.players[0].dispatchCd=0;assert.throws(()=>m.command(0,{type:'send',unit:'bomber'}),/阳光/);
  assert.throws(()=>m.command(0,{type:'send',unit:'__proto__'}));
});
test('one paid tap sends one unit to a random lane without stopping free troops',()=>{
  const m=match({random:()=>.35});m.players[0].sun=60;
  const before=m.players[0].sent;
  m.command(0,{type:'send',unit:'healer'});
  assert.equal(m.players[0].sent,before+1);
  assert.equal(m.players[0].sun,26);
  assert.equal(m.games[1].enemies.at(-1).y,215);
  ticks(m,2);assert.ok(m.players[0].sent>before+1);
  assert.ok(m.games[1].enemies.some(z=>z.type==='walker'));
});
test('typed support spells protect and heal the caster army in real time',()=>{
  const m=match(),own=m.games[1].spawn(500,290,'walker',false),foe=m.games[0].spawn(500,290,'walker',false);
  m.games.forEach(g=>g.auto=false);
  for(const key of m.games[0].skills[4].code)m.command(0,{type:'key',key});
  assert.equal(m.games[0].casts,1);assert.ok(own.wardTime>0);assert.equal(foe.wardTime||0,0);
  const before=own.hp;m.games[1].damage(own,40,'laser');assert.equal(own.hp,before-24);
  own.hp=own.maxHp*.5;
  for(const key of m.games[0].skills[5].code)m.command(0,{type:'key',key});
  assert.ok(own.hp>own.maxHp*.5);assert.ok(own.mendTime>0);
  assert.equal(foe.mendTime||0,0);
  m.send(0,'walker',false,140);assert.ok(m.games[1].enemies.at(-1).wardTime>0);
});
test('a support spell may be prepared before the next automatic wave arrives',()=>{
  const m=match();assert.equal(m.games[0].enemies.length,0);
  for(const key of m.games[0].skills[4].code)m.command(0,{type:'key',key});
  assert.equal(m.games[0].casts,1);
  ticks(m,.75);assert.ok(m.games[1].enemies[0].wardTime>0);
});
test('independent questions and typing: casting harms incoming enemies but never own troops or either yard',()=>{
  const m=match();const [a,b]=m.games;
  a.spawn(500,282,'walker',false);b.spawn(500,282,'walker',false);
  a.auto=false;b.auto=false;a.setAim(500,282);
  const theirCode=b.skills[0].code,ownCode=a.skills[0].code;
  for(const key of ownCode.slice(0,-1))m.command(0,{type:'key',key});
  assert.equal(a.skills[0].typed,ownCode.length-1);assert.equal(b.skills[0].typed,0);
  m.command(0,{type:'key',key:ownCode.at(-1)});
  assert.equal(a.enemies.length,0);assert.equal(a.casts,1);assert.equal(b.enemies[0].hp,b.enemies[0].maxHp);
  assert.equal(a.health,56);assert.equal(b.health,56);assert.equal(b.casts,0);assert.equal(b.skills[0].code,theirCode);assert.equal(b.skills[0].cd,0);
  assert.notEqual(a.skills,b.skills);assert.equal(m.snapshot(1).skills[0].code,theirCode);assert.equal(m.snapshot(1).fields[0].skills,undefined);
});
test('ice and delayed melon are confined to the caster yard',()=>{
  for(const index of [1,2]){
    const m=match();m.waveIn=999;const [a,b]=m.games;a.auto=b.auto=false;a.setAim(450,280);
    a.spawn(450,280,'walker',false);b.spawn(450,280,'walker',false);
    for(const key of a.skills[index].code)m.command(0,{type:'key',key});
    if(index===1){assert.ok(a.freeze>0);assert.equal(b.freeze,0);}
    else{ticks(m,.8);assert.equal(a.enemies.length,0);assert.equal(b.enemies[0].hp,b.enemies[0].maxHp);}
    assert.equal(a.health,56);assert.equal(b.health,56);
  }
});
test('disconnect freezes the entire simulation; reconnect resumes; timeout forfeits',()=>{
  const m=match();ticks(m,1);const elapsed=m.elapsed,sun=m.players[0].sun;m.connect(1,false);ticks(m,5);
  assert.equal(m.elapsed,elapsed);assert.equal(m.players[0].sun,sun);assert.equal(m.snapshot(0).paused,true);
  assert.throws(()=>m.command(0,{type:'key',key:'A'}));m.connect(1,true);ticks(m,.1);assert.ok(m.elapsed>elapsed);
  m.connect(1,false);ticks(m,30.1);assert.equal(m.status,'finished');assert.equal(m.winner,0);
});
test('both yards losing in the same tick draws; rematch requires both and resets all combat state',()=>{
  const m=match();m.games.forEach(g=>{g.health=0;g.breachElapsed=2.99;});m.tick(.05);
  assert.equal(m.status,'finished');assert.equal(m.winner,null);m.command(0,{type:'ready'});assert.equal(m.status,'finished');
  m.command(1,{type:'ready'});assert.equal(m.status,'playing');assert.equal(m.round,2);assert.equal(m.elapsed,0);assert.equal(m.games[0].health,56);assert.equal(m.games[0].casts,0);assert.equal(m.players[0].sun,24);
});
test('yard breach declares the opposing player winner and commands cannot change a finished match',()=>{
  const m=match();m.games[0].health=0;m.games[0].breachElapsed=2.99;m.tick(.05);assert.equal(m.winner,1);
  assert.throws(()=>m.command(0,{type:'key',key:'A'}));
});
test('English modes generate library-backed questions independently and accept ordered input',()=>{
  for(const mode of ['english','sentences'])for(let level=0;level<5;level++){
    const m=match({mode,level}),a=m.games[0];a.spawn(400,282,'walker',false);a.auto=false;a.setAim(400,282);
    assert.ok(m.snapshot(0).skills[0].meaning);
    for(const key of a.skills[0].code)m.command(0,{type:'key',key});
    assert.equal(a.casts,1);assert.equal(m.games[1].casts,0);
  }
});
test('population cap rejects paid sends without spending sun; solo waves never spawn',()=>{
  const m=match();m.players[0].sun=100;for(let i=0;i<75;i++)m.games[1].spawn(1000,200,'armor',false);
  assert.throws(()=>m.command(0,{type:'send',unit:'runner'}),/已满/);assert.equal(m.players[0].sun,100);
  m.games[0].update(.05);assert.equal(m.games[0].enemies.length,0);assert.equal(m.games[0].status,'playing');
});

test('troops depart their own yards and meet in one shared lane before defensive guns fire',()=>{
  const m=match({random:()=>.35});m.send(0,'walker',false,290);m.send(1,'walker',false,290);m.waveIn=999;
  const left=m.games[1].enemies[0],right=m.games[0].enemies[0];
  assert.equal(1000-left.x,200);assert.equal(right.x,800);
  ticks(m,1);assert.ok(1000-left.x>200);assert.ok(right.x<800);
  assert.equal(left.hp,left.maxHp);assert.equal(right.hp,right.maxHp);
  for(let n=0;n<300&&!left.engaged;n++)m.tick(.05);
  assert.ok(left.engaged&&right.engaged);assert.ok(left.hp<left.maxHp&&right.hp<right.maxHp);
  assert.ok(Math.abs((1000-left.x)-right.x)<=left.radius+right.radius+5);
  const x=left.x;ticks(m,.1);assert.equal(left.x,x);
  assert.equal(m.games[0].health,56);assert.equal(m.games[1].health,56);
});
test('mutual bites are simultaneous, cannot hurt allies, and only connect on the same lane',()=>{
  const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
  const a=m.games[1].spawn(530,290,'walker',false),b=m.games[0].spawn(530,290,'walker',false);
  a.hp=b.hp=10;m.tick(.05);
  assert.equal(m.games[0].enemies.length,0);assert.equal(m.games[1].enemies.length,0);
  assert.equal(m.games[0].kills,1);assert.equal(m.games[1].kills,1);
  const c=m.games[1].spawn(530,140,'walker',false),d=m.games[0].spawn(530,430,'walker',false);
  m.games[1].spawn(531,140,'walker',false);m.tick(.05);
  assert.equal(c.hp,c.maxHp);assert.equal(d.hp,d.maxHp);assert.equal(c.engaged,false);
});
test('an ice-slowed army still bites; survivors advance after winning and damage the opposing yard',()=>{
  const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
  const friendly=m.games[1].spawn(530,290,'armor',false),enemy=m.games[0].spawn(530,290,'walker',false);
  m.games[0].freeze=2;enemy.hp=10;
  m.tick(.05);assert.equal(m.games[0].enemies.length,0);assert.ok(friendly.hp<friendly.maxHp);
  const before=friendly.x;m.tick(.05);assert.ok(friendly.x<before);
  friendly.x=195;ticks(m,1);assert.ok(m.games[1].health<56);assert.equal(m.games[0].health,56);
});
test('battlefield perspective mirrors the same units and ranged attacks remain enemy-only',()=>{
  const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
  m.send(0,'armor',false,290);m.send(1,'walker',false,290);
  const a=m.snapshot(0),b=m.snapshot(1);assert.deepEqual(a.fields,b.fields);
  const allied=m.games[1].enemies[0],foe=m.games[0].enemies[0];
  m.games[0].setAim(foe.x,foe.y);for(const key of m.games[0].skills[0].code)m.command(0,{type:'key',key});
  assert.equal(m.games[0].enemies.length,0);assert.equal(allied.hp,allied.maxHp);
  assert.equal(m.games[0].health,56);assert.equal(m.games[1].health,56);
});

test('a defender intercepting at the yard stops both bites and bomber damage to the yard',()=>{
  for(const type of ['walker','bomber']){
    const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
    m.games[0].spawn(195,290,type,false);m.games[1].spawn(800,290,'armor',false);
    ticks(m,1);assert.equal(m.games[0].health,56);assert.ok(m.games[0].enemies[0].engaged);
    assert.ok(m.games[0].enemies[0].hp<m.games[0].enemies[0].maxHp);
  }
});

test('automatic troops keep arriving, with faster and more varied later phases',()=>{
  const m=match({random:()=>.35});
  assert.ok(m.games.every(g=>g.enemies.length===0));
  ticks(m,.6);assert.equal(m.players[0].sent,0);
  ticks(m,.15);assert.equal(m.players[0].sent,1);assert.equal(m.players[1].sent,1);
  assert.equal(m.games[0].enemies[0].speed,(23+2.3)*1.65);
  ticks(m,1);assert.equal(m.players[0].sent,2);
  ticks(m,30);assert.ok(m.players[0].sent>30);assert.equal(m.players[0].sent,m.players[1].sent);
  assert.equal(m.games[0].wave,1);
  m.elapsed=61;m.waveIn=0;m.tick(.05);assert.equal(m.snapshot(0).phaseName,'增援');assert.ok(m.games[0].enemies.some(z=>z.type==='runner'||z.type==='armor'));
});
test('continuous unattended armies stay active through the opening and resolve in the late battle',()=>{
  let seed=1;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const m=match({random});let peak=0;
  for(let i=0;i<2400;i++){m.tick(.05);peak=Math.max(peak,m.games[0].enemies.length+m.games[1].enemies.length);}
  assert.equal(m.status,'playing');assert.deepEqual(m.games.map(g=>g.health),[56,56]);assert.ok(peak>=30);
  for(let i=0;i<4800&&m.status==='playing';i++)m.tick(.05);
  assert.equal(m.status,'finished');assert.ok(m.elapsed>=180&&m.elapsed<=360);
});
