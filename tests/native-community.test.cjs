const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function bridge(){
 const messages=[],timers=new Map();let serial=0;
 const window={addEventListener(){},webkit:{messageHandlers:{gulu:{postMessage:m=>messages.push(m)}}}};
 const context={window,document:{addEventListener(){}},setTimeout:f=>{const id=++serial;timers.set(id,f);return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('ios/GuluGarden/bridge.js','utf8'),context);return {window,messages,timers};
}
test('native community transport sends GET/POST payloads and resolves server response',async()=>{
 const {window,messages,timers}=bridge();
 const get=window.GuluNative.communityRequest('account');assert.equal(messages[0].command,'communityRequest');assert.equal(messages[0].data,undefined);
 window.GuluNativeReceive({type:'nativeReply',id:messages[0].id,ok:true,result:{status:200,result:{user:null}}});assert.equal((await get).status,200);assert.equal(timers.size,0);
 const post=window.GuluNative.communityRequest('account/register',{name:'测试'});assert.equal(messages[1].data.name,'测试');
 window.GuluNativeReceive({type:'nativeReply',id:messages[1].id,ok:true,result:{status:409,result:{error:'昵称已使用'}}});assert.equal((await post).status,409);assert.equal(timers.size,0);
});
test('native request timeout rejects and ignores late responses',async()=>{
 const {window,messages,timers}=bridge();const request=window.GuluNative.communityRequest('account');const rejected=assert.rejects(request,/超时/);[...timers.values()][0]();await rejected;
 window.GuluNativeReceive({type:'nativeReply',id:messages[0].id,ok:true,result:{}});
});
test('native Apple translation progress is forwarded before its final reply',async()=>{
 const {window,messages}=bridge(),updates=[];const translated=window.GuluNative.translateTexts(['apple','banana'],progress=>updates.push(progress));
 assert.equal(messages[0].command,'translateTexts');window.GuluNativeReceive({type:'libraryProgress',id:messages[0].id,completed:1,total:2});assert.deepEqual(updates,[{type:'libraryProgress',id:messages[0].id,completed:1,total:2}]);
 window.GuluNativeReceive({type:'nativeReply',id:messages[0].id,ok:true,result:['苹果','香蕉']});assert.deepEqual(await translated,['苹果','香蕉']);
});
