const {test}=require('node:test'),assert=require('node:assert/strict');
const {compare,repository}=require('../speech-review.js');
const {GardenGame}=require('../engine.js');
test('word alignment identifies substitution omission and insertion without shifting later words',()=>{
 assert.deepEqual(compare('I like red apples','I like apples').filter(p=>p.type!=='same'),[{type:'missing',expected:'RED',heard:''}]);
 assert.deepEqual(compare('I like apples','I love apples').filter(p=>p.type!=='same'),[{type:'changed',expected:'LIKE',heard:'LOVE'}]);
 assert.deepEqual(compare('I like apples','I really like apples').filter(p=>p.type!=='same'),[{type:'extra',expected:'',heard:'REALLY'}]);
 assert.ok(compare('Hello, Sam!','hello sam').every(p=>p.type==='same'));
});
test('skip rotates speech prompt without casting, scoring, or changing cooldown',()=>{
 const game=new GardenGame();game.learningMode='speaking';game.start();const code=game.skills[0].code,score=game.score,correct=game.correct,casts=game.casts,health=game.enemies.map(e=>e.hp);
 assert.equal(game.skipSpeech(0),true);assert.notEqual(game.skills[0].code,code);assert.equal(game.casts,casts);assert.equal(game.score,score);assert.equal(game.correct,correct);assert.equal(game.skills[0].cd,0);assert.deepEqual(game.enemies.map(e=>e.hp),health);
 game.skills[0].cd=1;assert.equal(game.skipSpeech(0),false);game.learningMode='english';assert.equal(game.skipSpeech(1),false);
});
test('review records survive reload and failed writes do not report success',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};const repo=repository(storage);repo.add({id:'one',code:'HELLO',attempts:[{text:'yellow'}]});assert.equal(repository(storage).list()[0].attempts[0].text,'yellow');repo.remove('one');assert.deepEqual(repo.list(),[]);
 assert.throws(()=>repository({getItem:()=>null,setItem:()=>{throw Error('full');}}).add({id:'x'}),/full/);
});
