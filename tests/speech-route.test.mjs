import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createLanServer} from '../lan-server.mjs';
test('speech endpoints expose capability without recording and reject foreign origins, hosts and invalid audio',async t=>{
  const app=createLanServer();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.stop());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const info=await(await fetch(base+'/api/speech/status')).json();assert.equal(typeof info.available,'boolean');
  assert.equal((await fetch(base+'/api/speech/authorize',{method:'POST',headers:{Origin:'http://other.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
  const status=await new Promise(resolve=>{const req=http.request(base+'/api/speech/status',{headers:{Host:'other.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.end();});assert.equal(status,403);
  const invalid=await fetch(base+'/api/speech/recognize',{method:'POST',headers:{'Content-Type':'audio/wav'},body:new Uint8Array(44)});assert.equal(invalid.status,400);
  assert.equal((await fetch(base+'/native/GuluSpeech')).status,404);
  assert.equal((await fetch(base+'/press-to-talk.js')).status,200);assert.equal((await fetch(base+'/pcm-capture.js')).status,200);
});
