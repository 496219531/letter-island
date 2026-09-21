import {test} from 'node:test';import assert from 'node:assert/strict';import {importImage,model} from '../library-service.mjs';
test('Qwen adapter sends the original image and returns editable untrusted entries',async()=>{
 let body;const image='data:image/png;base64,YQ==';const result=await importImage({image,kind:'word'},{key:'test-not-a-real-key',request:async(url,options)=>{assert.equal(url,'https://ws-6xyzvsketfz7g5y6.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'```json\n{"entries":[{"text":"apple","meaning":"","uncertain":true}],"notes":["核对第一行"]}\n```'}}]})};}});
 assert.equal(body.model,model);assert.equal(body.messages[0].content[1].image_url.url,image);assert.equal(result.entries[0].uncertain,true);
});
test('missing Qwen credentials and bad image data fail clearly',async()=>{
 await assert.rejects(importImage({image:'bad',kind:'word'},{key:''}),/未配置/);await assert.rejects(importImage({image:'https://example.com',kind:'word'},{key:'test'}),/请选择/);
});
test('typed content is normalized through Qwen without requiring an image',async()=>{
 const {organizeContent}=await import('../library-service.mjs');let requestBody;
 const result=await organizeContent({text:'apple 苹果',kind:'word'},{key:'test',request:async(url,options)=>{requestBody=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({entries:[{text:'apple',meaning:'苹果',ipa:''}]})}}]})};}});
 assert.equal(result.entries[0].text,'apple');assert.equal(requestBody.messages[0].role,'system');assert.deepEqual(requestBody.messages[1].content,[{type:'text',text:'apple 苹果'}]);
});
test('automatic organizer asks AI to classify and retains per-entry categories',async()=>{const {organizeContent}=await import('../library-service.mjs');let sent;const result=await organizeContent({text:'take care\nStop!',kind:'auto'},{key:'test',request:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({entries:[{text:'take care',kind:'phrase'},{text:'Stop!',kind:'sentence'}]})}}]})};}});assert.match(sent.messages[0].content,/自动逐条分类/);assert.deepEqual(result.entries.map(e=>e.kind),['phrase','sentence']);});

test('one-shot prompt preserves source fields before asking the model to fill gaps',async()=>{const {oneShotPrompt,organizeContent}=await import('../library-service.mjs');assert.match(oneShotPrompt(),/第一优先读取图片或用户输入中明确出现的中文释义和音标/);let sent;await organizeContent({text:'apple 苹果',kind:'auto',pipeline:'one-shot'},{key:'test',request:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({entries:[{text:'apple',kind:'word',meaning:'苹果',ipa:'ˈæpəl'}]})}}]})};}});assert.match(sent.messages[0].content,/原文已有字段必须原样保留/);});

test('organizer keeps up to four images in order and rejects a fifth image',async()=>{const {organizeContent}=await import('../library-service.mjs');const images=Array.from({length:4},(_,i)=>`data:image/png;base64,${Buffer.from(String(i)).toString('base64')}`);let requestBody;await organizeContent({kind:'auto',images},{key:'test',request:async(url,options)=>{requestBody=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({entries:[{text:'apple',kind:'word'}]})}}]})};}});assert.equal(requestBody.messages[1].content.filter(item=>item.type==='image_url').length,4);await assert.rejects(organizeContent({kind:'auto',images:[...images,images[0]]},{key:'test',request:async()=>{throw Error('must not call');}}),/最多4张/);});

test('server splits complete paragraphs before applying the per-sentence length limit',async()=>{
 const {parseImageResponse}=await import('../library-service.mjs');const text='This is a complete natural sentence. '.repeat(20)+'Where are you?';
 assert.ok(text.length>500);const result=parseImageResponse(JSON.stringify({entries:[{kind:'sentence',text}]}));
 assert.equal(result.entries.length,21);assert.equal(result.entries.at(-1).text,'Where are you?');
 assert.throws(()=>parseImageResponse(JSON.stringify({entries:[{kind:'sentence',text:'long '.repeat(110)}]})),/未截断/);
 const legacy=parseImageResponse(JSON.stringify({entries:[{text:'Are you ready? I am ready.'}]}),'sentence');assert.equal(legacy.entries.length,2);
});
test('all organizer modes explicitly separate natural sentences and question-answer turns',async()=>{
 const {imagePrompt,autoPrompt,oneShotPrompt}=await import('../library-service.mjs');
 for(const prompt of [imagePrompt('sentence'),autoPrompt(),oneShotPrompt()]){assert.match(prompt,/每个sentence条目只能包含一个自然句/);assert.match(prompt,/问句和回答分别一条/);assert.match(prompt,/不要按固定字数/);}
});
