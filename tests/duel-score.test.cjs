const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DuelMatch}=require('../duel.cjs');
function match(options={}){const m=new DuelMatch({battleMode:'score',duration:60,...options});m.join('A');m.join('B');m.connect(0,true);m.connect(1,true);m.begin();return m;}
function ticks(m,n){for(let i=0;i<Math.round(n*20);i++)m.tick(.05);}
test('duration choices are validated, locked and preserved on rematch',()=>{
 for(const duration of [60,180,300,600])assert.equal(match({duration}).config.duration,duration);
 for(const duration of [0,1,59,61,NaN,Infinity,'60'])assert.throws(()=>match({duration}),/有效/);
 assert.throws(()=>match({battleMode:'bad'}),/有效/);
 const m=match();assert.equal(m.games[0].skills.length,4);assert.throws(()=>m.command(0,{type:'send',unit:'walker'}),/不能/);
 assert.throws(()=>m.command(0,{type:'duration',duration:600}),/不支持/);
 m.end(0,'test');m.command(0,{type:'ready'});m.command(1,{type:'ready'});assert.equal(m.config.duration,60);assert.equal(m.elapsed,0);
});
test('identical waves fight in independent gardens and damage never crosses players',()=>{
 const m=match({duration:300});ticks(m,20);const [a,b]=m.games;
 assert.deepEqual(a.enemies.map(z=>[z.type,z.x,z.y,z.hp]),b.enemies.map(z=>[z.type,z.x,z.y,z.hp]));
 assert.ok(a.enemies.length>0);assert.ok(a.enemies.every(z=>!z.engaged));
 const before=b.enemies[0].hp;a.damage(a.enemies[0],100000,'laser');
 assert.equal(b.enemies[0].hp,before);assert.ok(m.snapshot(0).fields[0].score>m.snapshot(0).fields[1].score);
 for(let i=0;i<17;i++)a.random();
 m.elapsed=181;m.waveIn=0;m.tick(.05);
 const attributes=z=>[z.type,z.x,z.y,z.hp,z.speed,z.gait];
 assert.deepEqual(attributes(a.enemies.at(-1)),attributes(b.enemies.at(-1)));
});
test('only kill points decide the result, and the clock stops exactly at the chosen duration',()=>{
 const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
 const z=m.games[0].spawn(500,290,'walker',false);m.games[0].damage(z,10000,'laser');
 m.games[1].practiceScore=5000;m.games[1].score=5000;
 m.elapsed=59.98;m.tick(.05);assert.equal(m.elapsed,60);assert.equal(m.status,'finished');assert.equal(m.winner,0);
 assert.match(m.reason,/10 分.*0 分/);m.tick(.05);assert.equal(m.elapsed,60);
 assert.throws(()=>m.command(1,{type:'key',key:'A'}),/尚未开始/);
});
test('leaks give no points or early defeat; equal scores draw',()=>{
 const m=match();m.waveIn=999;m.games.forEach(g=>g.auto=false);
 const z=m.games[0].spawn(196,290,'bomber',false);z.speed=200;ticks(m,.2);
 assert.equal(m.games[0].escaped,1);assert.equal(m.games[0].kills,0);assert.equal(m.games[0].health,56);
 assert.equal(m.status,'playing');m.elapsed=59.95;m.tick(.05);assert.equal(m.status,'finished');assert.equal(m.winner,null);
});
test('disconnect pauses both scores and timer; reconnect resumes and timeout still forfeits',()=>{
 const m=match();ticks(m,2);const t=m.elapsed,fields=m.snapshot(0).fields;
 m.connect(1,false);ticks(m,5);assert.equal(m.elapsed,t);assert.deepEqual(m.snapshot(0).fields,fields);
 m.connect(1,true);ticks(m,1);assert.ok(m.elapsed>t);m.connect(1,false);ticks(m,30.1);assert.equal(m.winner,0);
});
test('the longest duration remains bounded and ends even when neither player shoots',()=>{
 const m=match({duration:600});m.games.forEach(g=>g.auto=false);ticks(m,600);
 assert.equal(m.status,'finished');assert.equal(m.elapsed,600);assert.equal(m.winner,null);
 assert.ok(m.games.every(g=>g.enemies.length<=75&&g.escaped>0));
});
