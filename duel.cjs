'use strict';
const {GardenGame, ENGLISH_WORDS, ENGLISH_STAGES, DIALOGUE_STAGES, findWordEntry, findSentenceEntry} = require('./engine.js');
const UNITS = {runner:{name:'疾跑僵尸',cost:18}, armor:{name:'铁桶僵尸',cost:28}, bomber:{name:'爆破僵尸',cost:38}};
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
    if(this.enemies.length>=70)return null;
    const zombie=super.spawn(...args);
    zombie.owner=1-this.side;
    return zombie;
  }
  // Only the match may send troops. Disable solo waves and upgrade screens.
  offerCards() {}
  canBiteDefense(z) {return !z.engaged;}
  shoot() {
    if(this.auto&&!this.enemies.some(z=>z.hp>0&&z.x<=390))return;
    super.shoot();
  }
  hitBullet(b,z) {if(z.x<=430)super.hitBullet(b,z);}
  update(dt) {
    const stopped=this.enemies.filter(z=>z.engaged).map(z=>[z,z.speed]);
    for(const [z] of stopped)z.speed=0;
    super.update(dt);
    for(const [z,speed] of stopped)z.speed=speed;
    this.bullets=this.bullets.filter(b=>b.x<=430);
  }
  prepare(mode,level) {
    this.learningMode=mode;this.englishLevel=level;this.reset();this.status='playing';
    this.auto=true;this.fireStrength=.3;this.magicSlow=false;this.maxSpellLength=6;this.maxLearningLoad=2;
    this.quota=0;this.spawnIn=Infinity;
    for(let i=0;i<3;i++)this.skills[i].code=this.nextCode(i);
  }
}

class DuelMatch {
  constructor({mode='letters',level=0,random=Math.random}={}) {
    if(!MODES.includes(mode)||!Number.isInteger(level)||level<0||level>4)throw new Error('请选择有效的题目模式和等级');
    this.config={mode,level};this.random=random;this.round=0;
    this.players=[null,null];this.status='waiting';this.elapsed=0;this.winner=null;this.reason='';
    this.promptHistories=[{},{}];
  }
  join(name) {
    if(this.players.every(Boolean))throw new Error('房间已满，请创建另一个房间');
    const side=this.players[0]?1:0;
    this.players[side]={name:String(name||'小院守卫').trim().slice(0,16)||'小院守卫',connected:false,offline:0,ready:false,sun:24,sent:0,dispatchCd:0};
    return side;
  }
  connect(side,connected) {
    const p=this.players[side];if(!p)return;
    p.connected=connected;p.offline=0;
    if(!connected&&this.status==='waiting')p.ready=false;
    if(this.games)this.games[side].shooting=false;
  }
  begin() {
    this.round++;this.status='playing';this.elapsed=0;this.waveIn=1;this.winner=null;this.reason='';
    this.games=[0,1].map(side=>{const g=new DuelGarden(side,{random:this.random});g.promptHistory=this.promptHistories[side];g.prepare(this.config.mode,this.config.level);return g;});
    this.players.forEach(p=>Object.assign(p,{sun:24,sent:0,dispatchCd:0,ready:false,offline:0}));
  }
  end(winner,reason) {this.status='finished';this.winner=winner;this.reason=reason;this.players.forEach(p=>{if(p)p.ready=false;});}
  send(side,type,paid=false,laneY=null) {
    const target=this.games[1-side];
    if(target.enemies.length>=60)return false;
    // Each garden stores enemy coordinates with its own yard on the left.
    // Mirroring the other garden gives one shared, symmetric battlefield.
    const zombie=target.spawn(800,laneY,type,false);
    if(!zombie)return false;
    // Faster crossing keeps two-player rounds lively without changing solo rules.
    zombie.speed*=1.65;this.players[side].sent++;
    if(paid){this.players[side].sun-=UNITS[type].cost;this.players[side].dispatchCd=2;}
    return true;
  }
  clash(dt) {
    const armies=this.games.map(g=>g.enemies.filter(z=>z.hp>0));
    const hits=[];
    armies.forEach((army,index)=>{
      for(const z of army){
        z.engaged=false;z.duelTarget=null;
        if(this.games[index].freeze<=0)z.duelBiteIn=Math.max(0,(z.duelBiteIn||0)-dt);
        const opponents=armies[1-index].filter(other=>Math.abs(z.y-other.y)<35&&Math.abs(z.x-(1000-other.x))<=z.radius+other.radius+5);
        if(!opponents.length)continue;
        const target=opponents.reduce((a,b)=>Math.abs(z.x-(1000-a.x))<Math.abs(z.x-(1000-b.x))?a:b);
        z.engaged=true;z.duelTarget=target.id;
        if(this.games[index].freeze<=0&&z.duelBiteIn<=0){
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
    if(action.type==='ready') {
      if(!['waiting','finished'].includes(this.status))return;
      p.ready=true;
      if(this.players.every(q=>q&&q.connected&&q.ready))this.begin();
      return;
    }
    if(action.type==='surrender') {if(this.status==='playing')this.end(1-side,'对方认输');return;}
    if(this.status!=='playing'||!this.players.every(q=>q&&q.connected))throw new Error('对局尚未开始或正在等待重连');
    const g=this.games[side];
    switch(action.type) {
      case 'key': if(typeof action.key==='string'&&/^[a-z .'-]$/i.test(action.key))g.input(action.key);else throw new Error('无效按键');break;
      case 'select': if(Number.isInteger(action.index)&&action.index>=0&&action.index<3)g.select(action.index);else throw new Error('无效技能');break;
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
    this.players.forEach(p=>{p.sun=Math.min(100,p.sun+dt*2);p.dispatchCd=Math.max(0,p.dispatchCd-dt);});
    if(this.waveIn<=0) {
      const lane=[140,215,290,365,430][Math.floor(this.random()*5)];
      this.send(0,'walker',false,lane);this.send(1,'walker',false,lane);this.waveIn=Math.max(1.8,4-(wave-1)*.3);
    }
    this.clash(dt);
    this.games.forEach(g=>g.update(dt));
    const lost=this.games.map((g,i)=>g.status==='lost'?i:-1).filter(i=>i>=0);
    if(lost.length)this.end(lost.length===2?null:1-lost[0],lost.length===2?'双方后院同时被攻破':'对方后院已被攻破');
  }
  snapshot(side) {
    const fields=this.games?.map(g=>({health:g.health,maxHealth:g.maxHealth,flowers:g.flowerHealth,breach:g.breachElapsed,
      enemies:g.enemies.map(z=>({id:z.id,owner:z.owner,type:z.type,x:z.x,y:z.y,hp:z.hp,maxHp:z.maxHp,shield:z.shield,gait:z.gait,hit:z.hit,engaged:!!z.engaged})),
      bullets:g.bullets.map(b=>({x:b.x,y:b.y})),effects:g.effects.map(e=>({...e})),freeze:g.freeze,shotKick:g.shotKick,hero:g.hero,target:g.target(),kills:g.kills,casts:g.casts}));
    const own=this.games?.[side];
    return {status:this.status,round:this.round,side,config:this.config,elapsed:this.elapsed,winner:this.winner,reason:this.reason,
      paused:this.status==='playing'&&this.players.some(p=>!p?.connected),
      players:this.players.map(p=>p?{name:p.name,connected:p.connected,ready:p.ready,sun:Math.floor(p.sun),sent:p.sent,dispatchCd:p.dispatchCd,offline:p.offline}:null),
      stage:this.config.mode==='english'?ENGLISH_STAGES[this.config.level]:null,
      dialogueStage:this.config.mode==='sentences'?DIALOGUE_STAGES[this.config.level]:null,
      wordSeen:own?.promptHistory[`english:${this.config.level}`]?.length||0,
      fields,auto:own?.auto,typing:own?.typing,feedback:own?.feedback,
      skills:own?.skills.map(s=>{
        const entry=own.learningMode==='english'?findWordEntry(s.code):own.learningMode==='letters'?null:findSentenceEntry(s.code);
        return {...s,meaning:entry?.meaning,scene:entry?.scene,goal:entry?.goal,grammar:entry?.grammar,reference:entry?.reference};
      }),
      learningLoad:own?.learningLoad,units:UNITS};
  }
}
module.exports={DuelMatch,UNITS};
