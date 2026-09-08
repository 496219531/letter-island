const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GardenGame,ENGLISH_WORDS,ENGLISH_STAGES,findWordEntry}=require('../engine.js');
const {encode,restore,validate}=require('../save.js');
const {DuelMatch}=require('../duel.cjs');

test('curriculum pools are cumulative, complete for their declared counts, and playable',()=>{
  assert.deepEqual(ENGLISH_STAGES.map(s=>s.count),[200,505,1600,2101,3097]);
  for(let level=0;level<5;level++){
    const tier=ENGLISH_WORDS[level],words=new Set(tier.map(e=>e.word));
    assert.equal(tier.length,words.size);assert.equal(tier.length,ENGLISH_STAGES[level].count);
    for(const e of tier){assert.match(e.word,/^[A-Z .'-]+$/);assert.match(e.meaning,/[\u4e00-\u9fff]/);assert.ok(e.ipa);}
    if(level)assert.ok(ENGLISH_WORDS[level-1].every(e=>words.has(e.word)));
  }
  assert.ok(ENGLISH_WORDS[1].some(e=>e.word==='CAT'));
  assert.ok(!ENGLISH_WORDS[3].some(e=>e.word==='ABSTRACT'));
  assert.ok(ENGLISH_WORDS[4].some(e=>e.word==='ABSTRACT'));
  assert.ok(ENGLISH_WORDS[3].some(e=>e.word==='ACQUIRE'));
});
test('each player prefers unseen words and keeps unique skill initials; history stays bounded',()=>{
  for(let level=0;level<5;level++){
    const g=new GardenGame({random:()=>.37});g.learningMode='english';g.englishLevel=level;g.start();
    const seen=new Set(g.skills.map(s=>s.code));
    for(let n=0;n<100;n++){
      const i=n%3,code=g.nextCode(i);assert.ok(!seen.has(code),'premature repeat '+code);seen.add(code);g.skills[i].code=code;
      assert.equal(new Set(g.skills.map(s=>s.code[0])).size,3);
    }
  }
  const g=new GardenGame({random:()=>.25});g.learningMode='english';g.start();
  for(let n=0;n<1000;n++){const i=n%3;g.skills[i].code=g.nextCode(i);}
  assert.equal(g.promptHistory['english:0'].length,200);
  assert.equal(new Set(g.promptHistory['english:0']).size,200);
});
test('word spacing, hyphens, apostrophes and abbreviation periods can be typed to completion',()=>{
  for(const code of ['T-SHIRT',"O'CLOCK",'A.M.','ICE CREAM']){
    const g=new GardenGame();g.learningMode='english';g.start();g.skills[0].code=code;g.select(0);
    assert.ok(findWordEntry(code));for(const c of code.toLowerCase())assert.equal(g.input(c),true,code+' '+c);
    assert.equal(g.casts,1);assert.equal(g.skills[0].typed,0);
  }
  const letters=new GardenGame();letters.start();assert.equal(letters.input('-'),false);
});
test('saved prompt history survives reload, supports old saves, and rejects malformed history',()=>{
  const g=new GardenGame({random:()=>.35});g.learningMode='english';g.englishLevel=4;g.start();
  for(let i=0;i<30;i++)g.skills[i%3].code=g.nextCode(i%3);
  const save=encode(g),loaded=new GardenGame({random:()=>.35});assert.ok(restore(loaded,save));
  assert.deepEqual(loaded.promptHistory,g.promptHistory);
  assert.ok(!g.promptHistory['english:4'].includes(loaded.nextCode(0)));
  delete save.state.promptHistory;assert.ok(restore(loaded,save));assert.deepEqual(loaded.promptHistory,{});
  save.state.skills[0].code='SHOES';assert.ok(validate(save));assert.ok(findWordEntry('SHOES').meaning);
  for(const history of [{bad:[]},{'english:9':[]},{'english:0':['<bad>']},{'english:0':['CAT','CAT']},{'context:1':[]}]){
    save.state.promptHistory=history;assert.equal(validate(save),false);
  }
});
test('duel histories are private, independent and retained across rematches',()=>{
  const m=new DuelMatch({mode:'english',level:1});m.join('A');m.join('B');m.connect(0,true);m.connect(1,true);m.command(0,{type:'ready'});m.command(1,{type:'ready'});
  const before=JSON.stringify(m.games[1].promptHistory);
  for(let n=0;n<20;n++)m.games[0].skills[n%3].code=m.games[0].nextCode(n%3);
  assert.equal(JSON.stringify(m.games[1].promptHistory),before);assert.equal(m.snapshot(0).stage.count,505);
  assert.equal(m.snapshot(0).fields[1].promptHistory,undefined);
  const mine=[...m.games[0].promptHistory['english:1']];m.command(0,{type:'surrender'});m.command(0,{type:'ready'});m.command(1,{type:'ready'});
  assert.ok(mine.every(code=>m.games[0].promptHistory['english:1'].includes(code)));
  assert.ok(m.games[0].skills.every(s=>!mine.includes(s.code)));
});
