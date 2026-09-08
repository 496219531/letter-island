import {test} from 'node:test';import assert from 'node:assert/strict';import {importImage,model} from '../library-service.mjs';
test('Qwen adapter sends the original image and returns editable untrusted entries',async()=>{
 let body;const image='data:image/png;base64,YQ==';const result=await importImage({image,kind:'word'},{key:'test-not-a-real-key',request:async(url,options)=>{assert.equal(url,'https://ws-6xyzvsketfz7g5y6.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'```json\n{"entries":[{"text":"apple","meaning":"","uncertain":true}],"notes":["核对第一行"]}\n```'}}]})};}});
 assert.equal(body.model,model);assert.equal(body.messages[0].content[1].image_url.url,image);assert.equal(result.entries[0].uncertain,true);
});
test('missing Qwen credentials and bad image data fail clearly',async()=>{
 await assert.rejects(importImage({image:'bad',kind:'word'},{key:''}),/未配置/);await assert.rejects(importImage({image:'https://example.com',kind:'word'},{key:'test'}),/请选择/);
});
