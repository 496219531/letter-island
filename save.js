/* Versioned run snapshots. Only game data is serialized, never callbacks or UI. */
(function(root){
  'use strict';
  const CUSTOM=typeof module!=='undefined'&&module.exports?require('./custom-library.js'):root.GuluCustomLibrary;
  const FIELDS=['skillAimLeft','skillAuto','skillAim','clones','cloneShot','rage','practiceScore','rankingRun','customBank','promptHistory','learningMode','englishLevel','flowerHealth','breachElapsed','stacks','maxHealth','healKills','health','score','kills','casts','correct','wave','spawned','quota','spawnIn','waveBreak','shotIn','time','freeze','combo','typing','activeTime','serial','adaptive','auto','fireStrength','maxSpellLength','maxLearningLoad','magicSlow','aim','hero','skills','enemies','effects'];
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
    if(save.state.practiceScore!==undefined&&(!Number.isSafeInteger(save.state.practiceScore)||save.state.practiceScore<0||save.state.practiceScore>save.state.score))return false;
    const s=save.state,cardIds=new Set(root.GARDEN_CARDS.map(c=>c.id));
    if(!['paused','upgrade'].includes(s.status)||numeric.some(k=>typeof s[k]!=='number'))return false;
    if(s.health<0||(s.health===0&&s.breachElapsed===undefined)||s.maxHealth<s.health||s.wave<1||!Number.isInteger(s.wave)||s.fireStrength<0||s.fireStrength>1||s.typing< -1||s.typing>2||!Number.isInteger(s.typing))return false;
    if(s.customBank!==undefined&&s.customBank!==null&&(!CUSTOM.validate(s.customBank)||(s.learningMode==='english')!==(s.customBank.kind==='word')||s.learningMode==='letters'))return false;
    if(s.learningMode!==undefined&&!['letters','english','sentences','speaking'].includes(s.learningMode))return false;
    if(s.englishLevel!==undefined&&(!Number.isInteger(s.englishLevel)||s.englishLevel<0||s.englishLevel>4))return false;
    if(['english','sentences','speaking'].includes(s.learningMode)&&s.englishLevel===undefined)return false;
    if(s.breachElapsed!==undefined&&(!Number.isFinite(s.breachElapsed)||s.breachElapsed<0||s.breachElapsed>=3))return false;
    if(s.flowerHealth!==undefined&&(!Array.isArray(s.flowerHealth)||s.flowerHealth.length!==8||s.flowerHealth.some(h=>!Number.isFinite(h)||h<0||h>s.maxHealth/8)||Math.abs(s.flowerHealth.reduce((a,b)=>a+b,0)-s.health)>.000001))return false;
    if(s.maxSpellLength!==undefined&&(!Number.isInteger(s.maxSpellLength)||s.maxSpellLength<1||s.maxSpellLength>60))return false;
    if(s.maxLearningLoad!==undefined&&(!Number.isInteger(s.maxLearningLoad)||s.maxLearningLoad<1||s.maxLearningLoad>5))return false;
    if(s.skillAimLeft!==undefined&&(!Number.isFinite(s.skillAimLeft)||s.skillAimLeft<0||s.skillAimLeft>5))return false;
    if(s.skillAuto!==undefined&&typeof s.skillAuto!=='boolean')return false;
    if(s.skillAim!==undefined&&(!s.skillAim||![s.skillAim.x,s.skillAim.y].every(Number.isFinite)))return false;
    if(s.skillAuto===false&&!s.skillAim)return false;
    if(s.clones!==undefined&&(!Number.isFinite(s.clones)||s.clones<0||s.clones>8))return false;
    if(s.cloneShot!==undefined&&!Number.isFinite(s.cloneShot))return false;
    if(s.rage!==undefined&&(!Number.isFinite(s.rage)||s.rage<0||s.rage>5+(s.stacks?.rageDuration||0)))return false;
    if(s.magicSlow!==undefined&&typeof s.magicSlow!=='boolean')return false;
    if(typeof s.adaptive!=='boolean'||typeof s.auto!=='boolean'||!s.stacks||Array.isArray(s.stacks))return false;
    if(Object.entries(s.stacks).some(([k,v])=>!cardIds.has(k)||!Number.isInteger(v)||v<1))return false;
    if(!s.aim||!s.hero||![s.aim.x,s.aim.y,s.hero.x,s.hero.y].every(Number.isFinite))return false;
    if(!Array.isArray(s.skills)||s.skills.length!==3||s.skills.some((k,i)=>!k||!(s.customBank?s.customBank.entries.some(e=>e.word===k.code):['sentences','speaking'].includes(s.learningMode)?Boolean(root.findSentenceEntry(k.code)):s.learningMode==='english'?Boolean(root.findWordEntry(k.code)):new RegExp('^'+['A','S','D'][i]+'[A-Z]{0,59}$').test(k.code))||!Number.isInteger(k.typed)||k.typed<0||k.typed>=k.code.length||(k.repeatsDone!==undefined&&(!Number.isInteger(k.repeatsDone)||k.repeatsDone<0||k.repeatsDone>4))||!Number.isFinite(k.cd)||k.cd<0||!(k.kind?Object.hasOwn(root.GARDEN_SKILLS,k.kind)&&(k.duration===root.GARDEN_SKILLS[k.kind].duration||(k.kind==='laser'&&k.duration===8)||(k.kind==='freeze'&&k.duration===12)):[[6,8],[14,12],[11]][i].includes(k.duration))||!Number.isInteger(k.uses)))return false;
    if(s.skills.some(k=>(k.remainingUses!==undefined&&(!Number.isInteger(k.remainingUses)||k.remainingUses<1||k.remainingUses>5))||(k.baseKind!==undefined&&!['laser','freeze','melon'].includes(k.baseKind))))return false;
    if(new Set(s.skills.map((k,i)=>k.kind||['laser','freeze','melon'][i])).size!==3)return false;
    if(s.promptHistory!==undefined){
      if(!s.promptHistory||typeof s.promptHistory!=='object'||Array.isArray(s.promptHistory)||Object.keys(s.promptHistory).length>20)return false;
      for(const [key,history] of Object.entries(s.promptHistory)){
        if(key==='custom'){if(!s.customBank||!Array.isArray(history)||history.length>s.customBank.entries.length||history.some(w=>!s.customBank.entries.some(e=>e.word===w)))return false;continue;}
        const match=/^(english|context):([0-4])(?::([1-3]))?$/.exec(key);
        if(!match||(match[1]==='context')!==Boolean(match[3]))return false;
        const limit=match[1]==='english'?root.ENGLISH_WORDS[Number(match[2])].length:root.ENGLISH_CONTEXTS[Number(match[2])].length;
        if(!Array.isArray(history)||history.length>limit||new Set(history).size!==history.length||history.some(word=>typeof word!=='string'||word.length>300||!/^[A-Z .'-]+$/.test(word)))return false;
      }
    }
    const enemyNumbers=['id','x','y','hp','maxHp','speed','radius','hit','phase','gait','shield','poison','poisonTime','chill','ability','slowTime'];
    if(!Array.isArray(s.enemies)||s.enemies.length>500||s.enemies.some(z=>!z||!Object.hasOwn(root.ZOMBIE_TYPES,z.type)||enemyNumbers.some(k=>!Number.isFinite(z[k]))||z.hp<=0||(z.charmed!==undefined&&typeof z.charmed!=='boolean')||(z.deathMark!==undefined&&(!Number.isFinite(z.deathMark)||z.deathMark<0||z.deathMark>8))))return false;
    if(!Array.isArray(s.bullets)||s.bullets.length>4000||s.bullets.some(b=>!b||['x','y','px','py','vx','vy','life','damage','pierce','bounces'].some(k=>!Number.isFinite(b[k]))||(b.rageShot!==undefined&&typeof b.rageShot!=='boolean')||!Array.isArray(b.hitIds)||b.hitIds.some(x=>!Number.isInteger(x))))return false;
    if(!Array.isArray(s.effects)||s.effects.length>200||s.effects.some(e=>!e||!['laser','freeze','melon','explosion','charm','lightning','blackhole','mark','judgment'].includes(e.kind)||!Number.isFinite(e.life)||!Number.isFinite(e.fullLife)||e.fullLife<=0||(['melon','explosion','blackhole','judgment'].includes(e.kind)&&(!Number.isFinite(e.x)||!Number.isFinite(e.y)))||(e.kind==='melon'&&(!Number.isFinite(e.damage)||!Number.isFinite(e.radius)))||(e.kind==='laser'&&!Number.isFinite(e.angle))))return false;
    if(s.effects.some(e=>(e.kind==='lightning'&&(!Array.isArray(e.points)||e.points.length>10||e.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))))||(e.kind==='charm'&&(!Array.isArray(e.targets)?(!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.radius)):e.targets.length>5||e.targets.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))))||(e.kind==='blackhole'&&(!Number.isFinite(e.radius)||e.radius!==210||!Number.isFinite(e.tick)))))return false;
    if(!Array.isArray(s.offers)||s.offers.some(id=>!cardIds.has(id)))return false;
    if(s.status==='upgrade'&&(s.offers.length!==3||new Set(s.offers).size!==3))return false;
    return true;
  }
  function restore(game,save){
    if(!validate(save))return false;
    const s=JSON.parse(JSON.stringify(save.state));
    for(const key of FIELDS)game[key]=s[key];
    game.flowerHealth=s.flowerHealth?[...s.flowerHealth]:Array(8).fill(0);game.health=s.health;game.breachElapsed=s.breachElapsed??0;
    game.customBank=s.customBank||null;game.promptHistory=s.promptHistory||{};
    game.learningMode=s.learningMode??'letters';game.englishLevel=s.englishLevel??0;
    game.maxSpellLength=s.maxSpellLength??10;game.maxLearningLoad=s.maxLearningLoad??1;game.magicSlow=s.magicSlow??false;
    game.skillAuto=s.skillAuto??true;game.skillAimLeft=!game.skillAuto?(s.skillAimLeft>0?s.skillAimLeft:5):0;game.skillAim=s.skillAim??{...game.aim};
    game.rage=s.rage??0;game.clones=s.clones??0;game.cloneShot=s.cloneShot??0;game.deathQueue=[];game.processingDeath=false;
    game.skills.forEach((skill,i)=>{skill.kind=skill.kind||['laser','freeze','melon'][i];const definition=root.GARDEN_SKILLS[skill.kind],duration=definition.duration;skill.name=definition.name;skill.icon=definition.icon;if(skill.duration!==duration){skill.cd=Math.min(1,skill.cd/skill.duration)*duration;skill.duration=duration;}skill.repeatsDone=skill.repeatsDone??0;if(!['laser','freeze','melon'].includes(skill.kind)){skill.remainingUses=skill.remainingUses??5;skill.baseKind=skill.baseKind||['laser','freeze','melon'][i];}});
    game.bullets=s.bullets.map(b=>({...b,rageShot:Boolean(b.rageShot),hitIds:new Set(b.hitIds)}));
    game.offers=s.offers.map(id=>root.GARDEN_CARDS.find(c=>c.id===id));
    game.status=s.status;game.dead=[];game.shooting=false;
    return true;
  }
  root.GuluSave={encode,validate,restore};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSave;
})(typeof globalThis!=='undefined'?globalThis:this);
