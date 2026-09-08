const {test}=require('node:test');
const assert=require('node:assert/strict');
const bank=require('../dialogues.js');
const {GardenGame,findSentenceEntry}=require('../engine.js');
const {encode,validate,restore}=require('../save.js');
const {DuelMatch}=require('../duel.cjs');
test('dialogues contain 900 distinct lines with source, scene, goal and grammar metadata',()=>{
  const records=bank.tiers.flat(),lines=records.flatMap(r=>r.lines);
  assert.equal(records.length,300);assert.equal(lines.length,900);assert.equal(new Set(lines.map(l=>l.word)).size,900);
  assert.equal(new Set(records.map(r=>r.id)).size,300);
  for(const record of records){
    assert.ok(record.scene&&record.goal&&record.grammar&&record.reference);assert.ok(bank.sources.some(s=>s.id===record.source));
    for(let count=1;count<=3;count++){
      const code=record.lines.slice(0,count).map(l=>l.word).join(' '),found=findSentenceEntry(code);
      assert.ok(code.length<=300);assert.equal(found.dialogueId,record.id);assert.equal(found.scene,record.scene);assert.equal(found.text.split(' / ').length,count);
    }
  }
});
test('all stages support complete typed and spoken conversations at each learning length',()=>{
  for(let level=0;level<5;level++)for(const wave of [1,4,7])for(const mode of ['sentences','speaking']){
    const g=new GardenGame({random:()=>.35});g.learningMode=mode;g.englishLevel=level;g.start();g.wave=wave;
    for(let i=0;i<3;i++)g.skills[i].code=g.nextCode(i);
    const code=g.skills[0].code,entry=findSentenceEntry(code);assert.ok(entry.dialogueId);assert.equal(entry.text.split(' / ').length,1+Math.floor((wave-1)/3));
    if(mode==='sentences')for(const key of code)assert.equal(g.input(key),true);
    else{if(wave>1)assert.equal(g.speak(0,entry.text.split(' / ')[0]),false);assert.equal(g.speak(0,entry.text),true);}
    assert.equal(g.casts,1);
  }
});
test('legacy template prompts remain playable in saves but new draws use authored scenes',()=>{
  const old='I SEE A KITE DO YOU LIKE THE KITE YES IT IS NICE';assert.ok(findSentenceEntry(old));
  const g=new GardenGame({random:()=>.4});g.learningMode='sentences';g.start();g.skills[0].code=old;g.select(0);g.input('I');
  const save=encode(g);assert.ok(validate(save));const loaded=new GardenGame();assert.ok(restore(loaded,save));loaded.resume();
  for(const key of old.slice(1))loaded.input(key);assert.equal(loaded.casts,1);
  for(let i=0;i<150;i++){const index=i%3,code=loaded.nextCode(index);assert.ok(findSentenceEntry(code).dialogueId);loaded.skills[index].code=code;}
});
test('LAN sentence mode exposes the same stages and each player keeps independent progress',()=>{
  const m=new DuelMatch({mode:'sentences',level:4});m.join('A');m.join('B');m.connect(0,true);m.connect(1,true);m.command(0,{type:'ready'});m.command(1,{type:'ready'});
  const a=m.snapshot(0),b=m.snapshot(1);assert.equal(a.dialogueStage.groups,60);assert.equal(a.dialogueStage.sentences,180);
  assert.ok(a.skills.every(s=>s.scene&&s.goal&&s.grammar));
  m.command(0,{type:'key',key:a.skills[0].code[0]});assert.equal(m.snapshot(0).skills[0].typed,1);assert.deepEqual(m.snapshot(1).skills,b.skills);
});
