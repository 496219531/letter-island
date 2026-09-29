const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function client(){
 const records=new Map();let failWrite=false;
 const db={transaction(){const tx={};tx.objectStore=()=>Object.fromEntries(['get','getAll','put','delete'].map(operation=>[operation,value=>{const request={};queueMicrotask(()=>{
  if(['put','delete'].includes(operation)&&failWrite){failWrite=false;tx.onabort?.();return;}
  if(operation==='put'){records.set(value.id,structuredClone(value));request.result=value.id;}
  if(operation==='delete')records.delete(value);
  if(operation==='get')request.result=structuredClone(records.get(value));
  if(operation==='getAll')request.result=structuredClone([...records.values()]);
  tx.oncomplete?.();
 });return request;} ]));return tx;}};
 const context={indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request;}},Event:class{},dispatchEvent(){},console};
 vm.runInNewContext(fs.readFileSync('ocr-client.js','utf8'),context);
 return {api:context.GuluOCRTasks,records,failNextWrite:()=>failWrite=true};
}
const task=()=>({id:'a'.repeat(16),owner:'owner',name:'练习',images:['data:image/png;base64,YQ=='],total:1,status:'uploading'});
const result={entries:[{text:'apple',kind:'word'}],notes:[]};
test('ACK follows durable result storage and lost ACK responses retry without consuming OCR twice',async()=>{
 const h=client(),item=task();let ack=0,resultCalls=0;
 await h.api.put(item);
 const request=async(path,data)=>{
  if(path.endsWith('/create'))return {status:'uploading'};
  if(path.endsWith('/upload'))return {status:'uploading',uploaded:1};
  if(path.endsWith('/submit'))return {status:'completed'};
  if(path.endsWith('/result')){resultCalls++;return {receipt:'receipt',result};}
  if(path.endsWith('/ack')){ack++;assert.deepEqual(h.records.get(item.id).result,result);if(ack===1)throw Error('response lost');return {ok:true};}
  throw Error(path);
 };
 await assert.rejects(h.api.resume(item,request),/response lost/);
 assert.deepEqual(h.records.get(item.id).result,result);assert.equal(h.records.get(item.id).images,null);
 const ready=await h.api.resume(item,request);assert.equal(ready.acknowledged,true);assert.equal(resultCalls,1);assert.equal(ack,2);
});
test('failed local result write never acknowledges server deletion',async()=>{
 const h=client(),item=task();let acknowledged=false;
 const request=async path=>{
  if(path.endsWith('/create'))return {status:'uploading'};
  if(path.endsWith('/upload'))return {status:'uploading'};
  if(path.endsWith('/submit'))return {status:'completed'};
  if(path.endsWith('/result')){h.failNextWrite();return {receipt:'r',result};}
  if(path.endsWith('/ack'))acknowledged=true;
 };
 await assert.rejects(h.api.resume(item,request),/保存失败/);assert.equal(acknowledged,false);assert.equal(h.records.get(item.id).result,undefined);
});
test('upload cannot begin if its recovery record cannot be stored locally',async()=>{
 const h=client();h.failNextWrite();let calls=0;
 await assert.rejects(h.api.resume(task(),async()=>{calls++;}),/保存失败/);assert.equal(calls,0);
});

test('already persisted results remain usable when the server expires before ACK',async()=>{
 const h=client(),item={...task(),images:null,result,receipt:'receipt',status:'ready'};await h.api.put(item);
 const ready=await h.api.resume(item,async path=>{assert.ok(path.endsWith('/ack'));throw Object.assign(Error('expired'),{status:404});});
 assert.equal(ready.acknowledged,true);assert.deepEqual(h.records.get(item.id).result,result);
});
