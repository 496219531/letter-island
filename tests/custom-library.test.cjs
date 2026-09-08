const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../custom-library.js'),vocabulary=require('../vocabulary.js'),{GardenGame}=require('../engine.js');require('../save.js');
const store=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('pasted text parses and fills only blank meanings and phonetics',()=>{
 const parsed=C.parse('1. apple 苹果\nbanana | 我的释义 | my ipa','word');const rows=C.enrich(parsed,'word',vocabulary);
 assert.equal(rows[0].meaning,'苹果');assert.ok(rows[0].ipa);assert.equal(rows[1].meaning,'我的释义');assert.equal(rows[1].ipa,'my ipa');
 assert.throws(()=>C.parse('3 cats','word'),/数字/);
});
test('group repository deduplicates and imports atomically',()=>{
 const storage=store(),repo=C.repository(storage);const group=repo.save({name:'本周',kind:'word',entries:C.parse('apple\napple | 苹果','word')});assert.equal(group.entries.length,1);assert.equal(C.repository(storage).list().length,1);repo.importGroups([group]);assert.equal(repo.list().length,2);assert.notEqual(repo.list()[1].id,group.id);
 assert.throws(()=>repo.importGroups([{name:'bad'}]));assert.equal(repo.list().length,2);
});
test('custom word prompts play and saved snapshots survive source deletion or edits',()=>{
 const repo=C.repository(store()),group=repo.save({name:'自定义',kind:'word',entries:C.parse('quokka | 短尾矮袋鼠\naxolotl | 蝾螈\nyak | 牦牛','word')});
 const game=new GardenGame();game.learningMode='english';game.setCustomBank(group);game.start();assert.ok(game.skills.every(s=>group.entries.some(e=>e.word===s.code)));
 const code=game.skills[0].code;game.select(0);for(const ch of code)game.input(ch);assert.equal(game.casts,1);
 const saved=GuluSave.encode(game);assert.equal(GuluSave.validate(saved),true);repo.remove(group.id);const restored=new GardenGame();assert.equal(GuluSave.restore(restored,saved),true);assert.equal(restored.customBank.name,'自定义');assert.ok(restored.learningEntry(restored.skills[1].code).meaning);
 saved.state.customBank.entries[0].word='TAMPER';assert.equal(GuluSave.validate(saved),false);
});
test('custom sentences remain one prompt, support apostrophes and speech review skip',()=>{
 const group=C.repository(store()).save({name:'口语',kind:'sentence',entries:C.parse("I'm feeling fine. | 我感觉很好\nPlease close the blue door. | 关蓝色门",'sentence')});
 for(const mode of ['sentences','speaking']){const g=new GardenGame();g.learningMode=mode;g.setCustomBank(group);g.start();g.wave=7;assert.equal(g.learningLoad,1);g.select(0);if(mode==='speaking')assert.equal(g.speak(0,g.skills[0].code),true);else for(const ch of g.skills[0].code)g.input(ch);assert.equal(g.casts,1);assert.equal(GuluSave.validate(GuluSave.encode(g)),true);}
});
