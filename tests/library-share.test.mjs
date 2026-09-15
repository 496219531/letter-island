import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLanServer} from '../lan-server.mjs';

test('a library share remains available for its 24-hour temporary window',async()=>{
  const app=createLanServer();await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  try{
    const account=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'分享测试'})});
    assert.equal(account.status,200);const cookie=account.headers.get('set-cookie').split(';')[0];
    const payload=JSON.stringify({version:1,groups:[{id:'a',name:'测试',kind:'word',entries:[{text:'apple'}]}]});
    const created=await fetch(base+'/api/library/share',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({payload})});
    assert.equal(created.status,200);const share=await created.json();assert.equal(typeof share.code,'string');
    const claimed=await fetch(base+'/api/library/share/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:share.code})});
    assert.equal(claimed.status,200);assert.equal((await claimed.json()).payload,payload);
    const second=await fetch(base+'/api/library/share/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:share.code})});
    assert.equal(second.status,200);assert.equal((await second.json()).payload,payload);
  }finally{await app.stop();}
});
