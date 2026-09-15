import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommunityStore} from '../community-store.mjs';
import {createLanServer} from '../lan-server.mjs';
test('accounts, recovery rotation, logout and scores survive a restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'letter-community-'));const path=join(dir,'rank.sqlite');let clock=Date.now();let s;
 try{
  s=new CommunityStore(path,{now:()=>clock});const a=s.register('小院甲'),b=s.register('小院乙');
  assert.equal(s.profile(a.token).name,'小院甲');assert.throws(()=>s.register('小院甲'));assert.throws(()=>s.register('<script>'));
  const run=s.startSolo(a.user,{mode:'english',level:2});clock+=60000;
  assert.throws(()=>s.finishSolo(b.user,{runId:run.runId,score:100,wave:1,kills:2,casts:1,seconds:50}));
  s.finishSolo(a.user,{runId:run.runId,score:100,wave:1,kills:2,casts:1,seconds:50});
  assert.equal(s.finishSolo(a.user,{runId:run.runId,score:999999}).duplicate,true);
  assert.equal(s.leaderboard('solo','english',2,a.user).me.score,100);
  assert.equal(s.leaderboard('solo','english',0).rows.length,0);
  const suspicious=s.startSolo(a.user,{mode:'letters',level:0});assert.throws(()=>s.finishSolo(a.user,{runId:suspicious.runId,score:1000000,wave:50,kills:100,casts:10,seconds:1000}));
  assert.throws(()=>s.startSolo(a.user,{mode:'english',level:0,custom:true}));
  const code=s.rotateRecovery(a.user);assert.throws(()=>s.restore(a.recoveryCode));const restored=s.restore(code);
  s.logout(a.token);assert.equal(s.profile(a.token),null);assert.equal(s.profile(restored.token).id,a.user.id);
  s.close();s=new CommunityStore(path,{now:()=>clock});assert.equal(s.restore(code).user.id,a.user.id);assert.equal(s.leaderboard('solo','english',2).rows[0].score,100);
  const stored=s.db.prepare('SELECT recovery_hash FROM users WHERE id=?').get(a.user.id).recovery_hash;assert.notEqual(stored,code);
 }finally{s?.close();await rm(dir,{recursive:true,force:true});}
});
test('duel results are idempotent, disallow self-farming, and cap daily repeated opponents',()=>{
 let clock=Date.now();const s=new CommunityStore(':memory:',{now:()=>clock});try{
  const a=s.register('甲').user,b=s.register('乙').user;
  assert.equal(s.recordDuel('short',[a.id,b.id],0,29).counted,false);
  assert.equal(s.recordDuel('self',[a.id,a.id],0,60).counted,false);
  assert.equal(s.recordDuel('guest',[a.id,null],0,60).counted,false);
  s.recordDuel('one',[a.id,b.id],0,60);s.recordDuel('one',[a.id,b.id],0,60);
  assert.equal(s.leaderboard('duel').rows[0].points,3);
  s.recordDuel('two',[b.id,a.id],null,60);s.recordDuel('three',[a.id,b.id],1,60);
  assert.equal(s.recordDuel('four',[a.id,b.id],0,60).counted,false);
  assert.equal(s.leaderboard('duel').rows[0].played,3);
  clock+=86400000;assert.equal(s.recordDuel('next-day',[a.id,b.id],0,60).counted,true);
 }finally{s.close();}
});
test('HTTP account ownership, score submission, cache validators, compression, and server-settled duels',async t=>{
 let clock=Date.now();const app=createLanServer(null,{storeOptions:{now:()=>clock}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.stop());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 async function post(path,data,cookie='',token=''){const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {res,data:await res.json()};}
 async function account(name){const {res,data}=await post('/api/account/register',{name});assert.equal(res.status,200);assert.match(res.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);return {cookie:res.headers.get('set-cookie').split(';')[0],user:data.user};}
 const a=await account('测试甲'),b=await account('测试乙');
 assert.equal((await post('/api/solo/start',{mode:'letters'})).res.status,401);
 const run=(await post('/api/solo/start',{mode:'letters',level:0},a.cookie)).data;clock+=60000;
 const summary={runId:run.runId,score:150,wave:2,kills:4,casts:2,seconds:50};
 assert.equal((await post('/api/solo/finish',summary,b.cookie)).res.status,404);
 assert.equal((await post('/api/solo/finish',summary,a.cookie)).res.status,200);
 const rank=await (await fetch(base+'/api/leaderboards?kind=solo&mode=letters',{headers:{Cookie:a.cookie}})).json();assert.equal(rank.me.score,150);assert.equal(rank.rows.length,1);
 const first=await fetch(base+'/engine.js');assert.equal(first.status,200);assert.equal(first.headers.get('content-encoding'),'gzip');const etag=first.headers.get('etag');await first.arrayBuffer();
 const cached=await fetch(base+'/engine.js',{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
 const image=await fetch(base+'/assets/garden.png',{method:'HEAD'});const version=image.headers.get('etag').split('"')[1].slice(0,12);
 assert.match((await fetch(base+'/assets/garden.png?v='+version,{method:'HEAD'})).headers.get('cache-control'),/immutable/);
 assert.doesNotMatch((await fetch(base+'/assets/garden.png?v=wrong',{method:'HEAD'})).headers.get('cache-control'),/immutable/);
 for(const path of ['/community-store.mjs','/data/community.sqlite','/.env'])assert.equal((await fetch(base+path)).status,404);
 const ra=(await post('/api/rooms',{name:'假冒别名',mode:'letters'},a.cookie)).data;
 assert.equal((await post('/api/rooms',{code:ra.code},a.cookie)).res.status,400);
 const rb=(await post('/api/rooms',{code:ra.code},b.cookie)).data;const room=app.rooms.get(ra.code);assert.equal(room.match.players[0].name,'测试甲');
 room.match.connect(0,true);room.match.connect(1,true);
 await post(`/api/room/${ra.code}/action`,{type:'ready'},a.cookie,ra.token);await post(`/api/room/${ra.code}/action`,{type:'ready'},b.cookie,rb.token);
 room.match.elapsed=35;
 await post(`/api/room/${ra.code}/action`,{type:'surrender'},b.cookie,rb.token);
 let duel=await (await fetch(base+'/api/leaderboards?kind=duel')).json();assert.equal(duel.rows[0].name,'测试甲');assert.equal(duel.rows[0].points,3);
 await post(`/api/room/${ra.code}/action`,{type:'surrender'},b.cookie,rb.token);duel=await (await fetch(base+'/api/leaderboards?kind=duel')).json();assert.equal(duel.rows[0].points,3);
 const cross=await fetch(base+'/api/account/register',{method:'POST',headers:{Origin:'http://bad.invalid','Content-Type':'application/json'},body:'{"name":"bad"}'});assert.equal(cross.status,403);
});
