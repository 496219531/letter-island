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
  // Game-specific learning tiers, not an exam or curriculum classification.
  const ENGLISH_WORDS=["cat:猫 dog:狗 sun:太阳 moon:月亮 egg:鸡蛋 red:红色 blue:蓝色 pig:猪 cow:奶牛 duck:鸭子 fish:鱼 bird:鸟 ant:蚂蚁 bee:蜜蜂 apple:苹果 ball:球 book:书 cup:杯子 hat:帽子 hand:手 eye:眼睛 nose:鼻子 ear:耳朵 bus:公交车 toy:玩具", "water:水 milk:牛奶 bread:面包 rice:米饭 cake:蛋糕 juice:果汁 chair:椅子 table:桌子 door:门 room:房间 school:学校 teacher:老师 mother:妈妈 father:爸爸 sister:姐妹 brother:兄弟 green:绿色 yellow:黄色 happy:开心的 small:小的 big:大的 jump:跳 run:跑 sing:唱歌 swim:游泳", "garden:花园 flower:花 grass:草 forest:森林 river:河流 ocean:海洋 mountain:山 rabbit:兔子 monkey:猴子 elephant:大象 giraffe:长颈鹿 orange:橙子 banana:香蕉 potato:土豆 tomato:番茄 breakfast:早餐 dinner:晚餐 kitchen:厨房 bedroom:卧室 window:窗户 morning:早晨 evening:傍晚 family:家庭 friend:朋友 weather:天气", "adventure:冒险 protect:保护 repair:修理 collect:收集 explore:探索 discover:发现 practice:练习 remember:记住 question:问题 answer:答案 different:不同的 important:重要的 careful:小心的 brave:勇敢的 healthy:健康的 gentle:温柔的 curious:好奇的 rainbow:彩虹 sunshine:阳光 thunder:雷声 butterfly:蝴蝶 vegetable:蔬菜 library:图书馆 tomorrow:明天 together:一起", "challenge:挑战 courage:勇气 knowledge:知识 imagination:想象力 environment:环境 responsibility:责任 opportunity:机会 communicate:交流 understand:理解 encourage:鼓励 cooperate:合作 celebrate:庆祝 investigate:调查 experiment:实验 creative:有创造力的 independent:独立的 confident:自信的 patient:有耐心的 generous:慷慨的 grateful:感激的 discover:发现 improve:改善 develop:发展 solution:解决办法 achievement:成就"].map(tier=>tier.split(" ").map(item=>{const [word,meaning]=item.split(":");return {word:word.toUpperCase(),meaning};}));
  const WORD_IPA={"cat": "kæt", "dog": "dɔɡ", "sun": "sʌn", "moon": "muːn", "egg": "eɡ", "red": "red", "blue": "bluː", "pig": "pɪɡ", "cow": "kaʊ", "duck": "dʌk", "fish": "fɪʃ", "bird": "bɝːd", "ant": "ænt", "bee": "biː", "apple": "ˈæpəl", "ball": "bɔːl", "book": "bʊk", "cup": "kʌp", "hat": "hæt", "hand": "hænd", "eye": "aɪ", "nose": "noʊz", "ear": "ɪr", "bus": "bʌs", "toy": "tɔɪ", "water": "ˈwɔːtər", "milk": "mɪlk", "bread": "bred", "rice": "raɪs", "cake": "keɪk", "juice": "dʒuːs", "chair": "tʃer", "table": "ˈteɪbəl", "door": "dɔːr", "room": "ruːm", "school": "skuːl", "teacher": "ˈtiːtʃər", "mother": "ˈmʌðər", "father": "ˈfɑːðər", "sister": "ˈsɪstər", "brother": "ˈbrʌðər", "green": "ɡriːn", "yellow": "ˈjeloʊ", "happy": "ˈhæpi", "small": "smɔːl", "big": "bɪɡ", "jump": "dʒʌmp", "run": "rʌn", "sing": "sɪŋ", "swim": "swɪm", "garden": "ˈɡɑːrdən", "flower": "ˈflaʊər", "grass": "ɡræs", "forest": "ˈfɔːrɪst", "river": "ˈrɪvər", "ocean": "ˈoʊʃən", "mountain": "ˈmaʊntən", "rabbit": "ˈræbɪt", "monkey": "ˈmʌŋki", "elephant": "ˈeləfənt", "giraffe": "dʒəˈræf", "orange": "ˈɔːrɪndʒ", "banana": "bəˈnænə", "potato": "pəˈteɪtoʊ", "tomato": "təˈmeɪtoʊ", "breakfast": "ˈbrekfəst", "dinner": "ˈdɪnər", "kitchen": "ˈkɪtʃən", "bedroom": "ˈbedruːm", "window": "ˈwɪndoʊ", "morning": "ˈmɔːrnɪŋ", "evening": "ˈiːvnɪŋ", "family": "ˈfæməli", "friend": "frend", "weather": "ˈweðər", "adventure": "ədˈventʃər", "protect": "prəˈtekt", "repair": "rɪˈper", "collect": "kəˈlekt", "explore": "ɪkˈsplɔːr", "discover": "dɪˈskʌvər", "practice": "ˈpræktɪs", "remember": "rɪˈmembər", "question": "ˈkwestʃən", "answer": "ˈænsər", "different": "ˈdɪfərənt", "important": "ɪmˈpɔːrtənt", "careful": "ˈkerfəl", "brave": "breɪv", "healthy": "ˈhelθi", "gentle": "ˈdʒentəl", "curious": "ˈkjʊriəs", "rainbow": "ˈreɪnboʊ", "sunshine": "ˈsʌnʃaɪn", "thunder": "ˈθʌndər", "butterfly": "ˈbʌtərflaɪ", "vegetable": "ˈvedʒtəbəl", "library": "ˈlaɪbreri", "tomorrow": "təˈmɑːroʊ", "together": "təˈɡeðər", "challenge": "ˈtʃælɪndʒ", "courage": "ˈkɝːɪdʒ", "knowledge": "ˈnɑːlɪdʒ", "imagination": "ɪˌmædʒəˈneɪʃən", "environment": "ɪnˈvaɪrənmənt", "responsibility": "rɪˌspɑːnsəˈbɪləti", "opportunity": "ˌɑːpərˈtuːnəti", "communicate": "kəˈmjuːnɪkeɪt", "understand": "ˌʌndərˈstænd", "encourage": "ɪnˈkɝːɪdʒ", "cooperate": "koʊˈɑːpəreɪt", "celebrate": "ˈseləbreɪt", "investigate": "ɪnˈvestɪɡeɪt", "experiment": "ɪkˈsperɪmənt", "creative": "kriˈeɪtɪv", "independent": "ˌɪndɪˈpendənt", "confident": "ˈkɑːnfɪdənt", "patient": "ˈpeɪʃənt", "generous": "ˈdʒenərəs", "grateful": "ˈɡreɪtfəl", "improve": "ɪmˈpruːv", "develop": "dɪˈveləp", "solution": "səˈluːʃən", "achievement": "əˈtʃiːvmənt"};
  for(const tier of ENGLISH_WORDS)for(const entry of tier)entry.ipa=WORD_IPA[entry.word.toLowerCase()];
  const ENGLISH_SENTENCES=[[["Hello", "你好"], ["Good morning", "早上好"], ["Thank you", "谢谢你"], ["See you", "再见"], ["I am happy", "我很开心"], ["My name is Sam", "我叫萨姆"], ["Nice to meet you", "很高兴认识你"], ["Please sit down", "请坐下"], ["Open the door", "打开门"], ["Come here", "到这里来"], ["You are kind", "你很友善"], ["We are friends", "我们是朋友"]], [["How are you", "你好吗"], ["I like apples", "我喜欢苹果"], ["This is my book", "这是我的书"], ["Please help me", "请帮帮我"], ["Can I have some water", "能给我一些水吗"], ["Where is my bag", "我的包在哪里"], ["Good night and sweet dreams", "晚安，祝你好梦"], ["Do you like milk", "你喜欢牛奶吗"], ["My favorite color is blue", "我最喜欢的颜色是蓝色"], ["Thank you for your help", "谢谢你的帮助"], ["See you tomorrow", "明天见"], ["Open your book please", "请打开你的书"]], [["What time is it", "现在几点了"], ["Could you say that again", "你能再说一遍吗"], ["I would like some juice", "我想要一些果汁"], ["How much is this", "这个多少钱"], ["Please speak slowly", "请说慢一点"], ["May I use the bathroom", "我可以用洗手间吗"], ["Do you want to play", "你想玩吗"], ["The weather is nice today", "今天天气很好"], ["Are you ready to go", "你准备好出发了吗"], ["We can take the bus", "我们可以坐公交车"], ["Turn left at the next street", "在下一条街左转"], ["See you after school", "放学后见"]], [["Could you show me the way", "你能给我指路吗"], ["I am looking for the library", "我正在找图书馆"], ["What would you like to eat", "你想吃什么"], ["Please tell me more about it", "请再多告诉我一些"], ["How long does it take", "这需要多长时间"], ["Do you have a smaller size", "你有小一点的尺码吗"], ["Thank you for inviting me", "谢谢你邀请我"], ["Would you like to join us", "你愿意加入我们吗"], ["My family enjoys cooking together", "我们家喜欢一起做饭"], ["Everyone needs a little help", "每个人都需要一点帮助"], ["Remember to bring your umbrella", "记得带上你的伞"], ["Take your time and try again", "慢慢来，再试一次"]], [["Could you explain what this means", "你能解释一下这是什么意思吗"], ["I would like to make a reservation", "我想预约"], ["Would you mind closing the window", "你介意关一下窗户吗"], ["Please let me know if you need help", "需要帮助时请告诉我"], ["How can I get to the nearest station", "我怎么去最近的车站"], ["Do you have any other suggestions", "你还有其他建议吗"], ["Thank you for being so patient", "谢谢你这么有耐心"], ["We should try to solve this together", "我们应该一起试着解决这件事"], ["It was a pleasure talking with you", "和你交谈很愉快"], ["Practice helps us become more confident", "练习帮助我们变得更自信"], ["Remember to take a break when you need one", "需要休息时记得休息一下"], ["Making mistakes is part of learning", "犯错是学习的一部分"]]].map(tier=>tier.map(([text,meaning])=>({text,meaning,word:text.toUpperCase()})));
  class GardenGame {
    constructor({ random = Math.random, emit = () => {} } = {}) {
      this.random = random; this.emit = emit; this.status = 'ready'; this.adaptive = true; this.auto = false; this.fireStrength = .3; this.maxSpellLength = 60; this.magicSlow = false;this.learningMode='letters';this.englishLevel=0;
      this.aim = { x: 690, y: 280 }; this.hero = { x: 100, y: 282 }; this.serial = 0;
      this.reset(); this.status = 'ready';
    }
    reset() {
      this.stacks = {}; this.offers = []; this.maxHealth = 8; this.healKills=0;
      this.flowerHealth=[];this.breachElapsed=0;this.health = 8; this.score = 0; this.kills = 0; this.casts = 0; this.correct = 0;
      this.wave = 1; this.spawned = 0; this.quota = 9; this.spawnIn = 2; this.waveBreak = 0;
      this.enemies = []; this.bullets = []; this.effects = []; this.dead = [];
      this.shooting = false; this.shotIn = 0; this.shotKick=0; this.time = 0; this.freeze = 0; this.combo = 0;
      this.typing = -1; this.activeTime = 0;
      this.skills = [
        { name:'彩虹激光', code:'A', typed:0, cd:0, duration:8, uses:0, icon:'🌈' },
        { name:'冰冻派对', code:'S', typed:0, cd:0, duration:12, uses:0, icon:'❄️' },
        { name:'西瓜轰轰', code:'D', typed:0, cd:0, duration:11, uses:0, icon:'🍉' }
      ];
    }
    get health(){return this.flowerHealth?.reduce((sum,h)=>sum+h,0)||0;}
    set health(value){
      const target=clamp(value,0,this.maxHealth),capacity=this.maxHealth/8;
      if(!this.flowerHealth||this.flowerHealth.length!==8)this.flowerHealth=Array(8).fill(0);
      let change=target-this.health;
      const order=Array.from({length:8},(_,i)=>i).sort((a,b)=>this.flowerHealth[a]-this.flowerHealth[b]);
      for(const i of order){
        const amount=change>=0?Math.min(change,Math.max(0,capacity-this.flowerHealth[i])):-Math.min(-change,this.flowerHealth[i]);
        this.flowerHealth[i]+=amount;change-=amount;
      }
      if(target>0)this.breachElapsed=0;
    }
    damageDefense(amount,y){
      const order=Array.from({length:8},(_,i)=>i).sort((a,b)=>Math.abs(110+a*48-y)-Math.abs(110+b*48-y));
      for(const i of order){const bite=Math.min(amount,this.flowerHealth[i]);if(bite<=0)continue;
        this.flowerHealth[i]-=bite;amount-=bite;this.emit('nibble',{x:155,y:110+i*48,removed:this.flowerHealth[i]<=0});if(amount<=0)break;
      }
      this.combo=0;this.emit('breach',{health:this.health});
    }
    start() {
      this.reset(); this.status = 'playing';
      if(this.learningMode!=='letters')for(let i=0;i<3;i++)this.skills[i].code=this.nextCode(i);
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
        boss:type==='boss',tough:type==='armor',hit:0,phase:this.random()*6.28,gait:this.random()*6.28,shield:type==='shield'?hp*.65:0,
        poison:0,poisonTime:0,chill:0,ability:3,slowTime:0,biteIn:.6,eating:false};
      this.enemies.push(z);if(count)this.spawned++;
      if(z.boss)this.emit('boss');return z;
    }
    setFireStrength(value) {
      const n=Number(value);if(!Number.isFinite(n))return;
      this.fireStrength=clamp(n,0,1);this.shotIn=0;
      if(this.fireStrength===0)this.bullets=[];
    }
    muzzle(){
      const target=this.target(),angle=Math.atan2(target.y-this.hero.y,target.x-this.hero.x);
      const tilt=clamp(angle*.15,-.10,.10),x=47.55,y=-22.02;
      return {x:this.hero.x+(this.shotKick>0?-3:0)+x*Math.cos(tilt)-y*Math.sin(tilt),y:this.hero.y+x*Math.sin(tilt)+y*Math.cos(tilt),tilt};
    }
    shoot() {
      if(this.fireStrength<=0)return;
      this.shotKick=.1;const target=this.target(),muzzle=this.muzzle(),angle=Math.atan2(target.y-muzzle.y,target.x-muzzle.x);
      const count=1+this.stack('multishot'),renderCount=Math.min(15,count);
      for(let i=0;i<renderCount;i++){
        const a=angle+(i-(renderCount-1)/2)*.06;
        this.bullets.push({x:muzzle.x,y:muzzle.y,px:muzzle.x,py:muzzle.y,vx:Math.cos(a)*720,vy:Math.sin(a)*720,life:2.5,
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
      this.wave++;this.spawned=0;this.quota=9+(this.wave-1)*4+Math.floor((this.wave-1)/5)*3;this.spawnIn=.7;this.waveBreak=0;this.offers=[];this.status='playing';
      for(const s of this.skills)s.cd=Math.max(0,s.cd-3);
      this.emit('wave',{wave:this.wave});return true;
    }
    setMaxSpellLength(value) { const n=Number(value);if(Number.isFinite(n))this.maxSpellLength=clamp(Math.floor(n),1,60); }
    get typingSlow() { return this.magicSlow&&this.typing>=0&&this.skills[this.typing].typed>0; }
    get spellLength() { return this.adaptive?Math.min(this.maxSpellLength,this.wave<=4?this.wave:4+(this.wave-4)*2):1; }
    get rechargeRate() { return (1+.16*(this.wave-1))*(1+.2*this.stack('recharge')); }
    nextCode(index) {
      if(this.learningMode==='english'||this.learningMode==='sentences'){
        const others=this.skills.filter((_,i)=>i!==index).map(s=>s.code[0]);
        const bank=this.learningMode==='sentences'?ENGLISH_SENTENCES:ENGLISH_WORDS;
        const tier=bank[this.englishLevel]||bank[0];
        const pool=tier.filter(entry=>!others.includes(entry.word[0])&&entry.word!==this.skills[index].code);
        const candidates=pool.length?pool:tier;
        return candidates[Math.floor(this.random()*candidates.length)].word;
      }
      const base=['A','S','D'][index];
      if(!this.adaptive || this.wave===1)return base;
      const choices=this.wave<5?['FJKL','AJKL','FJKL'][index]:'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let code=base;
      for(let i=1;i<this.spellLength;i++)code+=choices[Math.floor(this.random()*choices.length)];
      return code;
    }
    select(index) {
      if(this.status!=='playing')return;
      if(this.skills[index].cd>0){this.emit('cooldown',{index});return;}
      if(this.typing!==index){ if(this.typing>=0)this.skills[this.typing].typed=0;this.typing=index; }
      this.emit('typing',{index});
    }
    input(key) {
      if(this.status!=='playing'||!((/^[a-z]$/i).test(key)||(key===' '&&this.learningMode==='sentences')))return false;
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
      const worldDt=dt*(this.typingSlow?.22:1);
      for(let i=0;i<this.skills.length;i++){
        const s=this.skills[i];if(s.cd>0){s.cd=Math.max(0,s.cd-dt*this.rechargeRate);if(s.cd===0){s.code=this.nextCode(i);this.emit('ready',{index:i});}}
      }
      this.freeze=Math.max(0,this.freeze-worldDt);
      this.shotKick=Math.max(0,(this.shotKick||0)-dt);this.shotIn-=dt;
      if(this.fireStrength>0&&(this.shooting||this.auto)&&this.shotIn<=0){this.shoot();this.shotIn=Math.max(.025,.15/(this.fireStrength*(1+.18*this.stack('rapid'))));}
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
          const movementDt=worldDt*(z.slowTime>0?1-z.chill:1);
          const cadence=z.type==='runner'||z.type==='mini'?6.3:z.boss?2.25:3.35;
          z.eating=z.x<=195&&this.health>0;
          if(z.eating){
            z.biteIn=(z.biteIn??.6)-worldDt;
            if(z.biteIn<=0){z.biteIn=.3;this.damageDefense(z.boss?.75:.25,z.y);}
          }else{z.gait+=movementDt*cadence;z.x-=z.speed*movementDt*(1+.38*Math.sin(z.gait));}
          z.ability-=worldDt;
          if(z.type==='healer'&&z.ability<=0){z.ability=3;for(const other of this.enemies)if(other.hp>0&&other.id!==z.id&&Math.hypot(other.x-z.x,other.y-z.y)<190)other.hp=Math.min(other.maxHp,other.hp+other.maxHp*.1);this.emit('heal',{x:z.x,y:z.y});}
          if(z.boss&&z.ability<=0&&this.enemies.length<80){z.ability=9;this.spawn(z.x+40,clamp(z.y+45,100,455),'runner',false);}
          if(z.type==='bomber'&&z.x<=195){z.hp=0;this.damageDefense(2,z.y);this.emit('explosion',{x:z.x,y:z.y});this.emit('breach',{health:this.health});continue;}
        }
        if(z.x<75)z.x=75;
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
      if(this.health<=0){this.breachElapsed+=worldDt;if(this.breachElapsed>=3){this.finish(false);return;}}else this.breachElapsed=0;
      if(this.spawned<this.quota){
        this.spawnIn-=worldDt;if(this.spawnIn<=0&&this.enemies.length<100){this.spawn();this.spawnIn=Math.max(.28,2.1*Math.pow(.88,this.wave-1));}
      } else if(this.enemies.length===0){
        this.offerCards();
      }
    }
  }
  root.ENGLISH_SENTENCES=ENGLISH_SENTENCES;root.ENGLISH_WORDS=ENGLISH_WORDS;root.GardenGame=GardenGame;root.GARDEN_CARDS=CARDS;root.ZOMBIE_TYPES=TYPES;
  if(typeof module!=='undefined'&&module.exports)module.exports={GardenGame,CARDS,TYPES,ENGLISH_WORDS,ENGLISH_SENTENCES};
})(typeof globalThis!=='undefined'?globalThis:this);
