/* Rendering-independent game rules; shared by the browser and Node checks. */
(function (root) {
  'use strict';
  const CUSTOM=typeof module!=='undefined'&&module.exports?require('./custom-library.js'):root.GuluCustomLibrary;
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
  // Legacy words remain readable in existing browser saves. New prompts use the curriculum bank.
  const LEGACY_ENGLISH_WORDS=[
    "cat:猫 dog:狗 sun:太阳 moon:月亮 egg:鸡蛋 red:红色 blue:蓝色 pig:猪 cow:奶牛 duck:鸭子 fish:鱼 bird:鸟 ant:蚂蚁 bee:蜜蜂 apple:苹果 ball:球 book:书 cup:杯子 hat:帽子 hand:手 eye:眼睛 nose:鼻子 ear:耳朵 bus:公交车 toy:玩具 box:盒子 car:汽车 bed:床 pen:钢笔 map:地图 key:钥匙 leg:腿 fox:狐狸 star:星星 tree:树",
    "water:水 milk:牛奶 bread:面包 rice:米饭 cake:蛋糕 juice:果汁 chair:椅子 table:桌子 door:门 room:房间 school:学校 teacher:老师 mother:妈妈 father:爸爸 sister:姐妹 brother:兄弟 green:绿色 yellow:黄色 happy:开心的 small:小的 big:大的 jump:跳 run:跑 sing:唱歌 swim:游泳 lunch:午餐 plate:盘子 spoon:勺子 shoes:鞋子 clock:时钟 clean:清洁 read:阅读 write:书写 smile:微笑 sleep:睡觉",
    "garden:花园 flower:花 grass:草 forest:森林 river:河流 ocean:海洋 mountain:山 rabbit:兔子 monkey:猴子 elephant:大象 giraffe:长颈鹿 orange:橙子 banana:香蕉 potato:土豆 tomato:番茄 breakfast:早餐 dinner:晚餐 kitchen:厨房 bedroom:卧室 window:窗户 morning:早晨 evening:傍晚 family:家庭 friend:朋友 weather:天气 airport:机场 beach:海滩 market:市场 doctor:医生 bicycle:自行车 cloudy:多云的 hungry:饥饿的 listen:倾听 visit:参观 weekend:周末",
    "adventure:冒险 protect:保护 repair:修理 collect:收集 explore:探索 discover:发现 practice:练习 remember:记住 question:问题 answer:答案 different:不同的 important:重要的 careful:小心的 brave:勇敢的 healthy:健康的 gentle:温柔的 curious:好奇的 rainbow:彩虹 sunshine:阳光 thunder:雷声 butterfly:蝴蝶 vegetable:蔬菜 library:图书馆 tomorrow:明天 together:一起 arrive:到达 borrow:借用 choose:选择 explain:解释 favorite:最喜欢的 helpful:有帮助的 journey:旅程 message:消息 special:特别的 surprise:惊喜",
    "challenge:挑战 courage:勇气 knowledge:知识 imagination:想象力 environment:环境 responsibility:责任 opportunity:机会 communicate:交流 understand:理解 encourage:鼓励 cooperate:合作 celebrate:庆祝 investigate:调查 experiment:实验 creative:有创造力的 independent:独立的 confident:自信的 patient:有耐心的 generous:慷慨的 grateful:感激的 improve:改善 develop:发展 solution:解决办法 achievement:成就 decision:决定 education:教育 experience:经历 possible:可能的 prepare:准备 recommend:推荐 respect:尊重 successful:成功的 tradition:传统 volunteer:志愿者 community:社区"
  ].map(tier=>tier.split(" ").map(item=>{const [word,meaning]=item.split(":");return {word:word.toUpperCase(),meaning};}));
  const WORD_IPA={"cat": "kæt", "dog": "dɔɡ", "sun": "sʌn", "moon": "muːn", "egg": "eɡ", "red": "red", "blue": "bluː", "pig": "pɪɡ", "cow": "kaʊ", "duck": "dʌk", "fish": "fɪʃ", "bird": "bɝːd", "ant": "ænt", "bee": "biː", "apple": "ˈæpəl", "ball": "bɔːl", "book": "bʊk", "cup": "kʌp", "hat": "hæt", "hand": "hænd", "eye": "aɪ", "nose": "noʊz", "ear": "ɪr", "bus": "bʌs", "toy": "tɔɪ", "water": "ˈwɔːtər", "milk": "mɪlk", "bread": "bred", "rice": "raɪs", "cake": "keɪk", "juice": "dʒuːs", "chair": "tʃer", "table": "ˈteɪbəl", "door": "dɔːr", "room": "ruːm", "school": "skuːl", "teacher": "ˈtiːtʃər", "mother": "ˈmʌðər", "father": "ˈfɑːðər", "sister": "ˈsɪstər", "brother": "ˈbrʌðər", "green": "ɡriːn", "yellow": "ˈjeloʊ", "happy": "ˈhæpi", "small": "smɔːl", "big": "bɪɡ", "jump": "dʒʌmp", "run": "rʌn", "sing": "sɪŋ", "swim": "swɪm", "garden": "ˈɡɑːrdən", "flower": "ˈflaʊər", "grass": "ɡræs", "forest": "ˈfɔːrɪst", "river": "ˈrɪvər", "ocean": "ˈoʊʃən", "mountain": "ˈmaʊntən", "rabbit": "ˈræbɪt", "monkey": "ˈmʌŋki", "elephant": "ˈeləfənt", "giraffe": "dʒəˈræf", "orange": "ˈɔːrɪndʒ", "banana": "bəˈnænə", "potato": "pəˈteɪtoʊ", "tomato": "təˈmeɪtoʊ", "breakfast": "ˈbrekfəst", "dinner": "ˈdɪnər", "kitchen": "ˈkɪtʃən", "bedroom": "ˈbedruːm", "window": "ˈwɪndoʊ", "morning": "ˈmɔːrnɪŋ", "evening": "ˈiːvnɪŋ", "family": "ˈfæməli", "friend": "frend", "weather": "ˈweðər", "adventure": "ədˈventʃər", "protect": "prəˈtekt", "repair": "rɪˈper", "collect": "kəˈlekt", "explore": "ɪkˈsplɔːr", "discover": "dɪˈskʌvər", "practice": "ˈpræktɪs", "remember": "rɪˈmembər", "question": "ˈkwestʃən", "answer": "ˈænsər", "different": "ˈdɪfərənt", "important": "ɪmˈpɔːrtənt", "careful": "ˈkerfəl", "brave": "breɪv", "healthy": "ˈhelθi", "gentle": "ˈdʒentəl", "curious": "ˈkjʊriəs", "rainbow": "ˈreɪnboʊ", "sunshine": "ˈsʌnʃaɪn", "thunder": "ˈθʌndər", "butterfly": "ˈbʌtərflaɪ", "vegetable": "ˈvedʒtəbəl", "library": "ˈlaɪbreri", "tomorrow": "təˈmɑːroʊ", "together": "təˈɡeðər", "challenge": "ˈtʃælɪndʒ", "courage": "ˈkɝːɪdʒ", "knowledge": "ˈnɑːlɪdʒ", "imagination": "ɪˌmædʒəˈneɪʃən", "environment": "ɪnˈvaɪrənmənt", "responsibility": "rɪˌspɑːnsəˈbɪləti", "opportunity": "ˌɑːpərˈtuːnəti", "communicate": "kəˈmjuːnɪkeɪt", "understand": "ˌʌndərˈstænd", "encourage": "ɪnˈkɝːɪdʒ", "cooperate": "koʊˈɑːpəreɪt", "celebrate": "ˈseləbreɪt", "investigate": "ɪnˈvestɪɡeɪt", "experiment": "ɪkˈsperɪmənt", "creative": "kriˈeɪtɪv", "independent": "ˌɪndɪˈpendənt", "confident": "ˈkɑːnfɪdənt", "patient": "ˈpeɪʃənt", "generous": "ˈdʒenərəs", "grateful": "ˈɡreɪtfəl", "improve": "ɪmˈpruːv", "develop": "dɪˈveləp", "solution": "səˈluːʃən", "achievement": "əˈtʃiːvmənt", "box":"bɑːks", "car":"kɑːr", "bed":"bed", "pen":"pen", "map":"mæp", "key":"kiː", "leg":"leɡ", "fox":"fɑːks", "star":"stɑːr", "tree":"triː", "lunch":"lʌntʃ", "plate":"pleɪt", "spoon":"spuːn", "shoes":"ʃuːz", "clock":"klɑːk", "clean":"kliːn", "read":"riːd", "write":"raɪt", "smile":"smaɪl", "sleep":"sliːp", "airport":"ˈerpɔːrt", "beach":"biːtʃ", "market":"ˈmɑːrkɪt", "doctor":"ˈdɑːktər", "bicycle":"ˈbaɪsɪkəl", "cloudy":"ˈklaʊdi", "hungry":"ˈhʌŋɡri", "listen":"ˈlɪsən", "visit":"ˈvɪzɪt", "weekend":"ˈwiːkend", "arrive":"əˈraɪv", "borrow":"ˈbɑːroʊ", "choose":"tʃuːz", "explain":"ɪkˈspleɪn", "favorite":"ˈfeɪvərɪt", "helpful":"ˈhelpfəl", "journey":"ˈdʒɝːni", "message":"ˈmesɪdʒ", "special":"ˈspeʃəl", "surprise":"sərˈpraɪz", "decision":"dɪˈsɪʒən", "education":"ˌedʒəˈkeɪʃən", "experience":"ɪkˈspɪriəns", "possible":"ˈpɑːsəbəl", "prepare":"prɪˈper", "recommend":"ˌrekəˈmend", "respect":"rɪˈspekt", "successful":"səkˈsesfəl", "tradition":"trəˈdɪʃən", "volunteer":"ˌvɑːlənˈtɪr", "community":"kəˈmjuːnəti"};
  for(const tier of LEGACY_ENGLISH_WORDS)for(const entry of tier)entry.ipa=WORD_IPA[entry.word.toLowerCase()];
  // Original, curriculum-themed supplements. These are not copied textbook
  // passages: they broaden the same school, family, nature and society topics.
  const MORE_WORDS=[
    [['desk','书桌','desk'],['pencil','铅笔','ˈpensəl'],['paper','纸','ˈpeɪpər'],['ruler','尺子','ˈruːlər'],['bag','书包','bæɡ'],['coat','外套','koʊt'],['face','脸','feɪs'],['foot','脚','fʊt'],['hair','头发','her'],['mouse','老鼠','maʊs'],['horse','马','hɔːrs'],['sheep','绵羊','ʃiːp'],['rain','雨','reɪn'],['snow','雪','snoʊ'],['wind','风','wɪnd']],
    [['class','班级','klæs'],['lesson','课程','ˈlesən'],['homework','家庭作业','ˈhoʊmwɝːk'],['picture','图片','ˈpɪktʃər'],['music','音乐','ˈmjuːzɪk'],['sport','运动','spɔːrt'],['fruit','水果','fruːt'],['soup','汤','suːp'],['bottle','瓶子','ˈbɑːtəl'],['wash','洗','wɑːʃ'],['cook','烹饪','kʊk'],['dance','跳舞','dæns'],['laugh','笑','læf'],['carry','携带','ˈkæri'],['draw','画画','drɔː']],
    [['station','车站','ˈsteɪʃən'],['museum','博物馆','mjuˈziːəm'],['hospital','医院','ˈhɑːspɪtəl'],['restaurant','餐馆','ˈrestərɑːnt'],['village','村庄','ˈvɪlɪdʒ'],['country','国家','ˈkʌntri'],['season','季节','ˈsiːzən'],['autumn','秋天','ˈɔːtəm'],['winter','冬天','ˈwɪntər'],['excited','兴奋的','ɪkˈsaɪtɪd'],['worried','担心的','ˈwɝːid'],['quiet','安静的','ˈkwaɪət'],['invite','邀请','ɪnˈvaɪt'],['travel','旅行','ˈtrævəl'],['finish','完成','ˈfɪnɪʃ']],
    [['project','项目','ˈprɑːdʒekt'],['subject','学科','ˈsʌbdʒɪkt'],['language','语言','ˈlæŋɡwɪdʒ'],['history','历史','ˈhɪstəri'],['science','科学','ˈsaɪəns'],['traffic','交通','ˈtræfɪk'],['direction','方向','dəˈrekʃən'],['ticket','票','ˈtɪkɪt'],['information','信息','ˌɪnfərˈmeɪʃən'],['delicious','美味的','dɪˈlɪʃəs'],['comfortable','舒适的','ˈkʌmftərbəl'],['agree','同意','əˈɡriː'],['decide','决定','dɪˈsaɪd'],['organize','组织','ˈɔːrɡənaɪz'],['share','分享','ʃer']],
    [['culture','文化','ˈkʌltʃər'],['society','社会','səˈsaɪəti'],['technology','科技','tekˈnɑːlədʒi'],['energy','能源','ˈenərdʒi'],['climate','气候','ˈklaɪmət'],['population','人口','ˌpɑːpjəˈleɪʃən'],['relationship','关系','rɪˈleɪʃənʃɪp'],['communication','交流','kəˌmjuːnɪˈkeɪʃən'],['development','发展','dɪˈveləpmənt'],['discussion','讨论','dɪˈskʌʃən'],['opinion','观点','əˈpɪnjən'],['advantage','优势','ədˈvæntɪdʒ'],['compare','比较','kəmˈper'],['influence','影响','ˈɪnfluəns'],['achieve','实现','əˈtʃiːv']]
  ];
  MORE_WORDS.forEach((tier,level)=>tier.forEach(([word,meaning,ipa])=>LEGACY_ENGLISH_WORDS[level].push({word:word.toUpperCase(),meaning,ipa})));
  const VOCABULARY=typeof module!=='undefined'&&module.exports?require('./vocabulary.js'):root.GuluVocabulary;
  const ENGLISH_WORDS=VOCABULARY.tiers;
  const WORD_LOOKUP=new Map([...LEGACY_ENGLISH_WORDS.flat(),...VOCABULARY.entries].map(e=>[e.word,e]));
  const findWordEntry=code=>WORD_LOOKUP.get(code);
  const ENGLISH_SENTENCES=[[["Hello", "你好"], ["Good morning", "早上好"], ["Thank you", "谢谢你"], ["See you", "再见"], ["I am happy", "我很开心"], ["My name is Sam", "我叫萨姆"], ["Nice to meet you", "很高兴认识你"], ["Please sit down", "请坐下"], ["Open the door", "打开门"], ["Come here", "到这里来"], ["You are kind", "你很友善"], ["We are friends", "我们是朋友"]], [["How are you", "你好吗"], ["I like apples", "我喜欢苹果"], ["This is my book", "这是我的书"], ["Please help me", "请帮帮我"], ["Can I have some water", "能给我一些水吗"], ["Where is my bag", "我的包在哪里"], ["Good night and sweet dreams", "晚安，祝你好梦"], ["Do you like milk", "你喜欢牛奶吗"], ["My favorite color is blue", "我最喜欢的颜色是蓝色"], ["Thank you for your help", "谢谢你的帮助"], ["See you tomorrow", "明天见"], ["Open your book please", "请打开你的书"]], [["What time is it", "现在几点了"], ["Could you say that again", "你能再说一遍吗"], ["I would like some juice", "我想要一些果汁"], ["How much is this", "这个多少钱"], ["Please speak slowly", "请说慢一点"], ["May I use the bathroom", "我可以用洗手间吗"], ["Do you want to play", "你想玩吗"], ["The weather is nice today", "今天天气很好"], ["Are you ready to go", "你准备好出发了吗"], ["We can take the bus", "我们可以坐公交车"], ["Turn left at the next street", "在下一条街左转"], ["See you after school", "放学后见"]], [["Could you show me the way", "你能给我指路吗"], ["I am looking for the library", "我正在找图书馆"], ["What would you like to eat", "你想吃什么"], ["Please tell me more about it", "请再多告诉我一些"], ["How long does it take", "这需要多长时间"], ["Do you have a smaller size", "你有小一点的尺码吗"], ["Thank you for inviting me", "谢谢你邀请我"], ["Would you like to join us", "你愿意加入我们吗"], ["My family enjoys cooking together", "我们家喜欢一起做饭"], ["Everyone needs a little help", "每个人都需要一点帮助"], ["Remember to bring your umbrella", "记得带上你的伞"], ["Take your time and try again", "慢慢来，再试一次"]], [["Could you explain what this means", "你能解释一下这是什么意思吗"], ["I would like to make a reservation", "我想预约"], ["Would you mind closing the window", "你介意关一下窗户吗"], ["Please let me know if you need help", "需要帮助时请告诉我"], ["How can I get to the nearest station", "我怎么去最近的车站"], ["Do you have any other suggestions", "你还有其他建议吗"], ["Thank you for being so patient", "谢谢你这么有耐心"], ["We should try to solve this together", "我们应该一起试着解决这件事"], ["It was a pleasure talking with you", "和你交谈很愉快"], ["Practice helps us become more confident", "练习帮助我们变得更自信"], ["Remember to take a break when you need one", "需要休息时记得休息一下"], ["Making mistakes is part of learning", "犯错是学习的一部分"]]].map(tier=>tier.map(([text,meaning])=>({text,meaning,word:text.toUpperCase()})));
  // Each entry is a tiny conversation. Later waves ask for a longer, coherent
  // prefix instead of merely swapping in an unrelated longer sentence.
  const LEGACY_CONTEXTS=[
    [[['Hello','你好'],['My name is Sam','我叫萨姆'],['Nice to meet you','很高兴认识你']],[['Good morning','早上好'],['How are you','你好吗'],['I am happy','我很开心']],[['Please sit down','请坐下'],['Open your book please','请打开你的书'],['Thank you','谢谢你']]],
    [[['Where is my bag','我的包在哪里'],['This is my bag','这是我的书包'],['Thank you for your help','谢谢你的帮助']],[['Do you like milk','你喜欢牛奶吗'],['I like apples','我喜欢苹果'],['Can I have some water','能给我一些水吗']],[['Good night and sweet dreams','晚安，祝你好梦'],['See you tomorrow','明天见'],['See you','再见']]],
    [[['What time is it','现在几点了'],['Are you ready to go','你准备好出发了吗'],['We can take the bus','我们可以坐公交车']],[['Do you want to play','你想玩吗'],['The weather is nice today','今天天气很好'],['See you after school','放学后见']],[['Could you say that again','你能再说一遍吗'],['Please speak slowly','请说慢一点'],['Thank you','谢谢你']]],
    [[['Could you show me the way','你能给我指路吗'],['I am looking for the library','我正在找图书馆'],['Thank you for your help','谢谢你的帮助']],[['What would you like to eat','你想吃什么'],['My family enjoys cooking together','我们家喜欢一起做饭'],['Thank you for inviting me','谢谢你邀请我']],[['Take your time and try again','慢慢来，再试一次'],['Everyone needs a little help','每个人都需要一点帮助'],['Would you like to join us','你愿意加入我们吗']]],
    [[['I would like to make a reservation','我想预约'],['Do you have any other suggestions','你还有其他建议吗'],['Thank you for being so patient','谢谢你这么有耐心']],[['Could you explain what this means','你能解释一下这是什么意思吗'],['We should try to solve this together','我们应该一起试着解决这件事'],['Making mistakes is part of learning','犯错是学习的一部分']],[['Please let me know if you need help','需要帮助时请告诉我'],['Practice helps us become more confident','练习帮助我们变得更自信'],['It was a pleasure talking with you','和你交谈很愉快']]]
  ].map(tier=>tier.map(context=>context.map(([text,meaning])=>({text,meaning,word:text.toUpperCase()}))));
  // A broad rotation keeps repeated runs from turning into memorising the same
  // three prompts. Each group remains a self-contained three-line exchange.
  const EXTRA_CONTEXTS=[
    [[['What is this','这是什么'],['It is a red ball','这是一个红色的球'],['Let us play','我们一起玩吧']],[['I see a cat','我看见一只猫'],['The cat is small','这只猫很小'],['It is very cute','它非常可爱']],[['This is my mother','这是我的妈妈'],['Hello Mrs Lee','李太太您好'],['Welcome to our home','欢迎来我家']],[['I have a blue cup','我有一个蓝色杯子'],['May I see it','我可以看看吗'],['Here you are','给你']],[['The sun is up','太阳升起来了'],['It is a nice day','今天天气很好'],['Let us go outside','我们出去吧']]],
    [[['Are you hungry','你饿了吗'],['I would like some bread','我想吃一些面包'],['Here is your lunch','这是你的午餐']],[['Where is the teacher','老师在哪里'],['She is in the classroom','她在教室里'],['Let us find her','我们去找她吧']],[['Can you swim','你会游泳吗'],['Yes I can swim','是的，我会游泳'],['Let us go to the pool','我们去游泳池吧']],[['Your room is clean','你的房间很干净'],['I put away my toys','我收好了玩具'],['You did a good job','你做得很好']],[['What are you reading','你在读什么'],['I am reading a story','我在读一个故事'],['It is very funny','它非常有趣']]],
    [[['Where are you going','你要去哪里'],['I am going to the market','我要去市场'],['I will come with you','我和你一起去']],[['The sky is cloudy','天空多云'],['Should we take an umbrella','我们要带伞吗'],['Yes that is a good idea','好，这是个好主意']],[['I do not feel well','我感觉不舒服'],['Let us visit the doctor','我们去看医生吧'],['Thank you for coming with me','谢谢你陪我去']],[['What will you do this weekend','这个周末你要做什么'],['I will ride my bicycle','我要骑自行车'],['Please remember your helmet','请记得戴头盔']],[['Have you seen my keys','你看到我的钥匙了吗'],['They are beside the window','它们在窗户旁边'],['Now we can leave','现在我们可以出发了']]],
    [[['When will the bus arrive','公交车什么时候到'],['It should arrive in ten minutes','应该十分钟后到'],['We have time for breakfast','我们还有时间吃早餐']],[['May I borrow this book','我可以借这本书吗'],['Please return it next week','请下周归还'],['I will take good care of it','我会好好保管它']],[['Which meal would you choose','你会选择哪份餐点'],['The vegetable soup is my favorite','蔬菜汤是我的最爱'],['I would like to try it too','我也想尝尝']],[['I received your message','我收到你的消息了'],['Thanks for answering so quickly','谢谢你这么快回复'],['I am happy I could help','能帮上忙我很开心']],[['How was your journey','你的旅程怎么样'],['We saw a beautiful rainbow','我们看到了美丽的彩虹'],['That sounds very special','听起来很特别']]],
    [[['How should we prepare for the project','我们该如何准备这个项目'],['We can divide the work fairly','我们可以公平地分工'],['Then everyone can contribute','这样每个人都能参与']],[['Would you recommend this course','你会推荐这门课程吗'],['It was a valuable experience','这是一次宝贵的经历'],['I learned to work independently','我学会了独立工作']],[['We need to make a decision','我们需要做个决定'],['Let us consider every possibility','让我们考虑每种可能性'],['I respect your point of view','我尊重你的观点']],[['Why do you want to volunteer','你为什么想做志愿者'],['I want to protect the environment','我想保护环境'],['Small actions can bring change','小行动也能带来改变']],[['How do you celebrate this tradition','你们如何庆祝这个传统'],['Our family cooks dinner together','我们全家一起做晚餐'],['Sharing the work makes it meaningful','一起劳动让它更有意义']]]
  ];
  EXTRA_CONTEXTS.forEach((tier,level)=>LEGACY_CONTEXTS[level].push(...tier.map(context=>context.map(([text,meaning])=>({text,meaning,word:text.toUpperCase()})))));
  const CONTEXT_TOPICS=[
    [['kite','风筝'],['rabbit','兔子'],['storybook','故事书'],['yellow flower','黄色的花'],['little boat','小船'],['school bag','书包'],['green tree','绿树'],['toy train','玩具火车']],
    [['art lesson','美术课'],['football game','足球比赛'],['birthday party','生日聚会'],['school lunch','学校午餐'],['music club','音乐社团'],['family picnic','家庭野餐'],['swimming class','游泳课'],['weekend film','周末电影']],
    [['science museum','科学博物馆'],['train station','火车站'],['city library','市图书馆'],['vegetable market','菜市场'],['sports centre','体育中心'],['nature park','自然公园'],['local hospital','当地医院'],['summer camp','夏令营']],
    [['group project','小组项目'],['school festival','校园节'],['class debate','班级辩论'],['travel plan','旅行计划'],['book report','读书报告'],['volunteer day','志愿者日'],['science experiment','科学实验'],['sports meeting','运动会']],
    [['renewable energy','可再生能源'],['online education','在线教育'],['cultural exchange','文化交流'],['public transport','公共交通'],['wildlife protection','野生动物保护'],['community service','社区服务'],['healthy lifestyles','健康生活方式'],['artificial intelligence','人工智能']]
  ];
  function generatedContexts(level,[topic,meaning]){
    const sets=[
      [[`I see a ${topic}`,`我看见一个${meaning}`],[`Do you like the ${topic}`,`你喜欢这个${meaning}吗`],[`Yes it is nice`,`是的，它很好`]],
      [[`Here is my ${topic}`,`这是我的${meaning}`],[`May I look at it`,`我可以看看吗`],[`Yes here you are`,`可以，给你`]],
      [[`Where is the ${topic}`,`${meaning}在哪里`],[`It is over there`,`它在那边`],[`Let us go and see`,`我们去看看吧`]],
      [[`This ${topic} is new`,`这个${meaning}是新的`],[`It looks very good`,`它看起来很好`],[`We can use it together`,`我们可以一起用它`]],

      [[`Are you ready for the ${topic}`,`你准备好参加${meaning}了吗`],[`I need five more minutes`,`我还需要五分钟`],[`I will wait by the door`,`我会在门口等你`]],
      [[`How was the ${topic}`,`${meaning}怎么样`],[`It was interesting and fun`,`它既有趣又好玩`],[`I want to go again`,`我还想再去`]],
      [[`What do we need for the ${topic}`,`${meaning}需要什么`],[`Please bring water and a hat`,`请带上水和帽子`],[`I will pack them now`,`我现在就收好`]],
      [[`When does the ${topic} begin`,`${meaning}什么时候开始`],[`It begins after lunch`,`午饭后开始`],[`Let us meet at school`,`我们在学校见吧`]],

      [[`Could you take me to the ${topic}`,`你能带我去${meaning}吗`],[`We can walk there together`,`我们可以一起走过去`],[`Please show me the shortest way`,`请带我走最近的路`]],
      [[`What can we do at the ${topic}`,`我们能在${meaning}做什么`],[`There are many things to explore`,`那里有很多事物可以探索`],[`Let us make a plan first`,`我们先做个计划吧`]],
      [[`Have you visited the ${topic}`,`你去过${meaning}吗`],[`I went there last weekend`,`我上周末去过`],[`I learned something new there`,`我在那里学到了新知识`]],
      [[`How long does it take to reach the ${topic}`,`到${meaning}需要多久`],[`It takes about twenty minutes`,`大约需要二十分钟`],[`We should leave before nine`,`我们应该九点前出发`]],

      [[`How is our ${topic} going`,`我们的${meaning}进展如何`],[`Everyone has finished one part`,`每个人都完成了一部分`],[`Let us check the details together`,`让我们一起检查细节`]],
      [[`Can you help organize the ${topic}`,`你能帮忙组织${meaning}吗`],[`I can prepare a list of tasks`,`我可以准备任务清单`],[`That will help the whole team`,`那会对整个团队有帮助`]],
      [[`What did you learn from the ${topic}`,`你从${meaning}中学到了什么`],[`I learned to listen to others`,`我学会了倾听别人`],[`Their ideas improved my work`,`他们的想法改进了我的工作`]],
      [[`We need one more idea for the ${topic}`,`我们的${meaning}还需要一个点子`],[`Why not ask the whole class`,`为什么不问问全班呢`],[`Different opinions may inspire us`,`不同观点可能会启发我们`]],

      [[`Why is ${topic} important`,`为什么${meaning}很重要`],[`It affects our lives in many ways`,`它在许多方面影响我们的生活`],[`We should examine the evidence carefully`,`我们应该认真研究证据`]],
      [[`What is your opinion of ${topic}`,`你对${meaning}有什么看法`],[`It offers benefits as well as challenges`,`它既带来益处也带来挑战`],[`A balanced discussion can help us decide`,`充分讨论能帮助我们作决定`]],
      [[`How might ${topic} change in the future`,`${meaning}未来可能如何变化`],[`New ideas are already creating opportunities`,`新想法已经在创造机会`],[`We must also consider their social influence`,`我们也必须考虑其社会影响`]],
      [[`Our class is researching ${topic}`,`我们班正在研究${meaning}`],[`We compared information from several sources`,`我们比较了多个来源的信息`],[`Now we can present a responsible conclusion`,`现在我们可以给出负责任的结论`]]
    ];
    return sets.slice(level*4,level*4+4).map(context=>context.map(([text,translation])=>({text,meaning:translation,word:text.toUpperCase()})));
  }
  CONTEXT_TOPICS.forEach((topics,level)=>topics.forEach(topic=>LEGACY_CONTEXTS[level].push(...generatedContexts(level,topic))));
  const DIALOGUES=typeof module!=='undefined'&&module.exports?require('./dialogues.js'):root.GuluDialogues;
  const ENGLISH_CONTEXTS=DIALOGUES.tiers.map(tier=>tier.map(record=>record.lines));
  function contextEntry(level,contextIndex,count){
    const record=DIALOGUES.tiers[level]?.[contextIndex]||DIALOGUES.tiers[0][0],chosen=record.lines.slice(0,count);
    return {text:chosen.map(x=>x.text).join(' / '),meaning:chosen.map(x=>x.meaning).join(' / '),word:chosen.map(x=>x.word).join(' '),scene:record.scene,goal:record.goal,grammar:record.grammar,reference:record.reference,dialogueId:record.id};
  }
  const SENTENCE_LOOKUP=new Map(ENGLISH_SENTENCES.flat().map(e=>[e.word,e]));
  for(const tier of LEGACY_CONTEXTS)for(const lines of tier)for(let count=1;count<=3;count++){
    const chosen=lines.slice(0,count),entry={text:chosen.map(x=>x.text).join(' / '),meaning:chosen.map(x=>x.meaning).join(' / '),word:chosen.map(x=>x.word).join(' ')};SENTENCE_LOOKUP.set(entry.word,entry);
  }
  for(let level=0;level<5;level++)for(let i=0;i<ENGLISH_CONTEXTS[level].length;i++)for(let count=1;count<=3;count++){const entry=contextEntry(level,i,count);SENTENCE_LOOKUP.set(entry.word,entry);}
  function sentenceEntry(code){return SENTENCE_LOOKUP.get(code);}
  class GardenGame {
    constructor({ random = Math.random, emit = () => {} } = {}) {
      this.random = random; this.emit = emit; this.status = 'ready'; this.adaptive = true; this.auto = false; this.fireStrength = .3; this.maxSpellLength = 60; this.maxLearningLoad=3; this.magicSlow = false;this.learningMode='letters';this.englishLevel=0;this.customBank=null;
      this.aim = { x: 690, y: 280 }; this.hero = { x: 100, y: 282 }; this.serial = 0;
      this.reset(); this.status = 'ready';
    }
    reset() {
      this.promptHistory=this.promptHistory||{};
      this.stacks = {}; this.offers = []; this.maxHealth = 8; this.healKills=0;
      this.flowerHealth=[];this.breachElapsed=0;this.health = 8; this.score = 0; this.kills = 0; this.casts = 0; this.correct = 0;
      this.wave = 1; this.spawned = 0; this.quota = 9; this.spawnIn = 2; this.waveBreak = 0;
      this.enemies = []; this.bullets = []; this.effects = []; this.dead = [];
      this.shooting = false; this.shotIn = 0; this.shotKick=0; this.time = 0; this.freeze = 0; this.combo = 0;
      this.typing = -1; this.activeTime = 0;
      this.skills = [
        { name:'彩虹激光', code:'A', typed:0, repeatsDone:0, cd:0, duration:8, uses:0, icon:'🌈' },
        { name:'冰冻派对', code:'S', typed:0, repeatsDone:0, cd:0, duration:12, uses:0, icon:'❄️' },
        { name:'西瓜轰轰', code:'D', typed:0, repeatsDone:0, cd:0, duration:11, uses:0, icon:'🍉' }
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
    canBiteDefense(z){return true;}
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
      const surface=this.freeze>0?'iceHit':z.shield>0?'shield':z.type==='armor'?'metal':'flesh';
      if(kind==='pea'&&z.type==='armor')amount*=.5;
      if(z.shield>0){const blocked=Math.min(z.shield,amount);z.shield-=blocked;amount-=blocked;}
      z.hp-=amount;z.hit=.12;
      if(kind==='pea')z.x=Math.min(1070,z.x+3+4*this.stack('knockback'));
      this.emit('hit',{x:z.x,y:z.y,kind,surface});
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
      if(b.bounces>0){let next=null,distance=Infinity;
        for(const enemy of this.enemies){if(enemy.hp<=0||b.hitIds.has(enemy.id))continue;const d=Math.hypot(enemy.x-z.x,enemy.y-z.y);if(d<distance){distance=d;next=enemy;}}
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
    setMaxLearningLoad(value) { const n=Number(value);if(Number.isFinite(n))this.maxLearningLoad=clamp(Math.floor(n),1,5); }
    get learningLoad(){if(this.customBank?.kind==='sentence')return 1;return Math.min(this.maxLearningLoad,1+Math.floor((this.wave-1)/3));}
    get typingSlow() { return this.magicSlow&&this.typing>=0&&this.skills[this.typing].typed>0; }
    get spellLength() { return this.adaptive?Math.min(this.maxSpellLength,this.wave<=4?this.wave:4+(this.wave-4)*2):1; }
    get rechargeRate() { return (1+.16*(this.wave-1))*(1+.2*this.stack('recharge')); }
    pickLearningCode(entries,index,historyKey) {
      const others=this.skills.filter((_,i)=>i!==index).map(s=>s.code[0]);
      const eligible=entries.filter(e=>!others.includes(e.word[0])&&e.word!==this.skills[index].code);
      const candidates=eligible.length?eligible:entries.filter(e=>e.word!==this.skills[index].code);
      const history=this.promptHistory[historyKey]||[],seen=new Set(history);
      const unseen=candidates.filter(e=>!seen.has(e.word));
      let selected;
      if(unseen.length)selected=unseen[Math.floor(this.random()*unseen.length)].word;
      else{
        const allowed=new Set(candidates.map(e=>e.word));
        selected=history.find(code=>allowed.has(code))||candidates[0]?.word||entries[0].word;
      }
      // Bounded LRU history: exhaust eligible new prompts before revisiting old ones.
      this.promptHistory[historyKey]=[...history.filter(code=>code!==selected),selected].slice(-entries.length);
      return selected;
    }
    learningEntry(code){return this.customBank?.entries.find(e=>e.word===code)||(['sentences','speaking'].includes(this.learningMode)?sentenceEntry(code):findWordEntry(code));}
    setCustomBank(group){if(group&&!CUSTOM.validate(group))throw Error('自定义分组无效');if(group&&((this.learningMode==='english')!==(group.kind==='word')||this.learningMode==='letters'))throw Error('分组类型与练习模式不匹配');this.customBank=group?JSON.parse(JSON.stringify(group)):null;delete this.promptHistory.custom;}
    nextCode(index) {
      if(this.customBank&&this.learningMode!=='letters')return this.pickLearningCode(this.customBank.entries,index,'custom');
      if(['english','sentences','speaking'].includes(this.learningMode)){
        if(['sentences','speaking'].includes(this.learningMode)){
          const entries=ENGLISH_CONTEXTS[this.englishLevel].map((_,i)=>contextEntry(this.englishLevel,i,Math.min(3,this.learningLoad)));
          return this.pickLearningCode(entries,index,`context:${this.englishLevel}:${Math.min(3,this.learningLoad)}`);
        }
        const bank=['sentences','speaking'].includes(this.learningMode)?ENGLISH_SENTENCES:ENGLISH_WORDS;
        const tier=bank[this.englishLevel]||bank[0];
        return this.pickLearningCode(tier,index,`english:${this.englishLevel}`);
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
      if(this.learningMode==='speaking')return false;
      if(this.status!=='playing'||!((/^[a-z]$/i).test(key)||(key===' '&&this.learningMode==='sentences')||(['english','sentences'].includes(this.learningMode)&&/^[ .'-]$/.test(key))))return false;
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
        if(this.learningMode==='english'&&skill.repeatsDone+1<this.learningLoad){skill.repeatsDone++;skill.typed=0;this.emit('repeat',{index,done:skill.repeatsDone,total:this.learningLoad});return true;}
        if(!this.enemies.some(z=>z.hp>0)){skill.typed=0;this.typing=-1;this.emit('empty');return true;}
        this.cast(index);
      }
      return true;
    }
    skipSpeech(index) {
      if(this.status!=='playing'||this.learningMode!=='speaking'||!Number.isInteger(index)||index<0||index>2||this.skills[index].cd>0)return false;
      const skill=this.skills[index],old=skill.code;let next=this.nextCode(index);
      if(next===old)next=this.nextCode(index);
      if(next===old)return false;
      skill.code=next;skill.typed=0;skill.repeatsDone=0;this.typing=index;
      return true;
    }
    speak(index,transcript) {
      if(this.status!=='playing'||this.learningMode!=='speaking'||!Number.isInteger(index)||index<0||index>2)return false;
      const skill=this.skills[index];
      if(skill.cd>0){this.emit('cooldown',{index});return false;}
      const normalize=text=>String(text||'').replace(/[’‘]/g,"'").toUpperCase().replace(/[^A-Z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
      const heard=normalize(transcript),expected=normalize(skill.code);
      this.typing=index;this.emit('speech',{index,heard,expected,matched:heard===expected});
      if(!heard||heard!==expected)return false;
      if(!this.enemies.some(z=>z.hp>0)){this.typing=-1;this.emit('empty');return true;}
      this.correct+=expected.replace(/ /g,'').length;this.cast(index);return true;
    }
    backspace() { if(this.typing>=0){const s=this.skills[this.typing];s.typed=Math.max(0,s.typed-1);} }
    cancelTyping(){if(this.typing>=0)this.skills[this.typing].typed=0;this.typing=-1;}
    cast(index) {
      const skill=this.skills[index]; const target=this.target();
      this.typing=-1;skill.typed=0;skill.repeatsDone=0;skill.cd=skill.duration;skill.uses++;this.casts++;
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
          z.eating=this.canBiteDefense(z)&&z.x<=195&&this.health>0;
          if(z.eating){
            z.biteIn=(z.biteIn??.6)-worldDt;
            if(z.biteIn<=0){z.biteIn=.3;this.damageDefense(z.boss?.75:.25,z.y);}
          }else{z.gait+=movementDt*cadence;z.x-=z.speed*movementDt*(1+.38*Math.sin(z.gait));}
          z.ability-=worldDt;
          if(z.type==='healer'&&z.ability<=0){z.ability=3;for(const other of this.enemies)if(other.hp>0&&other.id!==z.id&&Math.hypot(other.x-z.x,other.y-z.y)<190)other.hp=Math.min(other.maxHp,other.hp+other.maxHp*.1);this.emit('heal',{x:z.x,y:z.y});}
          if(z.boss&&z.ability<=0&&this.enemies.length<80){z.ability=9;this.spawn(z.x+40,clamp(z.y+45,100,455),'runner',false);}
          if(z.type==='bomber'&&z.x<=195&&this.canBiteDefense(z)){z.hp=0;this.damageDefense(2,z.y);this.emit('explosion',{x:z.x,y:z.y});this.emit('breach',{health:this.health});continue;}
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
  root.DIALOGUE_STAGES=DIALOGUES.stages;root.ENGLISH_STAGES=VOCABULARY.stages;root.findWordEntry=findWordEntry;root.ENGLISH_SENTENCES=ENGLISH_SENTENCES;root.ENGLISH_CONTEXTS=ENGLISH_CONTEXTS;root.findSentenceEntry=sentenceEntry;root.ENGLISH_WORDS=ENGLISH_WORDS;root.GardenGame=GardenGame;root.GARDEN_CARDS=CARDS;root.ZOMBIE_TYPES=TYPES;
  if(typeof module!=='undefined'&&module.exports)module.exports={DIALOGUE_STAGES:DIALOGUES.stages,GardenGame,CARDS,TYPES,ENGLISH_WORDS,ENGLISH_STAGES:VOCABULARY.stages,findWordEntry,ENGLISH_SENTENCES,ENGLISH_CONTEXTS,findSentenceEntry:sentenceEntry};
})(typeof globalThis!=='undefined'?globalThis:this);
