const {test}=require('node:test'),assert=require('node:assert/strict');const C=require('../custom-library.js');
const vocabulary={entries:[{word:'APPLE',meaning:'苹果',ipa:'æpəl'}]};
test('Qwen always runs first, last duplicate wins, dictionary fills blanks then Apple translates only missing Chinese',async()=>{
 const calls=[];const result=await C.prepare({text:'mixed input',kind:'word',pipeline:'staged',vocabulary,organize:async payload=>{calls.push('qwen');assert.equal(payload.text,'mixed input');return {entries:[{text:'apple',meaning:'旧中文',ipa:'old'},{text:'APPLE',meaning:'新中文',ipa:''},{text:'moonwhale'},{text:'glimmerfox'}]};},translate:async texts=>{calls.push('apple');assert.deepEqual(texts,['moonwhale','glimmerfox']);return ['月鲸',''];}});
 assert.deepEqual(calls,['qwen','apple']);assert.equal(result.entries.length,3);assert.equal(result.entries[0].meaning,'新中文');assert.equal(result.entries[0].ipa,'old');assert.equal(result.entries[1].meaning,'月鲸');assert.equal(result.entries[2].meaning,'');assert.equal(result.entries[2].ipa,'');
});
test('translation failure leaves entries usable and Qwen failure does not fall back to unsorted raw input',async()=>{
 const result=await C.prepare({text:'hello',kind:'word',pipeline:'staged',organize:async()=>({entries:[{text:'moonwhale'}]}),translate:async()=>{throw Error('cancelled');}});assert.equal(result.entries[0].meaning,'');assert.ok(result.notes.length);assert.ok(C.entry(result.entries[0],'word'));
 await assert.rejects(C.prepare({text:'hello',kind:'word',organize:async()=>{throw Error('Qwen unavailable');}}),/Qwen unavailable/);
});
test('Apple translation is split into small batches so a large import does not wait on one long system task',async()=>{
 const entries=Array.from({length:50},(_,i)=>({text:'word'+String.fromCharCode(97+i%26)+String.fromCharCode(97+Math.floor(i/26)),kind:'word'}));let calls=0;
 const result=await C.prepare({kind:'auto',pipeline:'staged',organize:async()=>({entries}),translate:async texts=>{calls++;assert.ok(texts.length<=24);return texts.map(text=>'译'+text);}});
 assert.equal(calls,3);assert.ok(result.entries.every(entry=>entry.meaning.startsWith('译')));
});
test('closing the editor stops the remaining stages after Qwen returns',async()=>{let active=true;await assert.rejects(C.prepare({kind:'word',active:()=>active,organize:async()=>{active=false;return {entries:[{text:'apple'}]};},translate:async()=>{throw Error('must not translate');}}),/取消/);});
test('repository deduplicates case and full-width spelling with the newest nonempty fields winning',()=>{let saved=null;const repo=C.repository({getItem:()=>saved,setItem:(k,v)=>saved=v});const g=repo.save({name:'新词',kind:'word',entries:[{text:'apple',meaning:'旧',ipa:'old'},{text:'ＡＰＰＬＥ',meaning:'新',ipa:''}]});assert.equal(g.entries.length,1);assert.equal(g.entries[0].meaning,'新');assert.equal(g.entries[0].ipa,'old');});
test('updating only Chinese retains stored IPA before enrichment and across final save',async()=>{
 let storage=null;const repo=C.repository({getItem:()=>storage,setItem:(k,v)=>storage=v});const old=repo.save({name:'词库',kind:'word',entries:[{text:'apple',meaning:'旧译',ipa:'原音标'}]});
 const prepared=await C.prepare({kind:'word',pipeline:'staged',existingEntries:old.entries,vocabulary,organize:async()=>({entries:[{text:'APPLE',meaning:'新译',ipa:''}]})});
 assert.equal(prepared.entries[0].meaning,'新译');assert.equal(prepared.entries[0].ipa,'原音标');
 const updated=repo.save({...old,entries:[{text:'apple',meaning:'新译',ipa:''}]});assert.equal(updated.entries[0].ipa,'原音标');assert.equal(updated.entries[0].meaning,'新译');
 const phonetic=repo.save({...old,entries:[{text:'apple',meaning:'',ipa:'新音标'}]});assert.equal(phonetic.entries[0].meaning,'新译');assert.equal(phonetic.entries[0].ipa,'新音标');
});

test('one-shot mode does not run local dictionary or Apple translation after Qwen',async()=>{
 let translated=false;
 const result=await C.prepare({kind:'auto',pipeline:'one-shot',vocabulary:{entries:[{word:'APPLE',meaning:'标准中文',ipa:'标准音标'}]},organize:async()=>({entries:[{text:'APPLE',kind:'word',meaning:'模型中文',ipa:'模型音标'},{text:'MOONWHALE',kind:'word',meaning:'',ipa:''}]}),translate:async()=>{translated=true;return ['不应调用'];}});
 assert.equal(result.entries[0].meaning,'模型中文');assert.equal(result.entries[0].ipa,'模型音标');assert.equal(result.entries[1].meaning,'');assert.equal(result.entries[1].ipa,'');assert.equal(translated,false);
});

test('prepare forwards all selected images and the chosen pipeline to Qwen',async()=>{
 let payload;
 await C.prepare({kind:'auto',images:['data:image/png;base64,YQ==','data:image/png;base64,Yg=='],pipeline:'staged',organize:async input=>{payload=input;return {entries:[{text:'apple',kind:'word'}]};},translate:null});
 assert.deepEqual(payload.images,['data:image/png;base64,YQ==','data:image/png;base64,Yg==']);assert.equal(payload.pipeline,'staged');assert.equal(payload.kind,'auto');
});
test('phrases fill Chinese without looking up IPA, while single words still fill IPA',()=>{
 const phrase={word:'TAKE CARE',meaning:'保重',get ipa(){throw Error('phrase IPA must not be accessed');}},vocabulary={entries:[phrase,{word:'APPLE',meaning:'苹果',ipa:'æpəl'}]};
 const rows=C.enrich(C.parse('take care\napple','word'),'word',vocabulary);assert.equal(rows[0].meaning,'保重');assert.equal(rows[0].ipa,'');assert.equal(rows[1].ipa,'æpəl');
 const supplied=C.enrich(C.parse('take care | 保重 | 已有音标','word'),'word',vocabulary);assert.equal(supplied[0].ipa,'已有音标');
});
