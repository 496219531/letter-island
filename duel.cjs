'use strict';
const {GardenGame, ENGLISH_WORDS, ENGLISH_STAGES, DIALOGUE_STAGES, findWordEntry, findSentenceEntry} = require('./engine.js');
const UNITS = {
  walker:{name:'普通僵尸',cost:12},runner:{name:'疾跑僵尸',cost:18},
  armor:{name:'铁桶僵尸',cost:28},shield:{name:'护盾僵尸',cost:32},
  healer:{name:'治疗僵尸',cost:34},bomber:{name:'爆破僵尸',cost:38}
};
const LANES=[140,215,290,365,430];
const PHASES=[
  {name:'交锋',interval:.9,sunRate:2,types:['walker','walker','walker','runner','armor']},
  {name:'增援',interval:.68,sunRate:2.5,types:['walker','walker','runner','armor','shield','healer']},
  {name:'激战',interval:.5,sunRate:3,types:['walker','runner','armor','shield','healer','bomber']},
  {name:'决战',interval:.38,sunRate:3.5,types:['runner','armor','shield','healer','bomber','splitter']}
];
function seededRandom(seed){
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)|0;
    let value=Math.imul(state^(state>>>15),1|state);
    value^=value+Math.imul(value^(value>>>7),61|value);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
const MODES = ['letters','english','sentences'];

class DuelGarden extends GardenGame {
  constructor(side, options) {
    const feedback={id:0,text:''};
    super({...options,emit(type,data){
      const text=type==='empty'?'当前没有来犯僵尸，技能已保留':type==='wrong'?`下一步请输入 ${data.expected}`:type==='cast'?`${data.name}！`:type==='repeat'?`已完成 ${data.done} / ${data.total} 遍`:'';
      if(text){feedback.id++;feedback.text=text;}
    }});
    this.side=side;this.feedback=feedback;
  }
  nextCode(index) {
    if(this.learningMode!=='letters')return super.nextCode(index);
    const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ',others=this.skills.filter((_,i)=>i!==index).map(s=>s.code[0]);
    const first=[...alphabet].filter(c=>!others.includes(c));
    let code=first[Math.floor(this.random()*first.length)];
    while(code.length<Math.min(6,3+Math.floor((this.wave-1)/2)))code+=alphabet[Math.floor(this.random()*26)];
    return code;
  }
  spawn(...args) {
    if(this.enemies.length>=85)return null;
    const zombie=super.spawn(...args);
    zombie.owner=1-this.side;
    return zombie;
  }
  // Only the match may send troops. Disable solo waves and upgrade screens.
  offerCards() {}
  canCastWithoutEnemies(index){return this.reserveNext||['ward','mend'].includes(this.skills[index]?.kind);}
  skillTarget(){return this.target();}
  canBiteDefense(z) {return !z.engaged&&!(z.staggerTime>0)&&this.siegeLeaders?.has(z.id);}
  damageDefense(amount,y){super.damageDefense(amount*.25,y);}
  shoot() {
    if(this.auto&&!this.enemies.some(z=>z.hp>0&&z.x<=390))return;
    super.shoot();
  }
  hitBullet(b,z) {if(z.x<=430)super.hitBullet(b,z);}
  queueLaser(target){
    const lane=LANES.reduce((best,_,i)=>Math.abs(LANES[i]-target.y)<Math.abs(LANES[best]-target.y)?i:best,0);
    this.pendingLasers.push({lane,remaining:.35,damage:this.laserDamage});
    this.effects.push({kind:'laserCharge',x:75,y:LANES[lane],length:925,life:.35,fullLife:.35});
    return true;
  }
  resolveLasers(dt){
    const pending=[];
    for(const shot of this.pendingLasers){
      shot.remaining-=dt;
      if(shot.remaining>1e-8){pending.push(shot);continue;}
      const result={id:++this.laserSerial,lane:shot.lane+1,hits:0,kills:0,pushed:0,damage:0,time:this.time};
      for(const z of [...this.enemies]){
        if(z.hp<=0||z.charmed||z.owner!==1-this.side||Math.abs(z.y-LANES[shot.lane])>=35)continue;
        const before=z.hp+z.shield;result.hits++;
        this.damage(z,shot.damage,'laser');result.damage+=Math.max(0,before-Math.max(0,z.hp)-Math.max(0,z.shield));
        const dead=z.hp<=0;
        if(dead)result.kills++;
        else{
          z.knockbackLeft=Math.min(72,Math.max(0,800-z.x));
          z.staggerTime=.9;z.engaged=false;
          if(z.knockbackLeft>0)result.pushed++;
        }
        this.effects.push({kind:'laserHit',x:z.x,y:z.y,dead,life:.65,fullLife:.65});
      }
      this.pruneEnemies();this.laserResult=result;
      this.effects.push({kind:'duelLaser',x:75,y:LANES[shot.lane],length:925,life:.65,fullLife:.65});
      this.feedback.id++;this.feedback.text=result.hits?'激光命中 '+result.hits+' 只 · 消灭 '+result.kills+' · 击退 '+result.pushed:'激光扫过第 '+result.lane+' 路 · 敌兵已离开范围';
    }
    this.pendingLasers=pending;
  }
  cast(index,completedPractice=false,releasing=false){
    if(completedPractice&&this.reserveNext&&!releasing){
      if(this.heldSpell)return;
      this.heldSpell={index,id:++this.chargeSerial};this.reserveNext=false;
      this.skills[index].held=true;this.skills[index].typed=0;this.typing=-1;
      this.feedback.id++;this.feedback.text=this.skills[index].name+'已蓄好 · 点释放把握时机';
      return;
    }
    const skill=this.skills[index],permanent=['lightning','ward','mend'].includes(skill.kind);
    const shattering=skill.kind==='lightning'&&this.freeze>0;
    if(permanent)skill.remainingUses=Infinity;
    try{
      const result=super.cast(index,completedPractice);
      if(shattering){this.freeze=0;this.feedback.id++;this.feedback.text='碎冰连锁！闪电伤害 +35%，消耗剩余冰霜';}
      return result;
    }finally{if(permanent)delete skill.remainingUses;}
  }
  releaseSpell(id){
    if(!this.heldSpell||id!==this.heldSpell.id)throw Error('这张大招已释放或已改变');
    const {index}=this.heldSpell;
    if(!this.enemies.some(z=>z.hp>0&&!z.charmed)&&!['ward','mend'].includes(this.skills[index].kind))throw Error('当前没有敌兵，大招继续保留');
    const typing=this.typing;
    this.heldSpell=null;this.skills[index].held=false;this.cast(index,true,true);
    if(typing>=0&&typing!==index)this.typing=typing;
  }
  damage(z,amount,kind='pea') {
    if(z.hp<=0||z.charmed||amount<=0)return;
    if(kind==='lightning'&&this.freeze>0){amount*=1.35;this.effects.push({kind:'shatter',x:z.x,y:z.y,life:.65,fullLife:.65});}
    if(z.wardTime>0){
      z.wardAbsorbed=(z.wardAbsorbed||0)+amount*.4;amount*=.6;
      if(z.wardAbsorbed>=z.maxHp*.3){
        z.wardTime=0;this.pendingWardBreaks.push({x:z.x,y:z.y});
        this.effects.push({kind:'wardBurst',x:z.x,y:z.y,life:.6,fullLife:.6});
      }
    }
    super.damage(z,amount,kind);
  }
  update(dt) {
    // One frontliner per lane can reach the garden fence at a time. The rest
    // keep the push alive without multiplying siege damage into an instant win.
    const front=new Map();
    for(const z of this.enemies)if(z.hp>0&&!z.charmed&&!z.engaged){
      const lane=LANES.reduce((best,_,i)=>Math.abs(LANES[i]-z.y)<Math.abs(LANES[best]-z.y)?i:best,0);
      if(!front.has(lane)||z.x<front.get(lane).x)front.set(lane,z);
    }
    this.siegeLeaders=new Set([...front.values()].map(z=>z.id));
    for(const z of this.enemies){
      z.wardTime=Math.max(0,(z.wardTime||0)-dt);z.mendTime=Math.max(0,(z.mendTime||0)-dt);
      z.staggerTime=Math.max(0,(z.staggerTime||0)-dt);
      if(z.hp>0&&z.knockbackLeft>0){const step=Math.min(z.knockbackLeft,dt*288,Math.max(0,800-z.x));z.x+=step;z.knockbackLeft=step>0?z.knockbackLeft-step:0;}
    }
    const stopped=this.enemies.filter(z=>z.engaged||z.staggerTime>0).map(z=>[z,z.speed]);
    for(const [z] of stopped)z.speed=0;
    super.update(dt);
    for(const z of this.enemies)if(z.hp>0&&z.mendTime>0)z.hp=Math.min(z.maxHp,z.hp+z.maxHp*.025*dt);
    for(const [z,speed] of stopped)z.speed=speed;
    this.bullets=this.bullets.filter(b=>b.x<=430);
    this.resolveLasers(dt);
  }
  prepare(mode,level,customBank) {
    this.learningMode=mode;this.englishLevel=level;this.setCustomBank(customBank);this.reset();this.status='playing';
    this.auto=true;this.fireStrength=.3;this.magicSlow=false;this.maxSpellLength=6;this.maxLearningLoad=2;
    this.maxHealth=56;this.health=56;
    this.reserveNext=false;this.heldSpell=null;this.chargeSerial=0;this.pendingWardBreaks=[];
    this.pendingLasers=[];this.laserSerial=0;this.laserResult=null;
    this.quota=0;this.spawnIn=Infinity;
    this.skills.push(
      {kind:'lightning',name:'连锁闪电',code:'F',typed:0,repeatsDone:0,cd:0,duration:12,uses:0,icon:'⚡'},
      {kind:'ward',name:'护送结界',code:'G',typed:0,repeatsDone:0,cd:0,duration:16,uses:0,icon:'🛡️'},
      {kind:'mend',name:'再生脉冲',code:'H',typed:0,repeatsDone:0,cd:0,duration:18,uses:0,icon:'💚'}
    );
    for(let i=0;i<this.skills.length;i++)this.skills[i].code=this.nextCode(i);
  }
}

class DuelMatch {
  constructor({mode='letters',level=0,customBank=null,publicResource=null,random=Math.random}={}) {
    if(!MODES.includes(mode)||!Number.isInteger(level)||level<0||level>4)throw new Error('请选择有效的题目模式和等级');
    this.customBank=customBank?JSON.parse(JSON.stringify(customBank)):null;this.config={mode,level,...(publicResource?{publicResource}: {})};this.random=random;this.round=0;
    this.players=[null,null];this.status='waiting';this.elapsed=0;this.winner=null;this.reason='';
    this.promptHistories=[{},{}];
  }
  join(name) {
    if(this.players.every(Boolean))throw new Error('房间已满，请创建另一个房间');
    const side=this.players[0]?1:0;
    this.players[side]={name:String(name||'小院守卫').trim().slice(0,16)||'小院守卫',connected:false,offline:0,ready:false,sun:24,sent:0,dispatchCd:0,wardUntil:0,mendUntil:0};
    return side;
  }
  leave(side) {
    if(!this.players[side])return;
    this.players[side]=null;this.status='waiting';this.games=null;this.winner=null;this.reason='';
    this.players.forEach(p=>{if(p)p.ready=false;});
  }
  connect(side,connected) {
    const p=this.players[side];if(!p)return;
    p.connected=connected;p.offline=0;
    if(!connected&&this.status==='waiting')p.ready=false;
    if(this.games)this.games[side].shooting=false;
  }
  begin() {
    this.round++;this.status='playing';this.elapsed=0;this.waveIn=.7;this.autoSerial=0;this.winner=null;this.reason='';
    const seed=Math.floor(this.random()*4294967296)>>>0;
    this.games=[0,1].map(side=>{const g=new DuelGarden(side,{random:seededRandom(seed)});g.promptHistory=this.promptHistories[side];g.prepare(this.config.mode,this.config.level,this.customBank);return g;});
    this.players.forEach(p=>Object.assign(p,{sun:24,sent:0,dispatchCd:0,ready:false,offline:0,wardUntil:0,mendUntil:0}));

  }
  end(winner,reason) {this.status='finished';this.winner=winner;this.reason=reason;this.players.forEach(p=>{if(p)p.ready=false;});}
  send(side,type,paid=false,laneY=null) {
    const target=this.games[1-side];
    target.enemies=target.enemies.filter(z=>z.hp>0);
    if(target.enemies.length>=75)return false;
    // Each garden stores enemy coordinates with its own yard on the left.
    // Mirroring the other garden gives one shared, symmetric battlefield.
    const zombie=target.spawn(800,laneY,type,false);
    if(!zombie)return false;
    // Faster crossing keeps two-player rounds lively without changing solo rules.
    zombie.speed*=1.65;this.players[side].sent++;
    zombie.wardTime=Math.max(0,this.players[side].wardUntil-this.elapsed);
    zombie.wardAbsorbed=0;
    zombie.mendTime=Math.max(0,this.players[side].mendUntil-this.elapsed);
    if(paid){this.players[side].sun-=UNITS[type].cost;this.players[side].dispatchCd=.8;}
    return true;
  }
  get phase(){return Math.min(PHASES.length-1,Math.floor(this.elapsed/60));}
  support(side,kind){
    const p=this.players[side],army=this.games[1-side].enemies.filter(z=>z.hp>0&&z.owner===side);
    if(kind==='ward'){
      p.wardUntil=this.elapsed+5;
      for(const z of army){z.wardTime=5;z.wardAbsorbed=0;}
    }else if(kind==='mend'){
      p.mendUntil=this.elapsed+5;
      for(const z of army){z.hp=Math.min(z.maxHp,z.hp+z.maxHp*.2);z.mendTime=5;}
    }
  }
  resolveWardBreaks(){
    const pushed=new Set();
    this.games.forEach((garden,index)=>{
      const bursts=garden.pendingWardBreaks.splice(0);
      if(!bursts.length)return;
      for(const burst of bursts)for(const foe of this.games[1-index].enemies){
        if(foe.hp<=0||foe.charmed||pushed.has(foe)||Math.abs(foe.y-burst.y)>35||Math.abs(foe.x-(1000-burst.x))>120)continue;
        foe.x=Math.max(foe.x,Math.min(800,foe.x+45));foe.engaged=false;pushed.add(foe);
      }
      const owner=this.games[1-index];owner.feedback.id++;owner.feedback.text='护盾反震！附近敌兵被推退';
    });
  }
  clash(dt) {
    const armies=this.games.map(g=>g.enemies.filter(z=>z.hp>0));
    const hits=[];
    armies.forEach((army,index)=>{
      for(const z of army){
        z.engaged=false;z.duelTarget=null;
        z.duelBiteIn=Math.max(0,(z.duelBiteIn||0)-dt);
        let target=null,nearest=Infinity;
        for(const other of armies[1-index]){
          const distance=Math.abs(z.x-(1000-other.x));
          if(Math.abs(z.y-other.y)<35&&distance<=z.radius+other.radius+5&&distance<=nearest){target=other;nearest=distance;}
        }
        if(!target)continue;
        z.engaged=true;z.duelTarget=target.id;
        if(z.duelBiteIn<=0&&!(z.staggerTime>0)){
          const scale=Math.pow(1.19,this.games[index].wave-1);
          hits.push({garden:this.games[1-index],target,damage:(z.type==='armor'?13:z.type==='runner'?7:10)*scale});
          z.duelBiteIn=.65;
        }
      }
    });
    // Compute both sides' attacks before applying damage, so a lethal exchange
    // does not favour the army processed first.
    for(const {garden,target,damage} of hits)garden.damage(target,damage,'bite');
    this.games.forEach(g=>{g.enemies=g.enemies.filter(z=>z.hp>0);});
  }
  command(side,action) {
    const p=this.players[side];if(!p||!p.connected)throw new Error('连接尚未恢复');
    if(action.type==='unready') {if(['waiting','finished'].includes(this.status))p.ready=false;return;}
    if(action.type==='ready') {
      if(!['waiting','finished'].includes(this.status))return;
      p.ready=true;
      if(this.players.every(q=>q&&q.connected&&q.ready))this.begin();
      return;
    }
    if(action.type==='surrender') {if(this.status==='playing')this.end(1-side,'对方认输');return;}
    if(this.status!=='playing'||!this.players.every(q=>q&&q.connected))throw new Error('对局尚未开始或正在等待重连');
    const g=this.games[side],castsBefore=g.casts,usesBefore=g.skills.map(s=>s.uses);
    switch(action.type) {
      case 'reserve':
        if(typeof action.value!=='boolean')throw Error('无效蓄招状态');
        if(g.heldSpell)throw Error('只能保留一张大招，请先释放');
        g.reserveNext=action.value;break;
      case 'release':if(action.round!==this.round)throw Error('这张大招属于上一局');g.releaseSpell(action.id);break;
      case 'key': if(typeof action.key==='string'&&/^[a-z .'-]$/i.test(action.key))g.input(action.key);else throw new Error('无效按键');break;
      case 'select': if(Number.isInteger(action.index)&&action.index>=0&&action.index<g.skills.length)g.select(action.index);else throw new Error('无效技能');break;
      case 'backspace':g.backspace();break;
      case 'cancel':g.cancelTyping();break;
      case 'aim':if(Number.isFinite(action.x)&&Number.isFinite(action.y))g.setAim(action.x,action.y);else throw new Error('无效坐标');break;
      case 'fire':if(typeof action.value!=='boolean')throw new Error('无效射击状态');g.shooting=action.value;break;
      case 'auto':if(typeof action.value!=='boolean')throw new Error('无效射击状态');g.auto=action.value;g.shooting=false;break;
      case 'send': {
        if(!Object.hasOwn(UNITS,action.unit))throw new Error('无效僵尸');
        if(p.dispatchCd>0)throw new Error('派兵正在冷却');
        if(p.sun<UNITS[action.unit].cost)throw new Error('阳光还不够');
        if(!this.send(side,action.unit,true))throw new Error('对方战场已满，请稍后再派兵');
        break;
      }
      default:throw new Error('不支持的操作');
    }
    if(g.casts>castsBefore){const index=g.skills.findIndex((s,i)=>s.uses>usesBefore[i]);if(index>=0)this.support(side,g.skills[index].kind);}
    this.resolveWardBreaks();
  }
  tick(dt) {
    if(this.status!=='playing')return;
    dt=Math.max(0,Math.min(.05,dt));
    const missing=this.players.map((p,i)=>!p.connected?i:-1).filter(i=>i>=0);
    if(missing.length) {
      missing.forEach(i=>this.players[i].offline+=dt);
      if(missing.some(i=>this.players[i].offline>=30))this.end(missing.length===2?null:1-missing[0],missing.length===2?'双方断线，比赛结束':'对方断线超过 30 秒');
      return;
    }
    this.elapsed+=dt;this.waveIn-=dt;
    const wave=Math.min(8,1+Math.floor(this.elapsed/40));
    this.games.forEach(g=>{g.wave=wave;});
    const phase=PHASES[this.phase];
    this.players.forEach(p=>{p.sun=Math.min(100,p.sun+dt*phase.sunRate);p.dispatchCd=Math.max(0,p.dispatchCd-dt);});
    if(this.waveIn<=0) {
      const type=phase.types[this.autoSerial%phase.types.length];
      const lane=LANES[(this.autoSerial*3)%LANES.length];this.autoSerial++;
      this.send(0,type,false,this.phase===3?LANES[Math.floor(this.random()*LANES.length)]:lane);
      this.send(1,type,false,this.phase===3?LANES[Math.floor(this.random()*LANES.length)]:lane);
      this.waveIn=phase.interval;
    }
    this.clash(dt);
    this.games.forEach(g=>g.update(dt));
    this.resolveWardBreaks();
    const lost=this.games.map((g,i)=>g.status==='lost'?i:-1).filter(i=>i>=0);
    if(lost.length)this.end(lost.length===2?null:1-lost[0],lost.length===2?'双方后院同时被攻破':'对方后院已被攻破');
  }
  snapshot(side,sharedFields) {
    const fields=sharedFields??this.games?.map(g=>({health:g.health,maxHealth:g.maxHealth,flowers:g.flowerHealth,breach:g.breachElapsed,
      enemies:g.enemies.map(z=>({id:z.id,owner:z.owner,type:z.type,x:z.x,y:z.y,hp:z.hp,maxHp:z.maxHp,shield:z.shield,gait:z.gait,hit:z.hit,engaged:!!z.engaged,wardTime:z.wardTime||0,mendTime:z.mendTime||0,staggerTime:z.staggerTime||0})),
      laserResult:g.laserResult?{...g.laserResult,age:g.time-g.laserResult.time}:null,
      bullets:g.bullets.map(b=>({x:b.x,y:b.y})),effects:g.effects.map(e=>({...e})),freeze:g.freeze,shotKick:g.shotKick,hero:g.hero,target:g.target(),kills:g.kills,casts:g.casts}));
    const own=this.games?.[side];
    return {status:this.status,round:this.round,side,config:this.config,elapsed:this.elapsed,winner:this.winner,reason:this.reason,phase:this.phase,phaseName:PHASES[this.phase].name,nextWave:Math.max(0,this.waveIn),
      paused:this.status==='playing'&&this.players.some(p=>!p?.connected),
      players:this.players.map(p=>p?{name:p.name,connected:p.connected,ready:p.ready,sun:Math.floor(p.sun),sent:p.sent,dispatchCd:p.dispatchCd,offline:p.offline}:null),
      stage:this.config.mode==='english'?ENGLISH_STAGES[this.config.level]:null,
      dialogueStage:this.config.mode==='sentences'?DIALOGUE_STAGES[this.config.level]:null,
      wordSeen:own?.promptHistory[`english:${this.config.level}`]?.length||0,
      fields,auto:own?.auto,typing:own?.typing,feedback:own?.feedback,reserveNext:!!own?.reserveNext,
      heldSpell:own?.heldSpell?{...own.heldSpell,name:own.skills[own.heldSpell.index].name,icon:own.skills[own.heldSpell.index].icon}:null,
      skills:own?.skills.map(s=>{
        const entry=own.customBank?own.learningEntry(s.code):own.learningMode==='english'?findWordEntry(s.code):own.learningMode==='letters'?null:findSentenceEntry(s.code);
        return {...s,meaning:entry?.meaning,scene:entry?.scene,goal:entry?.goal,grammar:entry?.grammar,reference:entry?.reference};
      }),
      learningLoad:own?.learningLoad,units:UNITS};
  }
}
module.exports={DuelMatch,UNITS};
