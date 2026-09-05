/* Rendering-independent game rules; shared by the browser and Node checks. */
(function (root) {
  'use strict';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const CARDS = [
    ['power','大颗豌豆','💪','火力','子弹伤害 +25%'],['rapid','疯狂扳机','⚡','火力','射速 +18%'],
    ['multishot','分身豌豆','🌱','火力','每轮额外发射 1 颗子弹'],['pierce','穿透弹头','🏹','火力','每颗子弹额外穿透 1 个目标'],
    ['ricochet','弹弹豌豆','🔀','火力','命中后额外弹射 1 次'],['crit','幸运四叶草','🍀','火力','暴击率 +10%，最高 90%'],
    ['critPower','超级暴击','💥','火力','暴击伤害倍率 +0.5'],['splash','爆米花弹','🍿','火力','命中产生 35% 伤害爆炸，每层扩大范围'],
    ['poison','毒蘑菇','🍄','元素','每秒造成 8 点毒伤，持续 4 秒；伤害叠加'],['frost','冰薄荷','🧊','元素','子弹使目标减速 15%，叠加至 70%'],
    ['knockback','大风车','🌪️','生存','子弹击退距离 +4'],['leech','生命果汁','🧃','生存','每击退 18 只恢复 1 护盾；叠加缩短间隔，最低 2 只'],
    ['fortify','加固小院','🏡','生存','护盾上限 +2，并恢复 2 护盾'],['repair','修理小精灵','🛠️','生存','现在恢复 2 护盾，以后每波额外恢复 1'],
    ['thorns','仙人掌围墙','🌵','生存','僵尸靠近小院时，每秒受到 25 点伤害'],['magic','魔法放大镜','🔮','大招','激光、西瓜与冰冻冲击伤害 +25%'],
    ['recharge','充能电池','🔋','大招','大招充能速度 +20%'],['beam','彩虹扩音器','🌈','大招','激光攻击宽度 +35'],
    ['permafrost','漫长冬天','❄️','大招','全场冰冻持续时间 +1.5 秒'],['shatter','碎冰糖','🍬','大招','攻击冰冻目标额外伤害倍率 +0.5'],
    ['blast','巨无霸西瓜','🍉','大招','西瓜爆炸半径 +45'],['twinmelon','西瓜连连看','🎯','大招','每次西瓜大招多落下 1 枚西瓜'],
    ['barrier','魔法护盾','🛡️','生存','每释放 3 次大招恢复 1 护盾；每层增加恢复量'],['berserk','背水一战','🔥','火力','护盾不超过一半时，子弹伤害 +40%']
  ].map(([id,name,icon,category,description])=>({id,name,icon,category,description}));
  const TYPES = {
    walker:{name:'捣蛋鬼',icon:'',hp:1,speed:1},runner:{name:'闪电跑跑',icon:'⚡',hp:.7,speed:2.1},
    armor:{name:'铁桶卫士',icon:'🪣',hp:2,speed:.7},shield:{name:'盾牌兵',icon:'🛡️',hp:1.4,speed:.85},
    healer:{name:'奶妈僵尸',icon:'💚',hp:1.4,speed:.8},splitter:{name:'分裂软糖',icon:'🍬',hp:1.8,speed:.8},
    bomber:{name:'爆破客',icon:'💣',hp:1.15,speed:1.4},boss:{name:'巨型首领',icon:'👑',hp:12,speed:.55},
    mini:{name:'小软糖',icon:'',hp:.3,speed:1.65}
  };
  class GardenGame {
    constructor({ random = Math.random, emit = () => {} } = {}) {
      this.random = random; this.emit = emit; this.status = 'ready'; this.adaptive = true; this.auto = false;
      this.aim = { x: 690, y: 280 }; this.hero = { x: 100, y: 282 }; this.serial = 0;
      this.reset(); this.status = 'ready';
    }
    reset() {
      this.stacks = {}; this.offers = []; this.maxHealth = 8; this.healKills=0;
      this.health = 8; this.score = 0; this.kills = 0; this.casts = 0; this.correct = 0;
      this.wave = 1; this.spawned = 0; this.quota = 9; this.spawnIn = 2; this.waveBreak = 0;
      this.enemies = []; this.bullets = []; this.effects = []; this.dead = [];
      this.shooting = false; this.shotIn = 0; this.time = 0; this.freeze = 0; this.combo = 0;
      this.typing = -1; this.activeTime = 0;
      this.skills = [
        { name:'彩虹激光', code:'A', typed:0, cd:0, duration:8, uses:0, icon:'🌈' },
        { name:'冰冻派对', code:'S', typed:0, cd:0, duration:12, uses:0, icon:'❄️' },
        { name:'西瓜轰轰', code:'D', typed:0, cd:0, duration:11, uses:0, icon:'🍉' }
      ];
    }
    start() {
      this.reset(); this.status = 'playing';
      this.spawn(650, 210); this.spawn(790, 370); this.spawn(905, 140);
      this.emit('start'); this.emit('wave', { wave:1 });
    }
    pause() { if(this.status === 'playing') { this.status='paused'; this.shooting=false; this.emit('pause'); } }
    resume() { if(this.status === 'paused') { this.status='playing'; this.emit('resume'); } }
    setAim(x,y) { this.aim={x:clamp(x,160,980),y:clamp(y,100,455)}; }
    target() {
      if(this.auto && this.enemies.length) {
        const z=this.enemies.reduce((a,b)=>a.x<b.x?a:b); return {x:z.x,y:z.y};
      }
      return this.aim;
    }
    stack(id) { return this.stacks[id]||0; }
    get power() { return 1+.25*this.stack('power')+(this.health<=this.maxHealth/2?.4*this.stack('berserk'):0); }
    get magicPower() {return 1+.25*this.stack('magic');}
    spawn(x=1030,y=null,type=null,count=true) {
      if(!type){
        const pool=['walker'];if(this.wave>=2)pool.push('runner','armor');if(this.wave>=3)pool.push('shield','splitter');if(this.wave>=4)pool.push('healer','bomber');
        type=this.wave%5===0&&this.spawned===this.quota-1?'boss':pool[this.spawned%pool.length];
      }
      const spec=TYPES[type];const scale=Math.min(1e12,Math.pow(1.19,this.wave-1));
      const hp=72*spec.hp*scale;
      const z={id:++this.serial,type,x,y:y??[140,215,290,365,430][Math.floor(this.random()*5)],hp,maxHp:hp,
        speed:Math.min(155,(23+this.wave*2.3)*spec.speed),radius:type==='boss'?53:type==='mini'?20:31,
        boss:type==='boss',tough:type==='armor',hit:0,phase:this.random()*6.28,shield:type==='shield'?hp*.65:0,
        poison:0,poisonTime:0,chill:0,ability:3,slowTime:0};
      this.enemies.push(z);if(count)this.spawned++;
      if(z.boss)this.emit('boss');return z;
    }
    shoot() {
      const target=this.target(),angle=Math.atan2(target.y-this.hero.y,target.x-this.hero.x);
      const count=1+this.stack('multishot'),renderCount=Math.min(15,count);
      for(let i=0;i<renderCount;i++){
        const a=angle+(i-(renderCount-1)/2)*.06;
        this.bullets.push({x:this.hero.x+30,y:this.hero.y,px:this.hero.x+30,py:this.hero.y,vx:Math.cos(a)*720,vy:Math.sin(a)*720,life:2.5,
          damage:24*this.power*(count/renderCount),pierce:this.stack('pierce'),bounces:this.stack('ricochet'),hitIds:new Set()});
      }
      this.emit('shot',{angle});
    }
    damage(z,amount,kind='pea') {
      if(z.hp<=0)return;
      if(kind==='pea'&&z.type==='armor')amount*=.5;
      if(z.shield>0){const blocked=Math.min(z.shield,amount);z.shield-=blocked;amount-=blocked;}
      z.hp-=amount;z.hit=.12;
      if(kind==='pea')z.x=Math.min(1070,z.x+3+4*this.stack('knockback'));
      this.emit('hit',{x:z.x,y:z.y,kind});
      if(z.hp<=0){
        this.kills++;const score=z.boss?250:z.type==='walker'?10:25;this.score+=score;this.combo++;
        this.dead.push({...z,life:.7,fullLife:.7});this.emit('kill',{x:z.x,y:z.y,boss:z.boss,score});
        if(this.stack('leech')&&++this.healKills>=Math.max(2,20-this.stack('leech')*2)){this.healKills=0;this.health=Math.min(this.maxHealth,this.health+1);}
        if(z.type==='splitter'){this.spawn(z.x+12,clamp(z.y-25,100,455),'mini',false);this.spawn(z.x+22,clamp(z.y+25,100,455),'mini',false);}
      }
    }
    hitBullet(b,z){
      b.hitIds.add(z.id);
      let amount=b.damage;if(this.freeze>0)amount*=2+.5*this.stack('shatter');
      if(this.random()<Math.min(.9,.1*this.stack('crit'))){amount*=2+.5*this.stack('critPower');this.emit('critical',{x:z.x,y:z.y});}
      this.damage(z,amount);
      if(this.stack('poison')){z.poison=8*this.stack('poison');z.poisonTime=4;}
      if(this.stack('frost')){z.chill=Math.min(.7,.15*this.stack('frost'));z.slowTime=2;}
      if(this.stack('splash'))for(const other of [...this.enemies])if(other.id!==z.id&&Math.hypot(other.x-z.x,other.y-z.y)<55+20*this.stack('splash'))this.damage(other,amount*.35,'splash');
      if(b.bounces>0){const next=this.enemies.filter(e=>e.hp>0&&!b.hitIds.has(e.id)).sort((a,c)=>Math.hypot(a.x-z.x,a.y-z.y)-Math.hypot(c.x-z.x,c.y-z.y))[0];
        if(next){b.bounces--;b.x=z.x;b.y=z.y;const a=Math.atan2(next.y-z.y,next.x-z.x);b.vx=Math.cos(a)*720;b.vy=Math.sin(a)*720;return;}}
      if(b.pierce>0)b.pierce--;else b.life=0;
    }
    offerCards(){
      this.status='upgrade';this.shooting=false;this.cancelTyping();this.bullets=[];this.effects=[];
      const pool=[...CARDS];for(let i=pool.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
      this.offers=pool.slice(0,3);this.emit('upgrade',{wave:this.wave,offers:this.offers});
    }
    chooseCard(id){
      if(this.status!=='upgrade'||!this.offers.some(c=>c.id===id))return false;
      this.stacks[id]=(this.stacks[id]||0)+1;
      if(id==='fortify'){this.maxHealth+=2;this.health+=2;}
      if(id==='repair')this.health=Math.min(this.maxHealth,this.health+2);
      this.health=Math.min(this.maxHealth,this.health+1+this.stack('repair'));
      this.wave++;this.spawned=0;this.quota=9+(this.wave-1)*3;this.spawnIn=.7;this.waveBreak=0;this.offers=[];this.status='playing';
      for(const s of this.skills)s.cd=Math.max(0,s.cd-3);
      this.emit('wave',{wave:this.wave});return true;
    }
    nextCode(index) {
      const base=['A','S','D'][index];
      if(!this.adaptive || this.wave===1)return base;
      const choices=['FJKL','AJKL','FJKL'][index];
      let code=base;
      for(let i=1;i<Math.min(3,this.wave);i++)code+=choices[Math.floor(this.random()*choices.length)];
      return code;
    }
    select(index) {
      if(this.status!=='playing')return;
      if(this.skills[index].cd>0){this.emit('cooldown',{index});return;}
      if(this.typing!==index){ if(this.typing>=0)this.skills[this.typing].typed=0;this.typing=index; }
      this.emit('typing',{index});
    }
    input(key) {
      if(this.status!=='playing'||!(/^[a-z]$/i).test(key))return false;
      key=key.toUpperCase();
      let index=this.typing;
      if(index<0)index=this.skills.findIndex(s=>s.cd<=0&&s.code[0]===key);
      if(index<0){this.emit('wrong',{expected:this.skills.filter(s=>s.cd<=0).map(s=>s.code[0]).join(' / ')});return false;}
      const skill=this.skills[index];
      if(skill.cd>0)return false;
      this.typing=index;
      if(skill.code[skill.typed]!==key){this.emit('wrong',{expected:skill.code[skill.typed]});return false;}
      skill.typed++;this.correct++;this.emit('letter',{index});
      if(skill.typed===skill.code.length){
        if(!this.enemies.some(z=>z.hp>0)){skill.typed=0;this.typing=-1;this.emit('empty');return true;}
        this.cast(index);
      }
      return true;
    }
    backspace() { if(this.typing>=0){const s=this.skills[this.typing];s.typed=Math.max(0,s.typed-1);} }
    cancelTyping(){if(this.typing>=0)this.skills[this.typing].typed=0;this.typing=-1;}
    cast(index) {
      const skill=this.skills[index]; const target=this.target();
      this.typing=-1;skill.typed=0;skill.cd=skill.duration;skill.uses++;this.casts++;
      if(this.stack('barrier')&&this.casts%3===0)this.health=Math.min(this.maxHealth,this.health+this.stack('barrier'));
      if(index===0){
        const angle=Math.atan2(target.y-this.hero.y,target.x-this.hero.x);
        this.effects.push({kind:'laser',angle,width:85+35*this.stack('beam'),life:.65,fullLife:.65});
        for(const z of this.enemies){const dx=z.x-this.hero.x,dy=z.y-this.hero.y;const d=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));if(d<85+35*this.stack('beam')+z.radius)this.damage(z,210*this.magicPower,'laser');}
      }
      if(index===1){this.freeze=6+1.5*this.stack('permafrost');if(this.stack('magic'))for(const z of [...this.enemies])this.damage(z,30*this.stack('magic'),'ice');this.effects.push({kind:'freeze',life:1,fullLife:1});}
      if(index===2){for(let i=0;i<1+Math.min(10,this.stack('twinmelon'));i++)this.effects.push({kind:'melon',x:clamp(target.x+(i?((i%2?1:-1)*60*Math.ceil(i/2)):0),160,1000),y:target.y,life:.75+i*.2,fullLife:.75+i*.2,damage:380*this.magicPower*Math.max(1,(1+this.stack('twinmelon'))/11),radius:225+45*this.stack('blast')});}
      this.enemies=this.enemies.filter(z=>z.hp>0);
      this.emit('cast',{index,name:skill.name});
    }
    finish(win) {if(this.status!=='playing')return;this.status=win?'won':'lost';this.shooting=false;this.cancelTyping();this.emit('finish',{win});}
    update(rawDt) {
      const dt=clamp(rawDt,0,.05);
      if(this.status!=='playing')return;
      this.time+=dt;this.activeTime+=dt;
      const slow=this.typing>=0?.22:1;
      const worldDt=dt*slow;
      for(let i=0;i<this.skills.length;i++){
        const s=this.skills[i];if(s.cd>0){s.cd=Math.max(0,s.cd-dt*(1+.2*this.stack('recharge')));if(s.cd===0){s.code=this.nextCode(i);this.emit('ready',{index:i});}}
      }
      this.freeze=Math.max(0,this.freeze-worldDt);
      this.shotIn-=dt;
      if((this.shooting||this.auto)&&this.shotIn<=0){this.shoot();this.shotIn=Math.max(.025,.15/(1+.18*this.stack('rapid')));}
      for(const e of this.effects){e.life-=dt;if(e.kind==='melon'&&e.life<=0&&!e.exploded){e.exploded=true;for(const z of [...this.enemies])if(Math.hypot(z.x-e.x,z.y-e.y)<e.radius+z.radius)this.damage(z,e.damage,'melon');this.effects.push({kind:'explosion',x:e.x,y:e.y,life:.7,fullLife:.7});this.emit('explosion',{x:e.x,y:e.y});}}
      this.effects=this.effects.filter(e=>e.life>0);
      for(const z of [...this.enemies]){
        if(z.hp<=0)continue;
        z.hit=Math.max(0,z.hit-dt);
        z.poisonTime=Math.max(0,z.poisonTime-worldDt);if(z.poisonTime>0)this.damage(z,z.poison*worldDt,'poison');
        z.slowTime=Math.max(0,z.slowTime-worldDt);
        if(this.stack('thorns')&&z.x<260)this.damage(z,25*this.stack('thorns')*worldDt,'thorns');
        if(z.hp<=0)continue;
        if(this.freeze===0){
          z.x-=z.speed*worldDt*(z.slowTime>0?1-z.chill:1);z.ability-=worldDt;
          if(z.type==='healer'&&z.ability<=0){z.ability=3;for(const other of this.enemies)if(other.hp>0&&other.id!==z.id&&Math.hypot(other.x-z.x,other.y-z.y)<190)other.hp=Math.min(other.maxHp,other.hp+other.maxHp*.1);this.emit('heal',{x:z.x,y:z.y});}
          if(z.boss&&z.ability<=0&&this.enemies.length<80){z.ability=9;this.spawn(z.x+40,clamp(z.y+45,100,455),'runner',false);}
          if(z.type==='bomber'&&z.x<270){z.hp=0;this.health=Math.max(0,this.health-2);this.emit('explosion',{x:z.x,y:z.y});this.emit('breach',{health:this.health});continue;}
        }
        if(z.x<120){z.hp=0;this.health=Math.max(0,this.health-(z.boss?3:1));this.combo=0;this.emit('breach',{health:this.health});}
      }
      for(const b of this.bullets){
        b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        for(const z of this.enemies){
          if(z.hp<=0||b.life<=0||b.hitIds.has(z.id))continue;
          const dx=b.x-b.px,dy=b.y-b.py;const len=dx*dx+dy*dy;
          const t=len?clamp(((z.x-b.px)*dx+(z.y-b.py)*dy)/len,0,1):0;
          if(Math.hypot(z.x-(b.px+t*dx),z.y-(b.py+t*dy))<z.radius){this.hitBullet(b,z);break;}
        }
      }
      this.enemies=this.enemies.filter(z=>z.hp>0);
      this.bullets=this.bullets.filter(b=>b.life>0&&b.x<1070&&b.y>-50&&b.y<600);
      this.dead.forEach(z=>z.life-=dt);this.dead=this.dead.filter(z=>z.life>0);
      if(this.health<=0){this.finish(false);return;}
      if(this.spawned<this.quota){
        this.spawnIn-=worldDt;if(this.spawnIn<=0&&this.enemies.length<100){this.spawn();this.spawnIn=Math.max(.28,2.1*Math.pow(.88,this.wave-1));}
      } else if(this.enemies.length===0){
        this.offerCards();
      }
    }
  }
  root.GardenGame=GardenGame;root.GARDEN_CARDS=CARDS;root.ZOMBIE_TYPES=TYPES;
  if(typeof module!=='undefined'&&module.exports)module.exports={GardenGame,CARDS,TYPES};
})(typeof globalThis!=='undefined'?globalThis:this);
