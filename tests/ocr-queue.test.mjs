import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommunityStore} from '../community-store.mjs';
import {OCRQueue} from '../ocr-queue.mjs';
import {createLanServer} from '../lan-server.mjs';
const image=n=>'data:image/png;base64,'+Buffer.from(String(n)).toString('base64');
const output=text=>({entries:[{text,kind:'word',meaning:'词义',ipa:''}],notes:[]});
async function until(check){for(let n=0;n<200;n++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('timed out');}
function add(queue,user,id,total){queue.create(user,{id,name:'测试',total});for(let i=0;i<total;i++)queue.upload(user,{id,position:i,image:image(i)});queue.submit(user,{id},user.id);}
test('nine-page jobs run FIFO across users, publish progress, and are deleted only after owner ACK',async()=>{
 const store=new CommunityStore(),a=store.register('甲').user,b=store.register('乙').user;let active=0,max=0,release;const calls=[];
 const queue=new OCRQueue(store,async data=>{assert.equal(data.images.length,1);assert.equal(data.pipeline,'staged');active++;max=Math.max(max,active);calls.push(data.images[0]);if(calls.length===1)await new Promise(r=>release=r);active--;return output('apple');},{key:()=> 'test'});
 try{
  add(queue,a,'a'.repeat(16),9);add(queue,b,'b'.repeat(16),1);await until(()=>typeof release==='function');
  assert.equal(queue.list(b).jobs[0].status,'queued');assert.equal(queue.list(b).jobs[0].ahead,1);assert.equal(queue.list(a).jobs[0].completed,0);
  release();await until(()=>queue.list(b).jobs[0].status==='completed');
  assert.equal(max,1);assert.equal(calls.length,10);assert.deepEqual(calls.slice(0,9),Array.from({length:9},(_,i)=>image(i)));
  assert.equal(queue.list(a).jobs[0].completed,9);
  assert.throws(()=>queue.result(b,{id:'a'.repeat(16)}),/不存在/);
  const result=queue.result(a,{id:'a'.repeat(16)});assert.equal(result.result.entries.length,9);
  assert.equal(queue.result(a,{id:result.id}).receipt,result.receipt);
  assert.throws(()=>queue.ack(a,{id:result.id,receipt:'bad'}),/先接收/);
  queue.ack(a,result);queue.ack(a,result);
  assert.equal(store.db.prepare('SELECT count(*) n FROM ocr_pages WHERE job=?').get(result.id).n,0);
  assert.equal(queue.list(a).jobs.length,0);assert.throws(()=>queue.create(a,{id:result.id,name:'测试',total:9}),/已领取/);
 }finally{queue.close();store.close();}
});
test('partial progress survives process restart, failed pages can retry without rerunning completed pages',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gulu-ocr-')),path=join(dir,'db.sqlite');let store=new CommunityStore(path),release,calls=0;
 const user=store.register('恢复').user,id='c'.repeat(16);
 let queue=new OCRQueue(store,async()=>{calls++;if(calls===2)await new Promise(r=>release=r);return output('apple');},{key:()=> 'test'});
 try{
  add(queue,user,id,3);await until(()=>calls===2);assert.equal(queue.list(user).jobs[0].completed,1);
  queue.close();release();await new Promise(r=>setTimeout(r,0));store.close();store=new CommunityStore(path);
  let secondCalls=0,fail=true;queue=new OCRQueue(store,async()=>{secondCalls++;if(fail)throw Error('secret upstream error');return output('banana');},{key:()=> 'test'});
  await until(()=>queue.list(user).jobs[0].status==='failed');assert.equal(queue.list(user).jobs[0].completed,1);assert.ok(!queue.list(user).jobs[0].error.includes('secret'));
  fail=false;queue.retry(user,{id});await until(()=>queue.list(user).jobs[0].status==='completed');assert.equal(secondCalls,3);assert.deepEqual(queue.result(user,{id}).result.entries.map(e=>e.text),['apple','banana','banana']);
 }finally{queue.close();store.close();rmSync(dir,{recursive:true,force:true});}
});
test('upload and submit retries are idempotent; invalid count, quota, and cross-account access fail',async()=>{
 const store=new CommunityStore(),user=store.register('上传').user,other=store.register('别人').user,id='d'.repeat(16);let release;
 const queue=new OCRQueue(store,async()=>{await new Promise(r=>release=r);return output('apple');},{key:()=> 'test'});
 try{
  assert.throws(()=>queue.create(user,{id,name:'测试',total:10}),/1～9/);
  queue.create(user,{id,name:'测试',total:1});queue.create(user,{id,name:'测试',total:1});
  assert.throws(()=>queue.submit(user,{id},'ip'),/尚未上传/);
  assert.throws(()=>queue.upload(other,{id,position:0,image:image(0)}),/不存在/);
  queue.upload(user,{id,position:0,image:image(0)});queue.upload(user,{id,position:0,image:image(0)});
  assert.throws(()=>queue.upload(user,{id,position:0,image:image(1)}),/不可替换/);
  queue.submit(user,{id},'ip');queue.submit(user,{id},'ip');assert.equal(store.db.prepare("SELECT used FROM ai_usage WHERE scope='all'").get().used,1);
  await until(()=>typeof release==='function');queue.remove(user,{id});release();await until(()=>!queue.running);assert.equal(queue.list(user).jobs.length,0);
 }finally{queue.close();store.close();}
});
test('HTTP OCR routes authenticate before accepting images and accept nine-page job metadata',async()=>{
 const previous=process.env.QWEN_API_KEY;process.env.QWEN_API_KEY='test';const app=createLanServer(null,{organizeContent:async()=>output('apple')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port,call=(path,data,cookie)=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 try{
  assert.equal((await call('library/ocr/create',{})).status,401);
  const account=await call('account/register',{name:'接口'}),cookie=account.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('library/ocr/create',{id:'e'.repeat(16),name:'九张',total:9},cookie)).status,200);
  assert.equal((await call('library/ocr/create',{id:'f'.repeat(16),name:'十张',total:10},cookie)).status,400);
  const list=await (await call('library/ocr/list',{},cookie)).json();assert.equal(list.jobs[0].total,9);assert.equal(list.jobs[0].uploaded,0);
 }finally{await app.stop();if(previous===undefined)delete process.env.QWEN_API_KEY;else process.env.QWEN_API_KEY=previous;}
});

test('unclaimed results expire exactly 24 hours after completion, even across restarts',async()=>{
 const day=86400000,dir=mkdtempSync(join(tmpdir(),'gulu-ocr-expiry-')),path=join(dir,'db.sqlite');let now=1000000000,store=new CommunityStore(path,{now:()=>now}),release;
 const user=store.register('过期测试').user,id='expiry'.padEnd(16,'x');let queue=new OCRQueue(store,async()=>{await new Promise(r=>release=r);return output('apple');},{key:()=> 'test'});
 try{
  add(queue,user,id,1);await until(()=>typeof release==='function');now+=7*day;release();await until(()=>!queue.running);
  const finished=now;assert.equal(queue.result(user,{id}).expiresAt,finished+day);
  queue.close();store.close();store=new CommunityStore(path,{now:()=>now});queue=new OCRQueue(store,async()=>{throw Error('must not rerun completed OCR');},{key:()=> 'test'});
  now=finished+day-1;assert.equal(queue.result(user,{id}).result.entries.length,1);
  now=finished+day;assert.throws(()=>queue.result(user,{id}),error=>error.status===404);
  assert.equal(store.db.prepare('SELECT count(*) n FROM ocr_pages WHERE job=?').get(id).n,0);
  assert.equal(queue.list(user).jobs.length,0);
 }finally{queue.close();store.close();rmSync(dir,{recursive:true,force:true});}
});

test('older OCR schema gains completion timestamps and expired results are cleaned on startup',()=>{
 let now=10*86400000;const store=new CommunityStore(':memory:',{now:()=>now}),user=store.register('旧结构').user;
 store.db.exec("CREATE TABLE ocr_jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,text TEXT NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,queued INTEGER,error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,receipt TEXT NOT NULL)");
 store.db.prepare("INSERT INTO ocr_jobs(id,owner,name,text,total,status,created,receipt) VALUES(?,?,?,'',1,'completed',?,'receipt')").run('legacy-task',user.id,'旧任务',now-2*86400000);
 const queue=new OCRQueue(store,async()=>output('apple'),{key:()=> 'test'});
 try{assert.ok(store.db.prepare('PRAGMA table_info(ocr_jobs)').all().some(c=>c.name==='completed_at'));assert.equal(queue.list(user).jobs.length,0);}finally{queue.close();store.close();}
});
