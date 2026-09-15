const {test}=require('node:test'),assert=require('node:assert/strict');const C=require('../custom-library.js');
function store(){let data=null;return {getItem:()=>data,setItem:(k,v)=>{data=v;}};}
test('AI category drives mixed import, not spaces or punctuation heuristics',async()=>{
 const result=await C.prepare({kind:'auto',text:'apple / take care / Stop!',organize:async p=>{assert.equal(p.kind,'auto');return {entries:[{text:'apple',kind:'word'},{text:'take care',kind:'phrase'},{text:'Stop!',kind:'sentence'}]};}});
 assert.deepEqual(result.entries.map(e=>e.kind),['word','word','sentence']);assert.equal(result.entries[1].category,'phrase');assert.equal(result.entries[2].word,C.code('Stop!','sentence'));
 const repo=C.repository(store()),saved=repo.saveClassified({name:'今日学习',entries:result.entries});assert.equal(saved.length,2);assert.equal(saved.find(g=>g.kind==='word').entries.length,2);assert.ok(saved.every(C.validate));
});
test('related groups merge fresh nonempty fields and retain the original group when adding the other type',()=>{
 const repo=C.repository(store());const root=repo.save({name:'原词组',kind:'word',entries:[{text:'apple',meaning:'旧',ipa:'已有音标'}]});
 repo.saveClassified({id:root.id,name:root.name,entries:[{kind:'sentence',text:'I like apples.',meaning:'我喜欢苹果'}]});
 const sentence=repo.list().find(g=>g.kind==='sentence');repo.saveClassified({id:sentence.id,name:sentence.name,entries:[{kind:'word',text:'APPLE',meaning:'新',ipa:''},{kind:'sentence',text:'I like pears.',meaning:''}]});
 const groups=repo.list();assert.equal(groups.length,2);assert.equal(groups.find(g=>g.id===root.id).entries[0].meaning,'新');assert.equal(groups.find(g=>g.id===root.id).entries[0].ipa,'已有音标');assert.equal(groups.find(g=>g.kind==='sentence').entries.length,2);
});
test('mixed save is atomic if splitting exceeds group capacity',()=>{const storage=store(),repo=C.repository(storage);for(let i=0;i<99;i++)repo.save({name:'组'+i,kind:'word',entries:[{text:'apple'}]});const before=storage.getItem();assert.throws(()=>repo.saveClassified({name:'混合',entries:[{text:'cat',kind:'word'},{text:'I am here.',kind:'sentence'}]}),/100/);assert.equal(storage.getItem(),before);});
test('restored backup families are independent of their source groups',()=>{const repo=C.repository(store());const original=repo.saveClassified({name:'原组',entries:[{text:'apple',kind:'word'},{text:'Hello there.',kind:'sentence'}]});repo.importGroups(original);const all=repo.list();assert.notEqual(all[2].familyId,original[0].familyId);assert.equal(all[2].familyId,all[3].familyId);});
test('missing AI classification stops before saving or translating',async()=>{await assert.rejects(C.prepare({kind:'auto',organize:async()=>({entries:[{text:'take care'}]}),translate:async()=>{throw Error('should not translate');}}),/分类/);});
