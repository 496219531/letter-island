import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLanServer} from '../lan-server.mjs';
test('HTTP + two independent SSE clients: room lifecycle, commands, auth, reconnect and rematch',async t=>{
  const app=createLanServer();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.stop());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  async function post(path,data,token){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};}
  const a=(await post('/api/rooms',{name:'甲',mode:'english',level:1})).data;
  const b=(await post('/api/rooms',{name:'乙',code:a.code})).data;
  assert.equal(a.code,b.code);assert.notEqual(a.token,b.token);assert.equal((await post('/api/rooms',{code:a.code})).status,400);
  assert.equal((await post(`/api/room/${a.code}/action`,{type:'surrender'},'wrong')).status,401);
  const controllers=[];t.after(()=>controllers.forEach(c=>c.abort()));
  async function connect(p){const controller=new AbortController();controllers.push(controller);const res=await fetch(`${base}/api/room/${p.code}/events?token=${p.token}`,{signal:controller.signal});assert.match(res.headers.get('content-type'),/event-stream/);return {reader:res.body.getReader(),controller,buffer:''};}
  async function until(client,predicate){
    const deadline=setTimeout(()=>client.controller.abort(),5000);
    try{for(;;){let end;while((end=client.buffer.indexOf('\n\n'))>=0){const event=client.buffer.slice(0,end);client.buffer=client.buffer.slice(end+2);if(event.startsWith('data: ')){const data=JSON.parse(event.slice(6));if(predicate(data))return data;}}
      const {value,done}=await client.reader.read();if(done)throw new Error('SSE stream ended');client.buffer+=new TextDecoder().decode(value);
    }}finally{clearTimeout(deadline);}
  }
  const ca=await connect(a),cb=await connect(b);
  await until(ca,s=>s.players.every(p=>p?.connected));
  assert.equal((await post(`/api/room/${a.code}/action`,{type:'ready'},a.token)).status,200);
  await post(`/api/room/${b.code}/action`,{type:'ready'},b.token);
  const sa=await until(ca,s=>s.status==='playing'),sb=await until(cb,s=>s.status==='playing');assert.equal(sa.side,0);assert.equal(sb.side,1);
  await post(`/api/room/${a.code}/action`,{type:'send',unit:'runner'},a.token);
  const incoming=await until(cb,s=>s.fields?.[1].enemies.some(z=>z.owner===0&&z.type==='runner'));assert.ok(incoming.fields[1].enemies.length);
  assert.equal((await post(`/api/room/${a.code}/action`,{type:'cast',index:0},a.token)).status,400);
  cb.controller.abort();await until(ca,s=>s.paused);
  const reconnected=await connect(b);await until(reconnected,s=>!s.paused&&s.status==='playing');
  // A silent half-open TCP connection is also detected, without waiting for OS timeouts.
  app.rooms.get(a.code).lastSeen[1]=Date.now()-7000;
  await until(ca,s=>s.paused);
  const heartbeatReconnect=await connect(b);await until(heartbeatReconnect,s=>!s.paused&&s.status==='playing');
  assert.equal((await post(`/api/room/${b.code}/action`,{type:'ping'},b.token)).status,200);
  await post(`/api/room/${b.code}/action`,{type:'surrender'},b.token);const done=await until(ca,s=>s.status==='finished');assert.equal(done.winner,0);
  await post(`/api/room/${a.code}/action`,{type:'ready'},a.token);await post(`/api/room/${b.code}/action`,{type:'ready'},b.token);await until(ca,s=>s.round===2&&s.status==='playing');
  await post(`/api/room/${a.code}/action`,{type:'surrender'},a.token);
  await post(`/api/room/${a.code}/action`,{type:'ready'},a.token);
  await post(`/api/room/${a.code}/action`,{type:'unready'},a.token);
  assert.equal(app.rooms.get(a.code).match.players[0].ready,false);
  assert.equal((await post(`/api/room/${b.code}/leave`,{},b.token)).status,200);
  assert.equal((await post(`/api/room/${b.code}/action`,{type:'ping'},b.token)).status,401);
  assert.equal(app.rooms.get(a.code).match.status,'waiting');
  const replacement=await post('/api/rooms',{name:'手机新玩家',mobile:true,code:a.code});
  assert.equal(replacement.status,200);assert.equal(replacement.data.side,1);
  assert.notEqual(replacement.data.token,b.token);
  // Abandoned seats expire after the reconnect grace period.
  app.rooms.get(a.code).lastSeen[1]=Date.now()-31000;
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(app.rooms.get(a.code).match.players[1],null);
  assert.equal((await post(`/api/room/${a.code}/leave`,{},a.token)).status,200);
  assert.equal(app.rooms.has(a.code),false);
  const cross=await fetch(base+'/api/rooms',{method:'POST',headers:{Origin:'http://elsewhere.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
  for(const path of ['/lan-server.mjs','/duel.cjs','/.git/config','/package.json'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/duel.html')).status,200);assert.ok(Array.isArray((await (await fetch(base+'/api/lan')).json()).addresses));
});
