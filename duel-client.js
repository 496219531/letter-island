'use strict';
const $=s=>document.querySelector(s),sessionKey='gulu-lan-session-v1';
let session=null,stream=null,state=null,connected=false,queue=Promise.resolve(),noticeTimer,lastAim=0,skillSignature='',feedbackId='',localAuto=true;
const zombie=new Image();zombie.src='assets/zombie.png';
const arenaArt=new Image();arenaArt.src='assets/duel-garden-v2.png';
const captainArt=new Image();captainArt.src='assets/pea-captain-v1.png';
let captainLayer=null;
function getDuelCaptain(){
 if(captainLayer)return captainLayer;
 const layer=document.createElement('canvas');layer.width=512;layer.height=512;const pen=layer.getContext('2d');pen.drawImage(captainArt,0,0,512,512);
 const pixels=pen.getImageData(0,0,512,512),data=pixels.data;
 for(let i=0;i<data.length;i+=4){const lo=Math.min(data[i],data[i+1],data[i+2]),hi=Math.max(data[i],data[i+1],data[i+2]);if(lo>175&&hi-lo<30)data[i+3]=0;}
 pen.putImageData(pixels,0,0);captainLayer=layer;return layer;
}
function drawDuelFlowers(c,field){
 for(let i=0;i<8;i++){
  const ratio=field.flowers[i]/(field.maxHealth/8);c.save();c.translate(155,110+i*48);
  c.fillStyle='#49371d44';c.beginPath();c.ellipse(0,18,17,6,0,0,Math.PI*2);c.fill();
  if(ratio>0){
   c.strokeStyle='#36792d';c.lineWidth=5;c.beginPath();c.moveTo(0,15);c.lineTo(0,-4);c.stroke();
   c.fillStyle='#65b93d';c.beginPath();c.ellipse(-7,8,9,4,-.5,0,Math.PI*2);c.fill();
   for(let p=0;p<Math.max(2,Math.ceil(ratio*10));p++){c.save();c.rotate(p/10*Math.PI*2);c.fillStyle=ratio<.4?'#cf9d3c':'#ffda42';c.beginPath();c.ellipse(0,-13,5,10,0,0,Math.PI*2);c.fill();c.restore();}
   c.fillStyle='#80532e';c.beginPath();c.arc(0,0,10,0,Math.PI*2);c.fill();c.fillStyle='#fff5b9';c.beginPath();c.arc(-3,-2,1.4,0,Math.PI*2);c.arc(3,-2,1.4,0,Math.PI*2);c.fill();
  }else{c.strokeStyle='#88754b';c.lineWidth=3;c.beginPath();c.moveTo(0,17);c.lineTo(2,10);c.stroke();}
  c.restore();
 }
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let addresses=[],stages=[],dialogueStages=[];
function notice(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,3500);}
async function request(path,options={}) {
  const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{}),...options.headers},signal:AbortSignal.timeout(6000)});
  const data=await res.json();if(!res.ok)throw Object.assign(new Error(data.error||'连接失败'),{status:res.status});return data;
}
function action(command) {
  const current=session;
  queue=queue.catch(()=>{}).then(async()=>{
    if(!current||session!==current||!connected)return;
    try{await request(`/api/room/${current.code}/action`,{method:'POST',body:JSON.stringify(command)});}
    catch(e){if(e.status===401){reset();notice(e.message);}else notice(e.message||'网络暂时不可用');}
  });
  return queue;
}
function reset(){document.body.dataset.duelState='lobby';stream?.close();stream=null;session=null;state=null;connected=false;try{sessionStorage.removeItem(sessionKey);}catch{}$('#lobby').hidden=false;$('#room').hidden=true;}
function invitation(){const url=new URL(addresses[0]||location.href);url.pathname='/duel.html';url.search='';url.searchParams.set('room',session.code);return url.href;}
function attach() {
  $('#lobby').hidden=true;$('#room').hidden=false;$('#codeLabel').textContent=session.code;$('#invite').value=invitation();
  $('#connection').textContent='正在连接房间…';
  stream?.close();const current=session,events=new EventSource(`/api/room/${session.code}/events?token=${encodeURIComponent(session.token)}`);stream=events;
  events.onmessage=e=>{if(session!==current)return;connected=true;state=JSON.parse(e.data);render();};
  events.onerror=async()=>{
    if(session!==current)return;connected=false;$('#connection').textContent='连接中断，正在自动重连… 对局暂停，30 秒内可恢复。';$('#connection').classList.add('error');
    $('#overlay').hidden=false;$('#overlay').textContent='连接中断 · 正在重连';
    try{await request(`/api/room/${current.code}/state`);}catch(error){if(error.status===401&&session===current){reset();notice(error.message);}}
  };
}
async function enter(code) {
  $('#create').disabled=true;$('#join').disabled=true;
  try {
    session=await request('/api/rooms',{method:'POST',body:JSON.stringify({mobile:Boolean(window.GuluMobile?.active),name:$('#playerName').value,code,mode:$('#mode').value,level:Number($('#level').value)})});
    try{sessionStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
    attach();
  }catch(e){notice(e.message||'无法连接，请先在房主电脑启动局域网服务');}
  finally{$('#create').disabled=false;$('#join').disabled=false;}
}
$('#create').onclick=()=>enter();
$('#joinForm').onsubmit=e=>{e.preventDefault();enter($('#roomCode').value.trim().toUpperCase());};
function updateLevels(){
 const mode=$('#mode').value;$('#levelLabel').hidden=mode==='letters';$('#levelTitle').textContent=mode==='english'?'词汇学段':'句子难度';
 const labels=mode==='english'?stages.map(s=>s.name+' · '+s.count+'词'):dialogueStages.map(s=>s.name+' · '+s.groups+'组 / '+s.sentences+'句');
 if(labels.length)Array.from($('#level').options).forEach((o,i)=>o.textContent=labels[i]);
}
$('#mode').onchange=updateLevels;
$('#ready').onclick=()=>action({type:'ready'});
$('#copy').onclick=async()=>{
  const text=invitation();
  try{await navigator.clipboard.writeText(text);notice('邀请地址已复制');}
  catch{
    const input=document.createElement('textarea');input.value=text;input.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(input);input.select();
    let copied=false;try{copied=document.execCommand('copy');}catch{}input.remove();notice(copied?'邀请地址已复制':text);
  }
};
async function leaveRoom(){
  if(state?.status==='playing'&&!confirm('退出房间将结束当前对局，确定退出吗？'))return;
  try{if(session)await request(`/api/room/${session.code}/leave`,{method:'POST',body:'{}'});reset();notice('已退出房间，可以重新创建或加入');}
  catch(e){if(e.status===401){reset();return;}notice('退出未成功，请重试：'+e.message);}
}
$('#leave').onclick=leaveRoom;
$('#leaveWaiting').onclick=leaveRoom;
$('#unready').onclick=()=>action({type:'unready'});
$('#surrender').onclick=()=>{if(confirm('确定认输并结束这一局吗？'))action({type:'surrender'});};
$('#auto').onchange=()=>{localAuto=$('#auto').checked;action({type:'auto',value:localAuto});};
setInterval(()=>{if(session&&connected)action({type:'ping'});},2000);

const skillCards=[];
for(let i=0;i<3;i++){
  const button=document.createElement('button');button.className='skill';button.innerHTML='<div class="skill-top"><strong></strong><small></small></div><div class="dialogue-context" hidden></div><div class="skill-code"></div><div class="skill-meaning"></div><div class="skill-bar"></div>';
  button.onclick=()=>{action({type:'select',index:i});$('#myCanvas').focus({preventScroll:true});};$('#skills').append(button);skillCards.push(button);
}
let phoneSkill=0,phoneTabs=null;
function showPhoneSkill(index){
  phoneSkill=index;skillCards.forEach((card,i)=>card.classList.toggle('phone-visible',i===index));
  if(phoneTabs)[...phoneTabs.children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
}
if(window.GuluMobile?.active){
  document.body.classList.add('phone-duel');
  phoneTabs=document.createElement('div');phoneTabs.className='duel-skill-tabs';phoneTabs.setAttribute('aria-label','选择大招');
  ['🌈 激光','❄️ 冰冻','🍉 西瓜'].forEach((label,index)=>{const button=document.createElement('button');button.type='button';button.dataset.skill=index;button.textContent=label;button.onclick=()=>{showPhoneSkill(index);skillCards[index].click();};phoneTabs.append(button);skillCards[index].dataset.skill=index;});
  $('#skills').before(phoneTabs);showPhoneSkill(0);
  const keyboard=document.createElement('div');keyboard.className='duel-touch-keyboard';keyboard.setAttribute('aria-label','对战触屏键盘');
  for(const keys of ['QWERTYUIOP'.split(''),'ASDFGHJKL'.split(''),'ZXCVBNM'.split(''),["'",'-','.',' ','Backspace','Escape']]){
    const row=document.createElement('div');row.className='touch-row';
    for(const key of keys){const b=document.createElement('button');b.type='button';b.className='touch-key'+(key.length>1||key===' '?' wide':'');b.textContent=key===' '?'空格':key==='Backspace'?'退格':key==='Escape'?'取消':key;b.setAttribute('aria-label','输入 '+b.textContent);b.dataset.key=key;b.onclick=()=>{if(!connected||state?.status!=='playing'||state.paused)return;action(key==='Backspace'?{type:'backspace'}:key==='Escape'?{type:'cancel'}:{type:'key',key});};row.append(b);}
    keyboard.append(row);
  }
  $('#skills').after(keyboard);
}
const unitButtons={};
for(const [unit,icon,name,cost] of [['runner','⚡','疾跑僵尸',18],['armor','🪣','铁桶僵尸',28],['bomber','💣','爆破僵尸',38]]){
  const b=document.createElement('button');b.innerHTML=`<span>${icon} ${name}</span><small>☀ ${cost}</small>`;b.onclick=()=>{action({type:'send',unit});$('#myCanvas').focus({preventScroll:true});};$('#units').append(b);unitButtons[unit]=b;
}
function render() {
  document.body.dataset.duelState=state.status;
  const s=state,me=s.players[s.side],other=s.players[1-s.side],playing=s.status==='playing',finished=s.status==='finished',live=playing&&!s.paused&&connected;
  if(s.feedback?.text&&feedbackId!==`${s.code}:${s.round}:${s.feedback.id}`){feedbackId=`${s.code}:${s.round}:${s.feedback.id}`;notice(s.feedback.text);}
  $('#connection').classList.toggle('error',s.paused);
  $('#connection').textContent=s.paused?`等待${s.players.filter(p=>p&&!p.connected).map(p=>p.name).join('、')}重连 · 剩余 ${Math.max(0,Math.ceil(30-Math.max(...s.players.map(p=>p?.offline||0))))} 秒`:`已连接 · ${s.config.mode==='letters'?'字母组合':s.config.mode==='english'?'英语单词':'英语句子'}${s.config.mode==='letters'?'':s.stage?` · ${s.stage.name} · ${s.stage.count}词`:s.dialogueStage?` · ${s.dialogueStage.name} · ${s.dialogueStage.groups}组`:` · ${s.config.level+1} 级`} · 双方题目与技能进度独立`;
  $('#roundLabel').textContent=s.round?`第 ${s.round} 局`:'';
  $('#waiting').hidden=playing;$('#battle').hidden=!s.fields;
  if(!playing){
    $('#waitingTitle').textContent=finished?(s.winner===null?'平局':s.winner===s.side?'你守住了后院！':'这次后院失守了'):(other?'两位守卫已到齐':'等待朋友入场');
    $('#waitingDetail').textContent=finished?`${s.winner===null?s.reason:s.reason.startsWith('对方')?(s.winner===s.side?s.reason:s.reason.replace('对方','你的')):s.reason}。双方准备后可再来一局。`:'双方点击准备后自动开战。题目由房主设置，每个人独立作答。';
    $('#playerList').replaceChildren();
    s.players.forEach((p,i)=>{const row=document.createElement('p'),name=document.createElement('strong'),status=document.createElement('span');name.textContent=p?`${p.name}${i===s.side?'（我）':''}`:'等待朋友…';status.textContent=p?(p.connected?(p.ready?'已准备 ✓':'未准备'):'未连接'):'';row.append(name,status);$('#playerList').append(row);});
    $('#unready').hidden=!me.ready;$('#unready').disabled=!connected;
    $('#ready').disabled=me.ready||!connected;$('#ready').textContent=me.ready?'已准备，等待朋友':finished?'再来一局 · 准备':'我准备好了';
  }
  if(!s.fields)return;
  if(phoneTabs){
    if(s.typing>=0&&s.typing!==phoneSkill)showPhoneSkill(s.typing);
    const hints=GuluMobile.keySkillHints(s.skills,s.typing,s.config.mode);
    document.querySelectorAll('.duel-touch-keyboard [data-key]').forEach(button=>{
      const skill=hints[button.dataset.key];button.classList.toggle('hint',skill!==undefined);
      if(skill!==undefined)button.dataset.hintSkill=skill;else delete button.dataset.hintSkill;
    });
  }
  const mine=s.fields[s.side],theirs=s.fields[1-s.side];
  $('#myName').textContent=me.name+'（我）';$('#theirName').textContent=other.name;
  $('#myHealth').textContent=`🌻 ${mine.health.toFixed(1)} / ${mine.maxHealth}`;$('#theirHealth').textContent=`🌻 ${theirs.health.toFixed(1)} / ${theirs.maxHealth}`;
  $('#timer').textContent=`${String(Math.floor(s.elapsed/60)).padStart(2,'0')}:${String(Math.floor(s.elapsed%60)).padStart(2,'0')}`;
  $('#sun').textContent=me.sun;$('#sentLabel').textContent=`我方 ${theirs.enemies.length} 只 · 敌方 ${mine.enemies.length} 只 · 交战 ${theirs.enemies.filter(z=>z.engaged).length+mine.enemies.filter(z=>z.engaged).length} 只`;
  $('#auto').checked=s.auto;localAuto=s.auto;$('#auto').disabled=!live;$('#surrender').disabled=!playing;
  for(const [unit,b] of Object.entries(unitButtons))b.disabled=!live||me.sun<s.units[unit].cost||me.dispatchCd>0||theirs.enemies.length>=60;
  $('#overlay').hidden=live;
  $('#overlay').textContent=finished?(s.winner===null?'势均力敌 · 平局':s.winner===s.side?'胜利！小院守住了':'后院失守 · 再来一局吧'):'对局暂停 · 等待重连';
  $('#skillHint').textContent=s.config.mode==='english'?`已见 ${s.wordSeen} / ${s.stage.count} 词 · 优先未练词 · 每题 ${s.learningLoad} 遍`:'点击卡片选技能，输入题目施放。只伤害敌方僵尸。';
  const sig=JSON.stringify([s.skills,s.typing,live]);
  if(sig!==skillSignature){skillSignature=sig;s.skills.forEach((skill,i)=>{
    const b=skillCards[i];b.disabled=!live||skill.cd>0;b.classList.toggle('active',s.typing===i);
    b.querySelector('strong').textContent=['🌈 彩虹激光','❄ 冰冻派对','🍉 西瓜轰轰'][i];
    b.querySelector('small').textContent=skill.cd>0?`${skill.cd.toFixed(1)} 秒`:(s.config.mode==='english'&&s.learningLoad>1?`${skill.repeatsDone}/${s.learningLoad} 遍`:'就绪');
    const code=b.querySelector('.skill-code');code.replaceChildren();
    const typed=document.createElement('span');typed.className='typed';typed.textContent=skill.code.slice(0,skill.typed);code.append(typed);
    const next=document.createElement('span');next.className='next';next.textContent=skill.code[skill.typed]===' '?'␣':skill.code[skill.typed]||'';code.append(next);code.append(document.createTextNode(skill.code.slice(skill.typed+1)));code.scrollTop=Math.max(0,next.offsetTop-code.clientHeight+24);
    b.querySelector('.dialogue-context').hidden=!skill.scene;b.querySelector('.dialogue-context').textContent=skill.scene||'';b.title=skill.scene?[skill.reference,skill.goal,skill.grammar].join(' · '):'';
    b.querySelector('.skill-meaning').textContent=skill.meaning||['直线范围伤害','冻结敌方僵尸','瞄准区域爆炸'][i];
    b.querySelector('.skill-bar').style.width=`${100*(1-skill.cd/skill.duration)}%`;
  });}
  drawBattle($('#myCanvas'),s);
}
document.addEventListener('keydown',e=>{
  if(!connected||state?.status!=='playing'||state.paused||e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(/^[a-z .'-]$/i.test(e.key)){e.preventDefault();if(!e.repeat)action({type:'key',key:e.key});}
  else if(e.key==='Backspace'){e.preventDefault();action({type:'backspace'});}
  else if(e.key==='Escape'){e.preventDefault();action({type:'cancel'});}
});
function aim(e){const rect=$('#myCanvas').getBoundingClientRect();return {type:'aim',x:(e.clientX-rect.left)*1000/rect.width,y:(e.clientY-rect.top)*530/rect.height};}
$('#myCanvas').onpointermove=e=>{if(!localAuto&&performance.now()-lastAim>60){lastAim=performance.now();action(aim(e));}};
$('#myCanvas').onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();$('#myCanvas').focus({preventScroll:true});if(!localAuto){action(aim(e));action({type:'fire',value:true});}};
window.addEventListener('pointercancel',()=>{if(state?.status==='playing'&&!localAuto)action({type:'fire',value:false});});
window.addEventListener('pointerup',()=>{if(state?.status==='playing'&&!localAuto)action({type:'fire',value:false});});
window.addEventListener('blur',()=>{if(state?.status==='playing'&&!localAuto)action({type:'fire',value:false});});
window.addEventListener('pagehide',()=>stream?.close());
window.addEventListener('pageshow',e=>{if(e.persisted&&session)attach();});

function drawBattle(canvas,s) {
  const c=canvas.getContext('2d'),mine=s.fields[s.side],other=s.fields[1-s.side];
  c.clearRect(0,0,1000,530);
  if(arenaArt.complete&&arenaArt.naturalWidth)c.drawImage(arenaArt,0,0,1000,530);
  else{c.fillStyle='#385a2b';c.fillRect(0,0,1000,530);}
  c.strokeStyle='#f4f0bf25';c.lineWidth=1;c.setLineDash([3,12]);c.beginPath();c.moveTo(500,96);c.lineTo(500,465);c.stroke();c.setLineDash([]);
  function yard(field,flipped){
    c.save();if(flipped){c.translate(1000,0);c.scale(-1,1);}
    drawDuelFlowers(c,field);
    c.fillStyle='#1b30194d';c.beginPath();c.ellipse(96,320,31,8,0,0,Math.PI*2);c.fill();
    if(captainArt.complete&&captainArt.naturalWidth)c.drawImage(getDuelCaptain(),30-(field.shotKick>0?3:0),206,134,134);
    c.restore();
  }
  yard(mine,false);yard(other,true);
  const units=[...mine.enemies.map(z=>({...z,friendly:false,frozen:mine.freeze>0})),...other.enemies.map(z=>({...z,x:1000-z.x,friendly:true,frozen:other.freeze>0}))].sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const z of units){
    const size=z.type==='mini'?45:z.type==='boss'?100:68,bob=reducedMotion||z.frozen?0:Math.sin(z.gait)*(z.engaged?1:2);
    c.fillStyle=z.friendly?'#416c4b55':'#a45e3955';c.beginPath();c.ellipse(z.x,z.y+size*.4,size*.3,8,0,0,Math.PI*2);c.fill();
    c.save();c.translate(z.x,z.y+bob);if(z.friendly)c.scale(-1,1);
    if(zombie.complete&&zombie.naturalWidth)c.drawImage(zombie,-size/2,-size*.55,size,size);else{c.font=`${size*.7}px system-ui`;c.fillText('🧟',-size*.4,size*.3);}c.restore();
    if(z.frozen){c.fillStyle='#b4ecff80';c.fillRect(z.x-size*.45,z.y-size*.55,size*.9,size);c.font='20px system-ui';c.fillText('❄',z.x-10,z.y-size*.75);}
    const icon={runner:'⚡',armor:'🪣',bomber:'💣',mini:'🍬',boss:'👑',healer:'💚',shield:'🛡️'}[z.type];if(icon){c.font='22px system-ui';c.fillText(icon,z.x-12,z.y-size*.45);}
    c.fillStyle='#384932';c.fillRect(z.x-24,z.y-size*.63,48,6);c.fillStyle=z.friendly?'#40845a':'#c57545';c.fillRect(z.x-24,z.y-size*.63,48*Math.max(0,z.hp/z.maxHp),6);
    if(z.engaged){c.font='bold 14px system-ui';c.fillStyle=z.friendly?'#27573a':'#864024';c.textAlign='center';c.fillText(z.frozen?'冻住了':'互啃中',z.x,z.y+size*.65);c.textAlign='left';if(z.hit>0){c.strokeStyle='#fff5ba';c.lineWidth=3;c.beginPath();c.arc(z.x+(z.friendly?22:-22),z.y,13,0,Math.PI*2);c.stroke();}}
  }
  function weapons(field,flipped){
    c.save();if(flipped){c.translate(1000,0);c.scale(-1,1);}
    c.fillStyle=flipped?'#ffdc9e':'#f3f7a0';for(const b of field.bullets){c.beginPath();c.arc(b.x,b.y,5,0,Math.PI*2);c.fill();}
    for(const e of field.effects){
      if(e.kind==='laser'){c.save();c.translate(field.hero.x,field.hero.y);c.rotate(e.angle);c.globalAlpha=.4;for(const [i,color] of ['#ffe968','#99ffaf','#8ee8ff'].entries()){c.fillStyle=color;c.fillRect(0,(i-1)*22-12,900,24);}c.restore();}
      if(e.kind==='melon'){c.font='45px system-ui';c.fillText('🍉',e.x-22,e.y-30-e.life*70);}
      if(e.kind==='explosion'){c.fillStyle='#ffe49366';c.beginPath();c.arc(e.x,e.y,100*(1-e.life/e.fullLife)+30,0,Math.PI*2);c.fill();}
    }
    c.restore();
  }
  weapons(mine,false);weapons(other,true);
  if(!localAuto){c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.arc(mine.target.x,mine.target.y,15,0,Math.PI*2);c.moveTo(mine.target.x-23,mine.target.y);c.lineTo(mine.target.x+23,mine.target.y);c.stroke();}
  c.font='bold 16px system-ui';c.shadowColor='#18321b';c.shadowBlur=4;c.fillStyle='#f0e5ac';c.fillText('我方僵尸 →',185,505);c.fillStyle='#f4d09d';c.textAlign='right';c.fillText('← 敌方僵尸',815,505);c.textAlign='left';c.shadowBlur=0;
  if(mine.health<=0||other.health<=0){c.fillStyle='#993a26';c.font='bold 20px system-ui';c.textAlign='center';c.fillText(`${mine.health<=0?'我的':'对方'}后院告急 · ${Math.max(0,3-(mine.health<=0?mine.breach:other.breach)).toFixed(1)} 秒`,500,510);c.textAlign='left';}
}
async function boot(){
  const code=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
  const invited=/^[A-F0-9]{6}$/.test(code);if(invited)$('#roomCode').value=code;
  try{
    const info=await request('/api/lan');if(!Array.isArray(info.addresses))throw new Error();addresses=info.addresses;stages=info.stages||[];dialogueStages=info.dialogueStages||[];updateLevels();
    const note=$('#networkNote');note.replaceChildren(document.createTextNode('手机或电脑打开：'));
    const url=addresses[0]||location.origin+'/duel.html';const a=document.createElement('a');a.href=url;a.textContent=url;note.append(a,document.createTextNode(' · 房主电脑保持运行。'));
    try{session=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
    if(session?.code&&session?.token&&(!invited||session.code===code)){
      try{await request(`/api/room/${session.code}/state`);attach();return;}
      catch(error){if(error.status!==401)throw error;reset();}
    }
    if(invited){session=null;await enter(code);}

  }catch(e){
    if(e.status===401){reset();notice('上一个房间已过期，可以重新开房');return;}
    $('#networkNote').replaceChildren(document.createTextNode('此地址尚未启动局域网对战服务。请在房主电脑的游戏目录运行 '));const cmd=document.createElement('code');cmd.textContent='npm run lan';$('#networkNote').append(cmd,document.createTextNode('，然后打开终端显示的对战地址。'));$('#create').disabled=true;$('#join').disabled=true;
  }
}
boot();
