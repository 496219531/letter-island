/* Rendering-independent game rules; shared by the browser and Node checks. */
(function (root) {
  'use strict';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  class GardenGame {
    constructor({ random = Math.random, emit = () => {} } = {}) {
      this.random = random; this.emit = emit; this.status = 'ready'; this.adaptive = true; this.auto = false;
      this.aim = { x: 690, y: 280 }; this.hero = { x: 100, y: 282 }; this.serial = 0;
      this.reset(); this.status = 'ready';
    }
    reset() {
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
    spawn(x=1030,y=null) {
      const boss=this.wave===3 && this.spawned===this.quota-1;
      const tough=!boss && this.spawned>2 && this.spawned%4===0;
      const hp=boss?700:tough?144:72;
      const z={id:++this.serial,x,y:y??[140,215,290,365,430][Math.floor(this.random()*5)],hp,maxHp:hp,speed:boss?12:tough?17:21+this.wave*3+this.random()*7,radius:boss?53:31,boss,tough,hit:0,phase:this.random()*6.28};
      this.enemies.push(z);this.spawned++;
      if(boss)this.emit('boss');
      return z;
    }
    shoot() {
      const target=this.target(); const angle=Math.atan2(target.y-this.hero.y,target.x-this.hero.x);
      this.bullets.push({x:this.hero.x+30,y:this.hero.y,px:this.hero.x+30,py:this.hero.y,vx:Math.cos(angle)*720,vy:Math.sin(angle)*720,life:1.8});
      this.emit('shot',{angle});
    }
    damage(z,amount,kind='pea') {
      if(z.hp<=0)return;
      z.hp-=amount;z.hit=.12;
      if(kind==='pea')z.x+=3;
      this.emit('hit',{x:z.x,y:z.y,kind});
      if(z.hp<=0){
        this.kills++;this.score+=z.boss?250:z.tough?30:10;this.combo++;
        this.dead.push({...z,life:.7,fullLife:.7});this.emit('kill',{x:z.x,y:z.y,boss:z.boss,score:z.boss?250:z.tough?30:10});
      }
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
      if(index===0){
        const angle=Math.atan2(target.y-this.hero.y,target.x-this.hero.x);
        this.effects.push({kind:'laser',angle,life:.65,fullLife:.65});
        for(const z of this.enemies){const dx=z.x-this.hero.x,dy=z.y-this.hero.y;const d=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle));if(d<85+z.radius)this.damage(z,210,'laser');}
      }
      if(index===1){this.freeze=6;this.effects.push({kind:'freeze',life:1,fullLife:1});}
      if(index===2){this.effects.push({kind:'melon',x:target.x,y:target.y,life:.75,fullLife:.75});}
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
        const s=this.skills[i];if(s.cd>0){s.cd=Math.max(0,s.cd-dt);if(s.cd===0){s.code=this.nextCode(i);this.emit('ready',{index:i});}}
      }
      this.freeze=Math.max(0,this.freeze-worldDt);
      this.shotIn-=dt;
      if((this.shooting||this.auto)&&this.shotIn<=0){this.shoot();this.shotIn=.15;}
      for(const e of this.effects){e.life-=dt;if(e.kind==='melon'&&e.life<=0&&!e.exploded){e.exploded=true;for(const z of this.enemies)if(Math.hypot(z.x-e.x,z.y-e.y)<225+z.radius)this.damage(z,380,'melon');this.effects.push({kind:'explosion',x:e.x,y:e.y,life:.7,fullLife:.7});this.emit('explosion',{x:e.x,y:e.y});}}
      this.effects=this.effects.filter(e=>e.life>0);
      for(const z of this.enemies){
        if(z.hp<=0)continue;
        z.hit=Math.max(0,z.hit-dt);
        if(this.freeze===0)z.x-=z.speed*worldDt;
        if(z.x<120){z.hp=0;this.health=Math.max(0,this.health-(z.boss?3:1));this.combo=0;this.emit('breach',{health:this.health});}
      }
      for(const b of this.bullets){
        b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
        for(const z of this.enemies){
          if(z.hp<=0||b.life<=0)continue;
          const dx=b.x-b.px,dy=b.y-b.py;const len=dx*dx+dy*dy;
          const t=len?clamp(((z.x-b.px)*dx+(z.y-b.py)*dy)/len,0,1):0;
          if(Math.hypot(z.x-(b.px+t*dx),z.y-(b.py+t*dy))<z.radius){this.damage(z,this.freeze>0?48:24);b.life=0;}
        }
      }
      this.enemies=this.enemies.filter(z=>z.hp>0);
      this.bullets=this.bullets.filter(b=>b.life>0&&b.x<1070&&b.y>-50&&b.y<600);
      this.dead.forEach(z=>z.life-=dt);this.dead=this.dead.filter(z=>z.life>0);
      if(this.health<=0){this.finish(false);return;}
      if(this.spawned<this.quota){
        this.spawnIn-=worldDt;if(this.spawnIn<=0){this.spawn();this.spawnIn=this.wave===1?2.2:this.wave===2?1.8:1.4;}
      } else if(this.enemies.length===0){
        if(this.wave===3){this.finish(true);return;}
        if(this.waveBreak===0){this.waveBreak=3;this.emit('clear',{wave:this.wave});}
        else {this.waveBreak-=dt;if(this.waveBreak<=0){this.wave++;this.spawned=0;this.quota=this.wave===2?12:15;this.spawnIn=.5;this.waveBreak=0;this.health=Math.min(8,this.health+2);this.cancelTyping();this.emit('wave',{wave:this.wave});}}
      }
    }
  }
  root.GardenGame=GardenGame;
  if(typeof module!=='undefined'&&module.exports)module.exports={GardenGame};
})(typeof globalThis!=='undefined'?globalThis:this);
