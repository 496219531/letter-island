/* Versioned run snapshots. Only game data is serialized, never callbacks or UI. */
(function(root){
  'use strict';
  const FIELDS=['learningMode','englishLevel','flowerHealth','breachElapsed','stacks','maxHealth','healKills','health','score','kills','casts','correct','wave','spawned','quota','spawnIn','waveBreak','shotIn','time','freeze','combo','typing','activeTime','serial','adaptive','auto','fireStrength','maxSpellLength','magicSlow','aim','hero','skills','enemies','effects'];
  const numeric=['maxHealth','healKills','health','score','kills','casts','correct','wave','spawned','quota','spawnIn','waveBreak','shotIn','time','freeze','combo','typing','activeTime','serial','fireStrength'];
  function encode(game){
    if(!['playing','paused','upgrade'].includes(game.status)||game.health<0)return null;
    const state={};for(const key of FIELDS)state[key]=game[key];
    state.status=game.status==='upgrade'?'upgrade':'paused';
    state.offers=game.offers.map(c=>c.id);
    state.bullets=game.bullets.map(b=>({...b,hitIds:[...b.hitIds]}));
    return JSON.parse(JSON.stringify({version:1,savedAt:Date.now(),state}));
  }
  function finiteTree(v){
    if(typeof v==='number')return Number.isFinite(v);
    if(v===null||typeof v==='string'||typeof v==='boolean')return true;
    if(typeof v!=='object')return false;
    return Object.values(v).every(finiteTree);
  }
  function validate(save){
    if(!save||save.version!==1||!Number.isFinite(save.savedAt)||!save.state||!finiteTree(save.state))return false;
    const s=save.state,cardIds=new Set(root.GARDEN_CARDS.map(c=>c.id));
    if(!['paused','upgrade'].includes(s.status)||numeric.some(k=>typeof s[k]!=='number'))return false;
    if(s.health<0||(s.health===0&&s.breachElapsed===undefined)||s.maxHealth<s.health||s.wave<1||!Number.isInteger(s.wave)||s.fireStrength<0||s.fireStrength>1||s.typing< -1||s.typing>2||!Number.isInteger(s.typing))return false;
    if(s.learningMode!==undefined&&!['letters','english','sentences'].includes(s.learningMode))return false;
    if(s.englishLevel!==undefined&&(!Number.isInteger(s.englishLevel)||s.englishLevel<0||s.englishLevel>4))return false;
    if(['english','sentences'].includes(s.learningMode)&&s.englishLevel===undefined)return false;
    if(s.breachElapsed!==undefined&&(!Number.isFinite(s.breachElapsed)||s.breachElapsed<0||s.breachElapsed>=3))return false;
    if(s.flowerHealth!==undefined&&(!Array.isArray(s.flowerHealth)||s.flowerHealth.length!==8||s.flowerHealth.some(h=>!Number.isFinite(h)||h<0||h>s.maxHealth/8)||Math.abs(s.flowerHealth.reduce((a,b)=>a+b,0)-s.health)>.000001))return false;
    if(s.maxSpellLength!==undefined&&(!Number.isInteger(s.maxSpellLength)||s.maxSpellLength<1||s.maxSpellLength>60))return false;
    if(s.magicSlow!==undefined&&typeof s.magicSlow!=='boolean')return false;
    if(typeof s.adaptive!=='boolean'||typeof s.auto!=='boolean'||!s.stacks||Array.isArray(s.stacks))return false;
    if(Object.entries(s.stacks).some(([k,v])=>!cardIds.has(k)||!Number.isInteger(v)||v<1))return false;
    if(!s.aim||!s.hero||![s.aim.x,s.aim.y,s.hero.x,s.hero.y].every(Number.isFinite))return false;
    if(!Array.isArray(s.skills)||s.skills.length!==3||s.skills.some((k,i)=>!k||!(s.learningMode==='sentences'?root.ENGLISH_SENTENCES.some(tier=>tier.some(entry=>entry.word===k.code)):s.learningMode==='english'?root.ENGLISH_WORDS.some(tier=>tier.some(entry=>entry.word===k.code)):new RegExp('^'+['A','S','D'][i]+'[A-Z]{0,59}$').test(k.code))||!Number.isInteger(k.typed)||k.typed<0||k.typed>=k.code.length||!Number.isFinite(k.cd)||k.cd<0||k.duration!==[8,12,11][i]||!Number.isInteger(k.uses)))return false;
    const enemyNumbers=['id','x','y','hp','maxHp','speed','radius','hit','phase','gait','shield','poison','poisonTime','chill','ability','slowTime'];
    if(!Array.isArray(s.enemies)||s.enemies.length>500||s.enemies.some(z=>!z||!Object.hasOwn(root.ZOMBIE_TYPES,z.type)||enemyNumbers.some(k=>!Number.isFinite(z[k]))||z.hp<=0))return false;
    if(!Array.isArray(s.bullets)||s.bullets.length>4000||s.bullets.some(b=>!b||['x','y','px','py','vx','vy','life','damage','pierce','bounces'].some(k=>!Number.isFinite(b[k]))||!Array.isArray(b.hitIds)||b.hitIds.some(x=>!Number.isInteger(x))))return false;
    if(!Array.isArray(s.effects)||s.effects.length>200||s.effects.some(e=>!e||!['laser','freeze','melon','explosion'].includes(e.kind)||!Number.isFinite(e.life)||!Number.isFinite(e.fullLife)||e.fullLife<=0||(['melon','explosion'].includes(e.kind)&&(!Number.isFinite(e.x)||!Number.isFinite(e.y)))||(e.kind==='melon'&&(!Number.isFinite(e.damage)||!Number.isFinite(e.radius)))||(e.kind==='laser'&&!Number.isFinite(e.angle))))return false;
    if(!Array.isArray(s.offers)||s.offers.some(id=>!cardIds.has(id)))return false;
    if(s.status==='upgrade'&&(s.offers.length!==3||new Set(s.offers).size!==3))return false;
    return true;
  }
  function restore(game,save){
    if(!validate(save))return false;
    const s=JSON.parse(JSON.stringify(save.state));
    for(const key of FIELDS)game[key]=s[key];
    game.flowerHealth=s.flowerHealth?[...s.flowerHealth]:Array(8).fill(0);game.health=s.health;game.breachElapsed=s.breachElapsed??0;
    game.learningMode=s.learningMode??'letters';game.englishLevel=s.englishLevel??0;
    game.maxSpellLength=s.maxSpellLength??60;game.magicSlow=s.magicSlow??false;
    game.bullets=s.bullets.map(b=>({...b,hitIds:new Set(b.hitIds)}));
    game.offers=s.offers.map(id=>root.GARDEN_CARDS.find(c=>c.id===id));
    game.status=s.status;game.dead=[];game.shooting=false;
    return true;
  }
  root.GuluSave={encode,validate,restore};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSave;
})(typeof globalThis!=='undefined'?globalThis:this);
