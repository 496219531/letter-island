/* Accounts and rankings are user-driven. No background polling or score streaming. */
(function(){
 const key='gulu-community-profile',pendingKey='gulu-community-pending';
 let profile=null,dialog=null,serial=0,pendingStart=null;
 try{profile=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 function remember(user){profile=user;try{user?localStorage.setItem(key,JSON.stringify(user)):localStorage.removeItem(key);}catch{}document.querySelectorAll('.community-entry').forEach(b=>b.textContent='排行榜'+(profile?' · '+profile.name:''));document.querySelectorAll('.community-home').forEach(b=>b.textContent=profile?'查看我的排行榜':'加入小院 · 记录成绩');const name=document.querySelector('#playerName');if(name){name.readOnly=!!profile;if(profile)name.value=profile.name;}}
 async function request(path,data){
  if(window.GuluNative?.communityRequest){const {status,result}=await window.GuluNative.communityRequest(path,data);if(status>=400){if(status===401)remember(null);throw Error(result.error||'暂时无法连接，请稍后重试');}return result;}
  const response=await fetch('api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok){if(response.status===401)remember(null);throw Error(result.error||'暂时无法连接，请稍后重试');}return result;
 }
 const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 function button(parent,text,action,cls){const b=element('button',text,cls);b.type='button';b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){message(e.message);}finally{b.disabled=false;}};parent.append(b);return b;}
 function message(text){const target=dialog?.querySelector('.community-status');if(target)target.textContent=text;}
 function input(parent,label,type='text'){const l=element('label',label),i=element('input');i.type=type;i.autocomplete='off';l.append(i);parent.append(l);return i;}
 function showRecovery(code,parent){
  parent.replaceChildren(element('h3','收好你的恢复码'),element('p','换设备时用它找回账号。恢复码等同钥匙，请勿发给别人；关闭后不再显示。'));
  const field=element('textarea');field.value=code;field.readOnly=true;field.setAttribute('aria-label','账号恢复码');parent.append(field);
  button(parent,'复制恢复码',async()=>{try{await navigator.clipboard.writeText(code);message('已复制，请保存到安全的地方。');}catch{field.focus();field.select();message('请长按恢复码复制，或手动保存。');}});
  button(parent,'已保存，查看账号',()=>renderAccount(parent));
 }
 async function renderAccount(parent){
  const mine=++serial;parent.replaceChildren(element('p','正在读取账号…'));const result=await request('account');if(!dialog?.open||serial!==mine)return;remember(result.user);parent.replaceChildren();
  if(profile){
   parent.append(element('h3',profile.name),element('p','已自动登录。昵称会显示在排行榜及新加入的对战房间中。'));
   const pending=readPending();if(pending&&pending.owner===profile.id)button(parent,'重试上传上次成绩',async()=>{await submit(pending);message('成绩已保存到榜单。');});
   button(parent,'生成新的恢复码',async()=>{if(!confirm('旧恢复码会失效，确定生成新的恢复码吗？'))return;const result=await request('account/recovery',{});showRecovery(result.recoveryCode,parent);});
   button(parent,'退出此设备账号',async()=>{await request('account/logout',{});remember(null);await renderAccount(parent);});return;
  }
  parent.append(element('h3','给小院起个名字'),element('p','填昵称即可加入。游客也能玩；登录后新开始的游戏才会计入榜单。'));
  const name=input(parent,'昵称');name.maxLength=16;name.autocomplete='nickname';
  button(parent,'创建小院账号',async()=>{const result=await request('account/register',{name:name.value});remember(result.user);showRecovery(result.recoveryCode,parent);},'community-primary');
  parent.append(element('h3','找回已有账号'));
  const code=input(parent,'恢复码','password');code.spellcheck=false;
  button(parent,'恢复账号',async()=>{const result=await request('account/restore',{code:code.value});code.value='';remember(result.user);await renderAccount(parent);});
 }
 async function renderBoard(parent,kind,mode='english',level=0){
  const mine=++serial;parent.replaceChildren();
  parent.append(element('p',kind==='solo'?'标准题库休闲榜：总分＝击退分＋练习分。练习分＝有效字母数×2×学段系数×完成遍数；完整完成并释放技能才计分。每人保留最高分，自定义题库不参榜。':'赢一局 +3 分，平局 +1 分。双方登录且对局满30秒才计分；同一对手每天最多3局计分，退出或超时断线视为认输。'));
  const filters=element('div',undefined,'community-filters');parent.append(filters);
  if(kind==='solo'){
   const m=element('select');m.setAttribute('aria-label','单人榜模式');for(const [v,t] of [['letters','字母练习'],['english','英语单词'],['sentences','英语句子']])m.add(new Option(t,v));m.value=mode;filters.append(m);
   const l=element('select');l.setAttribute('aria-label','单人榜学段');for(let i=0;i<5;i++)l.add(new Option(['入门','基础','进阶','提升','挑战'][i],String(i)));l.value=String(level);l.hidden=mode==='letters';filters.append(l);
   m.onchange=()=>renderBoard(parent,kind,m.value,Number(l.value)).catch(e=>message(e.message));l.onchange=m.onchange;
  }
  button(filters,'刷新榜单',()=>renderBoard(parent,kind,mode,level));
  const content=element('div');content.append(element('p','正在加载榜单…'));parent.append(content);
  const result=await request('leaderboards?'+new URLSearchParams({kind,mode,level}));if(!dialog?.open||serial!==mine)return;remember(result.user);content.replaceChildren();
  const summary=result.me?'你的名次：第 '+result.me.rank+' 名'+(kind==='solo'?' · '+result.me.score+' 分':' · '+result.me.points+' 积分'):profile?'完成一局，留下你的小院足迹。':'加入账号后，你的成绩也能出现在这里。';
  content.append(element('p',summary,'community-mine'));
  if(!result.rows.length){content.append(element('p','榜单还空着，来留下第一份成绩吧！','community-empty'));return;}
  const table=element('table');const head=element('tr');for(const name of ['排名','小院守卫',kind==='solo'?'最高分':'积分',kind==='solo'?'波次':'战绩'])head.append(element('th',name));const thead=element('thead');thead.append(head);table.append(thead);const tbody=element('tbody');table.append(tbody);
  for(const row of result.rows){const tr=element('tr');if(row.id===profile?.id)tr.className='is-me';for(const text of [row.rank,row.name,kind==='solo'?row.score:row.points,kind==='solo'?row.wave:row.wins+'胜 / '+row.played+'局'])tr.append(element('td',String(text)));tbody.append(tr);}content.append(table,element('small','展示前50名 · 只在打开或刷新时更新'));
 }
 function open(tab='solo'){
  if(dialog?.open){dialog.focus();return;}
  document.querySelector('#mobileSettingsDialog[open] .mobile-settings-header button')?.click();
  const resume=typeof game!=='undefined'&&game.status==='playing';if(resume){stopListening();game.pause();updateHud(true);}
  dialog=element('dialog',undefined,'community-dialog');dialog.setAttribute('aria-label','小院排行榜');
  const own=dialog,head=element('header');head.append(element('h2','小院排行榜'));button(head,'关闭排行榜',()=>own.close());dialog.append(head);
  const nav=element('nav'),content=element('div',undefined,'community-content');dialog.append(nav);const status=element('p','', 'community-status');status.setAttribute('role','status');dialog.append(status,content);
  for(const [id,title] of [['solo','单人榜'],['duel','对战榜'],['account','我的账号']])button(nav,title,async()=>{message('');for(const b of nav.children)b.setAttribute('aria-pressed',String(b.textContent===title));await (id==='account'?renderAccount(content):renderBoard(content,id));});
  own.addEventListener('close',()=>{serial++;own.remove();if(dialog===own)dialog=null;if(resume&&game.status==='paused'){game.resume();updateHud(true);}});
  document.body.append(dialog);dialog.showModal();const selected=[...nav.children].find(b=>b.textContent===({solo:'单人榜',duel:'对战榜',account:'我的账号'}[tab]));selected.click();
 }
 function readPending(){try{return JSON.parse(localStorage.getItem(pendingKey)||'null');}catch{return null;}}
 async function submit(record){
  if(record.owner!==profile?.id)throw Error('请先恢复本局所属账号，再上传成绩');
  const result=await request('solo/finish',record.data);
  if(readPending()?.data.runId===record.data.runId)try{localStorage.removeItem(pendingKey);}catch{}
  return result;
 }
 function startSolo(g){
  g.rankingRun=null;if(!profile||g.customBank||!['letters','english','sentences'].includes(g.learningMode))return;
  const localKey=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');
  const marker={owner:profile.id,localKey};g.rankingRun=marker;
  pendingStart=request('solo/start',{mode:g.learningMode,level:g.englishLevel,custom:!!g.customBank}).then(result=>{
   Object.assign(marker,result);
   // Retain only the small ticket, never serialize the game on an API response.
   try{const records=JSON.parse(localStorage.getItem('gulu-community-tickets')||'[]');const list=Array.isArray(records)?records:[];localStorage.setItem('gulu-community-tickets',JSON.stringify([...list.slice(-19),{...result,owner:marker.owner,localKey}]));}catch{}
  }).catch(e=>{marker.error=e.message;});
 }
 function finishSolo(g){
  const host=document.querySelector('#dialogContent');if(!host)return;
  const wrap=element('section',undefined,'community-result'),status=element('p','');wrap.append(status);button(wrap,'查看排行榜',()=>open());host.append(wrap);
  const startPromise=pendingStart,run=g.rankingRun,data={score:g.score,wave:g.wave,kills:g.kills,casts:g.casts,seconds:g.activeTime||g.time};
  if(!run){status.textContent='登录后新开始的标准题库练习可参榜。';if(!profile)button(wrap,'加入小院，下局参榜',()=>open('account'));return;}
  status.textContent='正在保存本局榜单成绩…';
  async function send(){
   await startPromise;
   if(!run.runId&&run.localKey){try{const records=JSON.parse(localStorage.getItem('gulu-community-tickets')||'[]');const ticket=records.find(t=>t.localKey===run.localKey&&t.owner===run.owner);if(ticket)Object.assign(run,ticket);}catch{}}
   if(!run.runId)throw Error(run.error||'本局未能建立参榜记录');
   const record={owner:run.owner,data:{...data,runId:run.runId}};try{localStorage.setItem(pendingKey,JSON.stringify(record));}catch{}
   await submit(record);status.textContent='本局成绩已保存！榜单保留你的最高分。';
  }
  send().catch(e=>{status.textContent=e.message+'；游戏进度仍保存在本机。';button(wrap,'重试上传成绩',async()=>{await send();message('已保存成绩');});});
 }
 document.addEventListener('DOMContentLoaded',()=>{
  const entry=button(document.querySelector('.header-actions')||document.querySelector('.topbar'),'排行榜',()=>open(), 'community-entry');
  const controls=document.querySelector('.difficulty-controls');if(controls)button(controls,'排行榜与账号',()=>open());
  const start=document.querySelector('.start-panel');if(start)button(start,'加入小院 · 记录成绩',()=>open(profile?'solo':'account'),'community-home');
  const room=document.querySelector('.room-tools');if(room)button(room,'排行榜',()=>open('duel'));
  remember(profile);
 });
 window.addEventListener('storage',event=>{if(event.key===key){try{remember(JSON.parse(event.newValue||'null'));}catch{}}});
 window.GuluCommunity={open,startSolo,finishSolo,get profile(){return profile;}};
})();
