'use strict';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#gameCanvas');
const ctx = canvas.getContext('2d');
const sprite = new Image(); sprite.src = 'assets/zombie.png';
const captainSprite=new Image();captainSprite.src='assets/pea-captain-v1.png';
const particles = [];
const MAX_PARTICLES=260;
const soundscape=new GardenAudio(()=>new (window.AudioContext||window.webkitAudioContext)());
try{const volume=localStorage.getItem('gulu-sfx-volume-v2');if(volume!==null)soundscape.setVolume(Number(volume));}catch{}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let soundOn = true, best = 0, lastTime = 0, lastHud = '', hudClock = 0;
let toastTimer, bannerTimer, recoil = 0, shake = 0, dialogResume = false;
const localSpeech=GuluSystemSpeech.createLocalSpeech(window.speechSynthesis,window.SpeechSynthesisUtterance);
const reviewStore=GuluSpeechReview.repository(localStorage);
const speechAttempts=new Map();
let listening=false,speechHeld=false,speechFeedback='',nativeSpeechReady=false,speechAuthorized=false,permissionPhase='idle';
const phoneSpeech=Boolean(window.GuluMobile?.active);
const microphone=(phoneSpeech?GuluMobile.createSpeech:GuluPressToTalk.createPressToTalk)({
  authorize:async()=>{if(!speechAuthorized)throw new Error('请先点击启用语音权限');},
  onState(phase){listening=phase==='recording';speechHeld=microphone.held;updateSpeechControl();},
  onError(message,target,meta){if(target)rememberSpeechAttempt(target,'',message,meta);if(message.includes('权限')){speechAuthorized=false;permissionPhase='error';}speechFeedback=message;updateSpeechControl();toast(message,4500);},
  onResult(text,target,meta){
    if(game.status!=='playing'||game.learningMode!=='speaking'||game.typing!==target.index||game.skills[target.index].code!==target.code||game.skills[target.index].cd>0)return;
    rememberSpeechAttempt(target,text,'',meta);speechFeedback='听到：'+text;game.speak(target.index,text);updateHud(true);
  }
});
const voicePermissions=GuluPressToTalk.createVoicePermissions({
  requestMicrophone(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前地址不能申请录音权限。手机需使用受信任的 HTTPS 地址连接游戏；普通局域网 HTTP 可玩单词和句子模式。');
    return navigator.mediaDevices.getUserMedia({audio:true});
  },
  async authorizeNative(){
    if(phoneSpeech){if(!(window.SpeechRecognition||window.webkitSpeechRecognition))throw new Error('此手机浏览器不支持语音识别；请使用支持该功能的系统浏览器。');return;}
    const response=await fetch('/api/speech/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'系统识别授权尚未完成');
  },
  onState(phase){permissionPhase=phase;speechAuthorized=phase==='ready';updateSpeechControl();}
});
async function enableSpeech(){
  speechFeedback='';
  try{await voicePermissions.enable();nativeSpeechReady=true;speechFeedback=phoneSpeech?'麦克风已授权。按住朗读；手机语音服务可能需要联网。':'麦克风和系统识别已授权。选一句，按住麦克风录音。';}
  catch(error){speechFeedback=error.name==='NotAllowedError'?'麦克风权限被拒绝。请在设备与浏览器的隐私设置中允许麦克风，再点重新申请。':error.message;}
  updateSpeechControl();
}
try { best = Math.max(0, Number(localStorage.getItem('gulu-shooter-best')) || 0); } catch {}
$('#bestScore').textContent = best;

function tone(...args){if(soundOn)soundscape.tone(...args);}
function toast(text, time = 2200) {
  clearTimeout(toastTimer); $('#battleToast').textContent = text; $('#battleToast').classList.add('visible');
  toastTimer = setTimeout(() => $('#battleToast').classList.remove('visible'), time);
}
function addParticle(particle) {
  if(particles.length>=MAX_PARTICLES)particles.splice(0,particles.length-MAX_PARTICLES+1);
  particles.push(particle);
}
function puff(x, y, color, count = 10, text = '') {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 40 + Math.random() * 160;
    addParticle({ x, y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-50, color, life:.65+Math.random()*.3, max:1, size:3+Math.random()*5, text:i === 0 ? text : '' });
  }
}
function floatText(x,y,text,color='#fff9c2') {
  addParticle({x,y,vx:0,vy:-50,color,life:1.1,max:1.1,size:20,text});
}
const game = new GardenGame({ emit:onEvent });
if(window.GuluMobile?.active){game.learningMode='english';game.auto=true;$('#autoButton').setAttribute('aria-pressed','true');}
function lookupSentence(code){return game.customBank?.entries.find(e=>e.word===code)||findSentenceEntry(code);}
function lookupWord(code){return game.customBank?.entries.find(e=>e.word===code)||findWordEntry(code);}
const SAVE_KEY='gulu-run-v1', WRITER_KEY='gulu-run-writer-v1';
const writerId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
let availableSave=null,saveClock=0,saveProblem='';
function refreshSaveMenu(){
  $('#continueButton').hidden=!availableSave;
  $('#saveHint').hidden=!availableSave&&!saveProblem;
  $('#saveHint').textContent=availableSave?'第 '+availableSave.state.wave+' 波 · '+Object.values(availableSave.state.stacks).reduce((a,b)=>a+b,0)+' 张强化 · '+availableSave.state.score+' 分 · 保存在当前浏览器':saveProblem;
  $('#startButton').classList.toggle('new-run-button',!!availableSave);
  $('#startButton').textContent=availableSave?'重新开始一局':'出发！保卫小院 →';
}
function readSavedRun(){
  try{
    const raw=localStorage.getItem(SAVE_KEY);
    if(!raw){availableSave=null;saveProblem='';}
    else if(raw.length<2000000){const record=JSON.parse(raw);if(GuluSave.validate(record.run)){availableSave=record.run;saveProblem='';}else{availableSave=null;saveProblem='存档无法读取，暂未覆盖。可重新开始一局。';}}
    else{availableSave=null;saveProblem='存档无法读取，暂未覆盖。';}
  }catch{availableSave=null;saveProblem='当前浏览器无法读取存档。';}
  refreshSaveMenu();
}
function claimSave(){
  try{localStorage.setItem(WRITER_KEY,writerId);return true;}
  catch{saveProblem='浏览器未允许保存，当前进度无法自动存档。';toast(saveProblem,4000);return false;}
}
function persistRun(manual=false){
  if(!['playing','paused','upgrade'].includes(game.status))return false;
  try{
    if(localStorage.getItem(WRITER_KEY)!==writerId){if(manual)toast('这局已在另一个页面继续，请在那里存档。');return false;}
    const run=GuluSave.encode(game);if(!run)return false;
    localStorage.setItem(SAVE_KEY,JSON.stringify({writer:writerId,run}));availableSave=run;saveProblem='';saveClock=0;
    $('#saveButton').title='已自动保存 · 第 '+game.wave+' 波';refreshSaveMenu();
    if(manual)toast('已保存！下次点「继续上次冒险」就能接着玩。',2500);
    return true;
  }catch{saveProblem='保存失败：浏览器存储不可用或空间不足。';$('#saveButton').title=saveProblem;if(manual)toast(saveProblem,4000);return false;}
}
function finishSavedRun(){
  try{if(localStorage.getItem(WRITER_KEY)===writerId){localStorage.removeItem(SAVE_KEY);availableSave=null;saveProblem='';refreshSaveMenu();}}catch{}
}
function continueRun(){
  readSavedRun();if(!availableSave)return;
  if(!GuluSave.restore(game,availableSave)){toast('这份存档无法恢复，原存档暂未覆盖。');return;}
  if(window.GuluMobile?.active&&game.learningMode==='letters'){game.learningMode='english';game.typing=-1;for(let i=0;i<3;i++){game.skills[i].code=game.nextCode(i);game.skills[i].typed=0;game.skills[i].repeatsDone=0;}}
  claimSave();particles.length=0;$('#startScreen').hidden=true;$('#settingsPanel').open=false;
  $('#difficulty').value=game.learningMode!=='letters'?game.learningMode:'adaptive';$('#autoButton').setAttribute('aria-pressed',String(game.auto));updateFireControl();updateTypingControls();
  window.GuluLibraryUI?.restoreSelection(game.customBank);
  if(game.status==='upgrade')upgradeScreen();else game.resume();
  persistRun();updateHud(true);canvas.focus({preventScroll:true});toast('欢迎回来！继续守住第 '+game.wave+' 波。');
}
function returnHome(){
  if(['playing','paused','upgrade'].includes(game.status)&&!persistRun()){toast(saveProblem||'未能保存，请稍后重试。');return;}
  stopListening();game.shooting=false;game.status='ready';dialogResume=false;
  $('#gameDialog').close();$('#gameDialog').classList.remove('upgrade-dialog');$('#closeDialog').hidden=false;
  $('#settingsPanel').open=false;document.querySelector('#mobileSettingsDialog')?.close();
  $('#startScreen').hidden=false;readSavedRun();updateTypingControls();updateHud(true);
  $('#startButton').focus({preventScroll:true});
}
function rememberSpeechAttempt(target,text,error,meta={}){
  const attempts=speechAttempts.get(target.code)||[];attempts.push({at:new Date().toISOString(),text,error,audioId:meta?.audioId||null});speechAttempts.set(target.code,attempts.slice(-10));
  if(speechAttempts.size>30)speechAttempts.delete(speechAttempts.keys().next().value);
}
async function skipSpeechPrompt(){
  syncMobileSpeechTarget();const index=game.typing,skill=game.skills[index];
  if(game.status!=='playing'||game.learningMode!=='speaking'||!skill||skill.cd>0||microphone.phase!=='idle')return;
  const code=skill.code,entry=lookupSentence(code),attempts=speechAttempts.get(code)||[];
  game.pause();stopListening();
  try{
    if(window.GuluNative?.retainAudio)await GuluNative.retainAudio(attempts.map(a=>a.audioId).filter(Boolean));
    if(game.status!=='paused'||skill.code!==code)throw new Error('游戏状态已改变，请回到当前句子后重试。');
    reviewStore.add({id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),at:new Date().toISOString(),code,text:entry?.text||code,meaning:entry?.meaning||'',scene:entry?.scene||game.customBank?.name||'',level:game.englishLevel,wave:game.wave,attempts});
    game.resume();if(!game.skipSpeech(index)){speechFeedback='已记录到口语复盘；当前分组没有其他句子可换。';updateHud(true);return;}
    speechAttempts.delete(code);speechFeedback='已跳过并存入「口语复盘」，请朗读新句子。';persistRun();updateHud(true);
  }catch(error){if(game.status==='paused')game.resume();toast('未完成跳过：'+error.message,4500);updateHud(true);}
}
function openSpeechReview(){
  const settingsDialog=document.querySelector('#mobileSettingsDialog');if(settingsDialog?.open)settingsDialog.querySelector('.mobile-settings-header button').click();
  let records;try{records=reviewStore.list();}catch(e){toast(e.message);return;}
  const resume=game.status==='playing';if(resume)game.pause();stopListening();
  const dialog=document.createElement('dialog');dialog.className='speech-review-dialog';dialog.setAttribute('aria-label','口语复盘');
  const heading=document.createElement('h2');heading.textContent='口语复盘';dialog.append(heading);
  const note=document.createElement('p');note.textContent='这里标出识别文字与原句的差异，不是发音评分。先听示范，再回听录音；差异也可能来自漏读、环境噪声或识别服务。每句保留最近10次尝试，最多100条记录。记录保存在本机，卸载或清除数据会丢失。';dialog.append(note);
  const close=document.createElement('button');close.textContent='完成';close.className='primary-button';close.onclick=()=>dialog.close();dialog.append(close);
  if(!records.length){const empty=document.createElement('p');empty.textContent='还没有跳过的句子。口语练习卡住时，可以点“跳过并记录”。';dialog.append(empty);}
  for(const record of records){
    const card=document.createElement('section');card.className='review-record';
    const text=document.createElement('h3');text.textContent=record.text;card.append(text);
    const meaning=document.createElement('p');meaning.textContent=record.meaning;card.append(meaning);
    const detail=document.createElement('small');detail.textContent=new Date(record.at).toLocaleString()+' · 第'+record.wave+'波 · '+record.scene;card.append(detail);
    const example=document.createElement('button');example.textContent='听原句示范';example.onclick=()=>{if(!localSpeech.speak(record.text.replaceAll(' / ',' ')))toast('当前系统没有可用的英文朗读声音。');};card.append(example);
    if(!record.attempts.length){const p=document.createElement('p');p.textContent='本句未留下识别结果，暂时无法分析差异。';card.append(p);}
    record.attempts.forEach((attempt,i)=>{
      const row=document.createElement('div');row.className='review-attempt';const p=document.createElement('p');p.textContent='第'+(i+1)+'次：'+(attempt.text||attempt.error||'未识别到文字');row.append(p);
      if(attempt.text){const diff=document.createElement('p');diff.className='review-diff';GuluSpeechReview.compare(record.code,attempt.text).forEach(part=>{const span=document.createElement('span');span.className='diff-'+part.type;span.textContent=part.type==='same'?part.expected:part.type==='missing'?'未识别到 '+part.expected:part.type==='extra'?'多识别 '+part.heard:part.expected+' → '+part.heard;diff.append(span);});row.append(diff);}
      if(attempt.audioId&&window.GuluNative?.playAudio){const play=document.createElement('button');play.textContent='回听这次录音';play.onclick=()=>GuluNative.playAudio(attempt.audioId).catch(e=>toast(e.message));row.append(play);}
      else{const noAudio=document.createElement('small');noAudio.textContent='这次没有可回听的录音。';row.append(noAudio);}
      card.append(row);
    });
    const collect=document.createElement('button');collect.textContent='加入自定义句子组';collect.onclick=()=>window.GuluLibraryUI?.addSentence(record.text,record.meaning);card.append(collect);
    const remove=document.createElement('button');remove.textContent='删除这条记录';remove.onclick=()=>{try{reviewStore.remove(record.id);window.GuluNative?.deleteAudio?.(record.attempts.map(a=>a.audioId).filter(Boolean));card.remove();}catch(e){toast('删除失败：'+e.message);}};card.append(remove);dialog.append(card);
  }
  dialog.addEventListener('close',()=>{localSpeech.cancel();window.GuluNative?.stopAudio?.();dialog.remove();if(resume&&game.status==='paused')game.resume();updateHud(true);});
  document.body.append(dialog);dialog.showModal();
}
function saveMenu(){
  if(game.status==='upgrade'){persistRun(true);return;}
  if(!['playing','paused'].includes(game.status)){
    readSavedRun();toast(availableSave?'已有第 '+availableSave.state.wave+' 波存档，点击「继续上次冒险」。':'开始冒险后会每 2 秒自动保存。');return;
  }
  showDialog('<div class="dialog-icon">💾</div><h2>把冒险装进口袋</h2><p>自动保存波次、卡牌、护盾、敌人位置和施法进度。<br>存档保存在当前浏览器，刷新或关闭后可继续。</p><button class="primary-button" id="saveAndContinue">保存并继续 →</button><button class="secondary-button" id="saveAndExit">保存并返回开始画面</button>',true);
  $('#saveAndContinue').onclick=()=>{if(persistRun(true))closeDialog();};
  $('#saveAndExit').onclick=returnHome;
}
readSavedRun();
window.addEventListener('pagehide',()=>{persistRun();soundscape.stop();});
window.addEventListener('storage',event=>{
  if(event.key===WRITER_KEY&&event.newValue!==writerId&&['playing','paused','upgrade'].includes(game.status)){
    game.shooting=false;game.status='ready';soundscape.stop();dialogResume=false;
    if($('#gameDialog').open)$('#gameDialog').close();$('#gameDialog').classList.remove('upgrade-dialog');$('#closeDialog').hidden=false;
    $('#startScreen').hidden=false;readSavedRun();updateHud(true);toast('冒险已在另一个页面继续，本页已停止，避免覆盖存档。',4000);
  }else if(event.key===SAVE_KEY&&game.status==='ready')readSavedRun();
});

try {
  const saved=localStorage.getItem('gulu-fire-strength');
  if(saved!==null&&saved.trim()!==''&&Number.isFinite(Number(saved)))game.setFireStrength(Number(saved));
} catch {}
function updateFireControl(){
  const percent=Math.round(game.fireStrength*100);
  $('#fireStrength').value=percent;
  $('#fireStrengthValue').textContent=percent===0?'已关闭':percent+'%';
  $('#fireStrength').setAttribute('aria-valuetext',percent===0?'普通射击已关闭':percent===100?'100%，原版火力':percent+'% 射速');
  $('#aimHint').textContent=percent===0?'✧ 普通射击已关闭 · 敲字母放大招':game.auto?'✦ 自动瞄准中 · 双手专心放大招':'⌖ 鼠标瞄准 · 按住左键连续射击';
  if($('#settingsSummary'))$('#settingsSummary').textContent=($('#difficulty').selectedOptions[0]?.textContent||'游戏')+' · 火力 '+percent+'%';
}
$('#fireStrength').addEventListener('input',event=>{
  game.setFireStrength(Number(event.target.value)/100);updateFireControl();
  try{localStorage.setItem('gulu-fire-strength',String(game.fireStrength));}catch{}
});
updateFireControl();
try {
  const prefs=JSON.parse(localStorage.getItem('gulu-typing-settings'));
  if(prefs){if(typeof prefs.maxSpellLength==='number')game.setMaxSpellLength(prefs.maxSpellLength);if(typeof prefs.maxLearningLoad==='number')game.setMaxLearningLoad(prefs.maxLearningLoad);if(Number.isInteger(prefs.englishLevel)&&prefs.englishLevel>=0&&prefs.englishLevel<=4)game.englishLevel=prefs.englishLevel;if(typeof prefs.magicSlow==='boolean')game.magicSlow=prefs.magicSlow;}
}catch{}
function updateTypingControls(){
  const mode=$('#difficulty').value,english=['english','sentences','speaking'].includes(mode),speaking=mode==='speaking';
  if($('#sentenceSpace'))$('#sentenceSpace').hidden=!['english','sentences'].includes(mode);
  document.querySelectorAll('.word-punctuation').forEach(b=>b.hidden=!['english','sentences'].includes(mode));
  window.GuluLibraryUI?.refresh();
  const labels=['sentences','speaking'].includes(mode)?DIALOGUE_STAGES.map(s=>s.name+' · '+s.groups+'组 / '+s.sentences+'句'):ENGLISH_STAGES.map(s=>s.name+' · '+s.count+'词');
  [...$('#englishLevel').options].forEach((o,i)=>o.textContent=labels[i]);
  const custom=game.status==='ready'?window.GuluLibraryUI?.selected():game.customBank;
  $('#englishControl').hidden=!english||Boolean(custom);$('#learningLoadControl').hidden=!english||custom?.kind==='sentence';$('.spell-control').hidden=english;
  $('#speechControl').hidden=!speaking;$('.keyboard-toggle-row').hidden=speaking;$('#touchKeyboard').hidden=speaking||$('#keyboardButton').getAttribute('aria-expanded')!=='true';
  $('#englishLevel').value=String(game.englishLevel);
  $('#maxSpellLength').value=game.maxSpellLength;$('#maxSpellLengthValue').textContent=game.maxSpellLength;
  $('#maxLearningLoad').value=game.maxLearningLoad;$('#maxLearningLoadValue').textContent=game.maxLearningLoad+(mode==='english'?' 遍':' 句');$('#learningLoadHelp').textContent=mode==='english'?'每 3 波增加 1 遍，最多 '+game.maxLearningLoad+' 遍':'每 3 波增加 1 句，最多 '+Math.min(3,game.maxLearningLoad)+' 句连贯上下文';
  $('#maxSpellLength').setAttribute('aria-valuetext','最多 '+game.maxSpellLength+' 个字母，下一组提示生效');
  $('#magicSlowButton').setAttribute('aria-checked',String(game.magicSlow));$('#magicSlowValue').textContent=game.magicSlow?'开':'关';
  $('#settingsSummary').textContent=($('#difficulty').selectedOptions[0]?.textContent||'游戏')+' · 火力 '+Math.round(game.fireStrength*100)+'%';
}
function syncMobileSpeechTarget(){
  if(!phoneSpeech||game.learningMode!=='speaking'||!['playing','paused'].includes(game.status))return;
  const visible=document.querySelector('.skill-card.iphone-visible');
  const index=Number(visible?.dataset.skill??document.body.dataset.visibleSkill??0);
  if(!Number.isInteger(index)||index<0||index>2||game.typing===index)return;
  const previous=game.typing;game.typing=index;
  if(previous>=0){speechFeedback='';stopListening();}
}
document.addEventListener('gulu-visible-skill',()=>{syncMobileSpeechTarget();updateHud(true);});
function updateSpeechControl(){
  const selected=game.learningMode==='speaking'&&game.typing>=0?game.skills[game.typing]:null;
  const ready=game.status==='playing'&&selected&&selected.cd<=0,phase=microphone.phase;
  const granting=['microphone','system'].includes(permissionPhase);
  $('#speechSkip').disabled=!ready||phase!=='idle';
  $('#speechEnable').hidden=speechAuthorized;$('#speechEnable').disabled=granting;
  $('#speechEnable').textContent=permissionPhase==='microphone'?'请允许浏览器使用麦克风…':permissionPhase==='system'?'正在授权／准备英文语音资源…':permissionPhase==='error'?'重新申请语音权限':'启用语音权限';
  $('#speechButton').disabled=!ready||!nativeSpeechReady||!speechAuthorized||phase==='recognizing';
  $('#speechButton').classList.toggle('listening',phase==='recording');$('#speechButton').setAttribute('aria-pressed',String(microphone.held));
  $('#speechExample').disabled=!ready||granting||phase!=='idle'||!localSpeech.available();
  $('#speechButtonLabel').textContent=phase==='preparing'?'正在准备／等待系统授权…':phase==='recording'?'正在录音 · 松开识别':phase==='recognizing'?'录音已停止 · 正在识别':!speechAuthorized?'先启用语音权限':!ready?(phoneSpeech&&selected?'当前大招充能中':'先选择一张大招卡'):'按住麦克风说话';
  $('#speechTranscript').textContent=permissionPhase==='microphone'?'正在申请麦克风权限。此步骤不录制、不上传语音。':permissionPhase==='system'?'麦克风权限已通过。请允许系统识别；首次可能需要下载 Apple 英文识别资源，请保持页面打开。':phase==='recording'?'麦克风已开启，松开后立即停止录音，最多30秒。':phase==='recognizing'?(phoneSpeech?'正在用手机语音服务识别，匹配成功后自动放招。':'正在用 Mac 系统识别，匹配成功后自动放招。'):phase==='preparing'?'首次使用请允许系统语音识别和麦克风权限；授权后重新按住按钮。':speechFeedback||(phoneSpeech?'朗读当前卡片 → 按住录音 → 松开识别；点上方技能可切换。':'选一句 → 按住录音 → 松开停止并自动识别。');
  const last=selected?(speechAttempts.get(selected.code)||[]).at(-1):null;
  const diffs=last?.text?GuluSpeechReview.compare(selected.code,last.text).filter(p=>p.type!=='same'):[];
  const diffBox=$('#speechDiff');diffBox.hidden=!diffs.length;
  const signature=JSON.stringify(diffs);if(diffBox.dataset.signature!==signature){diffBox.dataset.signature=signature;diffBox.replaceChildren();for(const part of diffs){const item=document.createElement('span');item.textContent=part.type==='missing'?'未识别到：'+part.expected:part.type==='extra'?'多识别：'+part.heard:part.expected+' → 识别成 '+part.heard;diffBox.append(item);}}
  $('#speechExample').title=localSpeech.available()?'使用本地英文声音示范':'请在系统语音设置中添加英文声音';
}
function stopListening(){localSpeech.cancel();microphone.cancel();listening=false;speechHeld=false;}
function startListening(event){
  syncMobileSpeechTarget();
  if(event?.button!==undefined&&event.button!==0)return;
  if(!nativeSpeechReady||!speechAuthorized||game.learningMode!=='speaking'||game.status!=='playing'||game.typing<0)return;
  event?.preventDefault();if(event?.pointerId!==undefined)$('#speechButton').setPointerCapture(event.pointerId);
  localSpeech.cancel();speechFeedback='';microphone.start({index:game.typing,code:game.skills[game.typing].code});
}
function saveTypingSettings(){
  try{localStorage.setItem('gulu-typing-settings',JSON.stringify({maxSpellLength:game.maxSpellLength,maxLearningLoad:game.maxLearningLoad,magicSlow:game.magicSlow,englishLevel:game.englishLevel}));}catch{}
  persistRun();updateTypingControls();updateHud(true);
}
$('#maxLearningLoad').addEventListener('input',event=>{game.setMaxLearningLoad(event.target.value);saveTypingSettings();});
$('#maxSpellLength').addEventListener('input',event=>{game.setMaxSpellLength(event.target.value);saveTypingSettings();});
$('#englishLevel').onchange=()=>{game.englishLevel=Number($('#englishLevel').value);saveTypingSettings();};
$('#magicSlowButton').onclick=()=>{game.magicSlow=!game.magicSlow;saveTypingSettings();};
updateTypingControls();
function onEvent(type, data = {}) {
  if(['start','pause','upgrade','finish'].includes(type)){soundscape.stop();stopListening();}
  if(type==='nibble')soundscape.play('nibble',data);
  if(type==='critical')soundscape.play('critical',data);
  if(['start','wave','upgrade','pause'].includes(type))persistRun();
  if (type === 'upgrade') { upgradeScreen(); }
  if(type==='nibble')puff(data.x,data.y,'#ffd945',data.removed?18:6,data.removed?'':'咔嚓');
  if (type === 'critical') { floatText(data.x,data.y-28,'暴击！','#ffdd8a'); }
  if (type === 'heal') { puff(data.x,data.y,'#b9ffa0',8,'+'); }
  if (type === 'shot') { recoil = .1; soundscape.play('shot',{x:game.hero.x}); }
  if (type === 'hit') { if(!['poison','thorns'].includes(data.kind))soundscape.play(data.surface||'flesh',data);puff(data.x,data.y,'#e3f8a3',4); }
  if (type === 'kill') {
    puff(data.x,data.y,'#fff4a0',15); floatText(data.x,data.y-20,'+'+data.score);
    soundscape.play(data.boss?'boss':'kill',data);
  }
  if (type === 'letter') { tone([659.25,783.99,880,987.77,1174.66][game.skills[data.index].typed%5],.055,'sine',.018); }
  if (type === 'wrong') {
    toast(data.expected ? '没关系，接着敲 '+(data.expected===' '?'空格':data.expected)+' 就好 ✧' : '大招正在充能，先突突突！', 1600);
    tone(270,.09,'sine',.025,350);
    const card = document.querySelector('.skill-card.selected');
    if(card){card.classList.remove('wrong');void card.offsetWidth;card.classList.add('wrong');}
  }
  if (type === 'typing') { toast(GuluModeCopy.practiceCopy(game.learningMode,{mobile:phoneSpeech}).action,2200); }
  if(type==='repeat'){toast('很好！再输入 '+(data.total-data.done)+' 遍就能释放大招 ✦',1800);}
  if(type==='speech'){
    if(data.matched){speechFeedback='朗读内容匹配成功！';$('#speechTranscript').textContent=speechFeedback;tone(720,.16,'sine',.04,980);}
    else{const heard=data.heard?data.heard.toLowerCase():'没有听清';speechFeedback='识别成：'+heard+' · 请再试一次';$('#speechTranscript').textContent=speechFeedback;toast('识别文字没有匹配当前句子，可以再朗读一次。',3000);tone(270,.09,'sine',.025,350);}
  }
  if (type === 'cooldown') { toast('还要 '+Math.ceil(game.skills[data.index].cd/game.rechargeRate)+' 秒，先用豌豆突突突',1400); }
  if (type === 'empty') { toast('僵尸还没到，不浪费你的大招～'); }
  if (type === 'cast') {
    const icons = ['🌈','❄️','🍉'];
    const banner = $('#castBanner'); banner.textContent = icons[data.index]+' '+data.name+'！';
    banner.classList.remove('show');void banner.offsetWidth;banner.classList.add('show');
    clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>banner.classList.remove('show'),1000);
    if(data.index===0){soundscape.play('laser',{x:game.hero.x});shake=.35;}
    if(data.index===1){soundscape.play('freeze');toast('冻住啦！'+(6+1.5*game.stack('permafrost'))+' 秒内豌豆伤害提升 ❄',2400);}
    if(data.index===2)soundscape.play('melon');
  }
  if (type === 'explosion') { puff(data.x,data.y,'#ffd98a',45,'BOOM!');soundscape.play('explosion',data);shake=.55; }
  if (type === 'breach') { shake=.3;soundscape.play('warning');toast(game.health<=0?'向日葵全倒了！3 秒内修复防线或清场！':'向日葵正在被啃食！快保护它们！'); }
  if (type === 'wave') { toast(data.wave===1?GuluModeCopy.practiceCopy(game.learningMode,{mobile:phoneSpeech}).action:'第 '+data.wave+' 波来啦！强化生效，僵尸也变强了！',2800); }
  if (type === 'clear') { toast('这波守住啦！歇一口气，下一波马上来 ✦',2700);tone(660,.25,'sine',.04,880); }
  if (type === 'boss') { soundscape.play('boss',{x:950});toast('大个子来串门！用冰冻和西瓜招呼它！',3500); }
  if (type === 'finish') { finishSavedRun();finishScreen(data.win); }
}

function spellKeysMarkup(skill,active){
  const rows=[];
  const totalRows=Math.ceil(skill.code.length/6);
  const currentRow=Math.min(totalRows-1,Math.floor(skill.typed/6));
  const firstRow=Math.min(currentRow,Math.max(0,totalRows-2));
  for(let start=firstRow*6;start<Math.min(skill.code.length,(firstRow+2)*6);start+=6){
    rows.push('<span class="spell-row">'+[...skill.code.slice(start,start+6)].map((letter,offset)=>{
      const i=start+offset;return '<kbd class="'+(i<skill.typed?'typed':active&&i===skill.typed?'next':'')+'">'+(letter===' '?'␣':letter)+'</kbd>';
    }).join('')+'</span>');
  }
  return rows.join('');
}
function updateHud(force=false) {
  syncMobileSpeechTarget();
  document.body.dataset.gameState=game.status;document.body.dataset.learningMode=game.learningMode;
  const values = JSON.stringify([game.health,game.maxHealth,game.learningMode,game.englishLevel,game.stacks,game.wave,game.kills,game.score,game.status,game.spawned,game.typing,game.freeze>0,Math.ceil((3-game.breachElapsed)*10),game.magicSlow,game.maxSpellLength,game.maxLearningLoad,listening,game.skills.map(s=>[s.code,s.typed,Math.ceil(s.cd*10)])]);
  if(!force && values===lastHud)return;lastHud=values;
  document.body.classList.toggle('in-run',game.status!=='ready');
  $('#score').textContent=game.score;
  $('#upgradeCount').textContent=Object.values(game.stacks).reduce((a,b)=>a+b,0);
  $('#runDifficulty').textContent='第 '+game.wave+' 波 · '+game.quota+' 只来袭 · 敌人生命 ×'+Math.pow(1.19,game.wave-1).toFixed(1);
  const owned=GARDEN_CARDS.filter(c=>game.stack(c.id));
  $('#runBuild').textContent=owned.length?owned.slice(-4).map(c=>c.icon+' ×'+game.stack(c.id)).join('  '):'击退整波，选择一张强化卡';
  $('#waveTitle').textContent=game.wave%5===0?'首领来袭':game.wave>=4?'无尽捣蛋军团':'阳光小院';
  $('#waveSubtitle').textContent=game.status==='ready'?'准备迎接第 1 波':'第 '+game.wave+' 波 · 已击退 '+game.kills+' 只';
  $('.level-badge').textContent=String(game.wave).padStart(2,'0');
  $('#hearts').innerHTML=Array.from({length:Math.min(12,game.maxHealth)},(_,i)=>'<span class="heart '+(i<game.health?'':'empty')+'" aria-hidden="true">♥</span>').join('')+'<small class="health-number">'+Number(game.health.toFixed(1))+'/'+game.maxHealth+'</small>';
  $('#hearts').setAttribute('aria-label','向日葵防御 '+Number(game.health.toFixed(1))+' / '+game.maxHealth);
  $('#waveProgressText').textContent='第 '+game.wave+' 波 · ∞';
  $('#waveFill').style.width=Math.min(100,(game.spawned-game.enemies.length)/game.quota*100)+'%';
  $('#pauseButton').disabled=game.status!=='playing';$('#homeButton').hidden=game.status==='ready';
  $('#difficulty').disabled=['playing','paused','upgrade'].includes(game.status);
  $('#fieldStatus').textContent=game.status==='ready'?'小院准备就绪':game.status==='lost'?'向日葵防线已突破':game.health<=0?'防线告急 · '+Math.max(0,3-game.breachElapsed).toFixed(1)+' 秒':game.freeze>0?'全场冰冻中 · 伤害翻倍':game.waveBreak>0?'这波守住啦':'小院保卫战进行中';
  $('#arsenalNote').textContent=game.learningMode==='speaking'?(game.typing>=0?'按住录音，松开识别':'选择大招，再按住麦克风'):game.typing>=0?(game.typingSlow?'慢动作中 · ':'自动换行 · ')+'已完成 '+game.skills[game.typing].typed+' / '+game.skills[game.typing].code.length+' 字母'+(game.learningMode==='english'?' · 第 '+(game.skills[game.typing].repeatsDone+1)+'/'+game.learningLoad+' 遍':''):'回蓝速度 ×'+game.rechargeRate.toFixed(2);
  $('#progressHint').textContent=game.learningMode==='sentences'?'输入英文句子 · ␣ 代表空格 · 不区分大小写，无需标点 · 下组生效':game.learningMode==='english'?(game.customBank?game.customBank.name+' · '+game.customBank.entries.length+'条自定义词句':ENGLISH_STAGES[game.englishLevel].name+' · '+ENGLISH_STAGES[game.englishLevel].count+'词')+' · 按显示输入空格和标点':game.learningMode==='speaking'?'朗读 '+Math.min(3,game.learningLoad)+' 句连贯对话后释放大招':game.adaptive?'本波新提示 '+game.spellLength+' 个字母 · 只显示当前两行，自动跟随输入':'';
  document.querySelectorAll('.skill-card').forEach((card,index)=>{
    const s=game.skills[index],sentence=['sentences','speaking'].includes(game.learningMode),speaking=game.learningMode==='speaking',learning=game.learningMode!=='letters';
    const entry=sentence?lookupSentence(s.code):game.learningMode==='english'?lookupWord(s.code):null;
    let contextLabel=card.querySelector('.dialogue-context');if(!contextLabel){contextLabel=document.createElement('span');contextLabel.className='dialogue-context';card.querySelector('.skill-info').prepend(contextLabel);}
    contextLabel.hidden=!sentence||!entry?.scene;contextLabel.textContent=entry?.scene||'';
    contextLabel.title=entry?.scene?[entry.reference,entry.goal,entry.grammar].join(' · '):'';
    card.classList.toggle('learning-card',learning);card.classList.toggle('sentence-card',sentence);card.classList.toggle('speaking-card',speaking);
    card.querySelector('.skill-info strong').textContent=sentence?(entry?.text||s.code):s.name;
    $('#wordMeaning'+index).hidden=!learning;$('#wordMeaning'+index).textContent=learning?(entry?.meaning||''):'';
    $('#wordIpa'+index).hidden=game.learningMode!=='english';$('#wordIpa'+index).textContent=entry?.ipa?'音标 /'+entry.ipa+'/':'';
    card.querySelector('.skill-info').title=learning?[entry?.text||s.code,entry?.meaning,entry?.ipa?'音标 /'+entry.ipa+'/':'',entry?.goal,entry?.grammar].filter(Boolean).join(' · '):s.name;
    card.classList.toggle('selected',game.typing===index);card.classList.toggle('cooling',s.cd>0);
    card.setAttribute('aria-label',s.name+'，'+(entry?.meaning?entry.meaning+'，':'')+(s.cd>0?'回蓝中 '+Math.ceil(s.cd/game.rechargeRate)+' 秒':speaking?'选择并朗读 '+s.code:'依次输入 '+s.code));
    $('#skillKeys'+index).hidden=speaking;$('#skillKeys'+index).innerHTML=speaking?'':spellKeysMarkup(s,game.typing===index);
    card.classList.toggle('long-spell',s.code.length>6);
    $('#skillStatus'+index).textContent=s.cd>0?Math.ceil(s.cd/game.rechargeRate)+' 秒回蓝':speaking?(phoneSpeech&&game.typing===index?'当前朗读目标 · 按住录音':game.typing===index?'已选择 · 按住录音':'点击选择这句'):game.typing===index?'第 '+(Math.floor(s.typed/6)+1)+' / '+Math.ceil(s.code.length/6)+' 行 · '+s.typed+'/'+s.code.length:'准备好啦 · '+s.code.length+' 字母';
    $('#cooldown'+index).style.width=(1-s.cd/s.duration)*100+'%';
  });
  updateSpeechControl();
  const hints=GuluMobile.keySkillHints(game.skills,game.typing,game.learningMode);
  const names=['激光','冰冻','西瓜'];
  document.querySelectorAll('.touch-key').forEach(button=>{
    const index=hints[button.dataset.key],hint=index!==undefined;
    button.classList.toggle('hint',hint);
    if(hint){button.dataset.hintSkill=String(index);button.dataset.skillLabel=names[index];}
    else{delete button.dataset.hintSkill;delete button.dataset.skillLabel;}
    button.setAttribute('aria-label',(button.dataset.key===' '?'空格':button.dataset.key)+(hint?'，'+names[index]+'的下一个字母':''));
  });
}

function drawEmoji(text,x,y,size,angle=0) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#ffffff';ctx.font=size+'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,0,0);ctx.restore();
}
// Articulated rendering of the existing transparent sprite. All joints move
// with each enemy's simulation clock, so pause and freeze agree.
// Separate the two original legs along their actual silhouettes, then animate
// hip and knee joints. The old vertical image split cut across both legs.
function drawWalkingSpriteMesh(pen,z,size){
  const phase=z.gait??z.phase,amount=reducedMotion?.45:1;
  const rear=[[.57,.64],[.73,.64],[.78,.76],[.91,.85],[.92,1],[.60,1],[.58,.87],[.59,.78],[.55,.71]];
  const front=[[.42,.64],[.59,.64],[.62,.72],[.55,.81],[.60,.88],[.64,1],[.22,1],[.22,.84],[.39,.79],[.40,.71]];
  pen.save();pen.translate(-size/2,-size*.59);pen.scale(size,size);
  function paintPart(polygon,from,to){
    pen.save();pen.beginPath();polygon.forEach(([x,y],i)=>i?pen.lineTo(x,y):pen.moveTo(x,y));pen.closePath();pen.clip();
    pen.beginPath();pen.rect(0,from,1,to-from);pen.clip();
    pen.drawImage(sprite,0,0,1,1);pen.restore();
  }
  function leg(polygon,hip,knee,step){
    const swing=Math.sin(step)*.43*amount;
    const bend=Math.max(0,Math.cos(step))*.48*amount;
    pen.save();pen.translate(hip[0],hip[1]);pen.rotate(swing);pen.translate(-hip[0],-hip[1]);
    paintPart(polygon,0,knee[1]+.018);
    pen.translate(knee[0],knee[1]);pen.rotate(-bend);pen.translate(-knee[0],-knee[1]);
    paintPart(polygon,knee[1]-.005,1);pen.restore();
  }
  leg(rear,[.66,.665],[.71,.80],phase+Math.PI);
  leg(front,[.515,.665],[.48,.80],phase);
  // Torso overlaps the hip joints while the head and reaching arms sway subtly.
  pen.save();pen.translate(.58,.66);pen.rotate(Math.sin(phase-.3)*.025*amount);pen.translate(-.58,-.66);
  const width=sprite.naturalWidth,height=sprite.naturalHeight||width;
  pen.drawImage(sprite,0,0,width,height*.674,0,0,1,.674);pen.restore();pen.restore();
}
let walkAtlas = null;
const WALK_FRAMES=32, WALK_CELL=128;
function drawWalkingSprite(z,size,dead){
  if(dead){ctx.drawImage(sprite,-size/2,-size*.59,size,size);return;}
  if(!walkAtlas){
    walkAtlas=document.createElement('canvas');walkAtlas.width=WALK_CELL*WALK_FRAMES;walkAtlas.height=WALK_CELL;
    const pen=walkAtlas.getContext('2d');
    for(let frame=0;frame<WALK_FRAMES;frame++){
      pen.save();pen.translate(frame*WALK_CELL+64,76);
      drawWalkingSpriteMesh(pen,{gait:frame/WALK_FRAMES*Math.PI*2},96);pen.restore();
    }
  }
  const phase=((z.gait??z.phase)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
  const frame=Math.floor(phase/(Math.PI*2)*WALK_FRAMES);
  const scale=size/96;
  ctx.drawImage(walkAtlas,frame*WALK_CELL,0,WALK_CELL,WALK_CELL,-64*scale,-76*scale,WALK_CELL*scale,WALK_CELL*scale);
}
function drawZombie(z,dead=false) {
  const size=z.boss?145:z.type==='mini'?55:z.tough?102:88;
  const gait=z.gait??z.phase,amplitude=reducedMotion?.3:1;
  const bob=dead?0:z.eating&&game.freeze<=0?Math.sin(game.time*12)*2:(Math.cos(gait*2)*1.5+Math.sin(gait)*.8)*amplitude;
  // The shadow stays on the ground while feet alternately lift and drag.
  ctx.save();ctx.translate(z.x,z.y);
  ctx.fillStyle='#334c2529';ctx.beginPath();ctx.ellipse(0,size*.39,size*.3,8,0,0,Math.PI*2);ctx.fill();
  ctx.translate(0,bob*size/88);
  if(dead){const elapsed=1-z.life/z.fullLife;ctx.globalAlpha=1-elapsed;ctx.rotate(elapsed*1.6);ctx.translate(elapsed*65,-Math.sin(elapsed*Math.PI)*65);ctx.scale(1-elapsed*.45,1-elapsed*.45);}
  else {
    ctx.translate(0,size*.28);ctx.rotate((-.035+Math.sin(gait-.35)*.055)*amplitude);ctx.translate(0,-size*.28);
  }
  if(z.hit>0)ctx.filter='brightness(1.5)';
  else if(game.freeze>0)ctx.filter='hue-rotate(100deg) saturate(.7) brightness(1.1)';
  else ctx.filter={armor:'saturate(.45)',runner:'hue-rotate(300deg)',shield:'hue-rotate(60deg)',healer:'hue-rotate(330deg)',splitter:'hue-rotate(120deg)',bomber:'hue-rotate(240deg)',boss:'hue-rotate(310deg) saturate(1.5)',mini:'hue-rotate(110deg)'}[z.type]||'none';
  if(sprite.complete&&sprite.naturalWidth)drawWalkingSprite(z,size,dead);
  else drawEmoji('🧟',0,0,size*.75);
  ctx.filter='none';
  if(!dead){
    const spec=ZOMBIE_TYPES[z.type];if(spec?.icon)drawEmoji(spec.icon,8,-size*.59,z.boss?34:25);
    if(z.type!=='walker'&&z.type!=='mini'){ctx.font='bold 10px system-ui';ctx.textAlign='center';ctx.fillStyle='#fff';ctx.strokeStyle='#344d3acc';ctx.lineWidth=3;ctx.strokeText(spec.name,0,size*.56);ctx.fillText(spec.name,0,size*.56);}
    if(z.shield>0){ctx.strokeStyle='#dcddff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-4,size*.48,Math.PI*.5,Math.PI*1.5);ctx.stroke();}
    if(z.poisonTime>0)drawEmoji('☠️',-size*.35,0,17);
  }
  if(!dead&&game.freeze>0){ctx.fillStyle='#c9f1ff30';ctx.strokeStyle='#dbfaffbb';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-size*.34,-size*.46,size*.7,size*.86,10);ctx.fill();ctx.stroke();drawEmoji('❄️',size*.24,-size*.3,17);}
  if(!dead&&(z.hp<z.maxHp||z.boss||z.tough)){
    ctx.fillStyle='#314b4169';ctx.beginPath();ctx.roundRect(-size*.31,-size*.67,size*.62,5,3);ctx.fill();
    ctx.fillStyle=z.boss?'#e8b061':'#d9f590';ctx.beginPath();ctx.roundRect(-size*.31,-size*.67,size*.62*Math.max(0,z.hp/z.maxHp),5,3);ctx.fill();
  }
  ctx.restore();
}
// Build a reusable cutout once; never allocate a new sprite canvas per frame.
let captainCutout=null;
function getCaptainCutout(){
  if(captainCutout)return captainCutout;
  const layer=document.createElement('canvas');layer.width=512;layer.height=512;
  const pen=layer.getContext('2d');pen.drawImage(captainSprite,0,0,512,512);
  const pixels=pen.getImageData(0,0,512,512),data=pixels.data;
  // This generated backdrop is neutral white/gray; the character is saturated green/brown.
  for(let i=0;i<data.length;i+=4){
    const lo=Math.min(data[i],data[i+1],data[i+2]),hi=Math.max(data[i],data[i+1],data[i+2]);
    if(lo>175&&hi-lo<30)data[i+3]=0;
  }
  pen.putImageData(pixels,0,0);captainCutout=layer;return layer;
}
function drawSunflowerDefense(){
  for(let i=0;i<8;i++){
    const x=155,y=110+i*48,full=game.maxHealth/8,hp=game.flowerHealth[i],ratio=hp/full;
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='#49371d66';ctx.beginPath();ctx.ellipse(0,18,17,6,0,0,Math.PI*2);ctx.fill();
    if(hp>0){
      const sway=reducedMotion?0:Math.sin(game.time*2+i)*.045;
      ctx.rotate(sway+(1-ratio)*.22);ctx.strokeStyle=ratio<.4?'#8a823b':'#36792d';ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(0,15);ctx.lineTo(0,-4);ctx.stroke();
      ctx.fillStyle='#65b93d';ctx.beginPath();ctx.ellipse(-7,8,9,4,-.5,0,Math.PI*2);ctx.fill();
      const petals=Math.max(2,Math.ceil(ratio*10));
      for(let p=0;p<petals;p++){const a=p/10*Math.PI*2;ctx.save();ctx.rotate(a);ctx.fillStyle=ratio<.4?'#cf9d3c':'#ffda42';ctx.beginPath();ctx.ellipse(0,-13,5,10,0,0,Math.PI*2);ctx.fill();ctx.restore();}
      ctx.fillStyle='#80532e';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff5b9';ctx.beginPath();ctx.arc(-3,-2,1.4,0,Math.PI*2);ctx.arc(3,-2,1.4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#3d281b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,1,4,0,Math.PI);ctx.stroke();
      if(ratio<.999){ctx.fillStyle='#3b332a';ctx.fillRect(-15,23,30,3);ctx.fillStyle='#ffc955';ctx.fillRect(-15,23,30*ratio,3);}
    }else{ctx.strokeStyle='#88754b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,17);ctx.lineTo(2,10);ctx.stroke();}
    ctx.restore();
  }
}
function drawHero() {
  const target=game.target();const angle=Math.atan2(target.y-game.hero.y,target.x-game.hero.x);
  ctx.save();ctx.globalAlpha=1;ctx.filter='none';ctx.translate(game.hero.x,game.hero.y);
  ctx.fillStyle='#28452040';ctx.beginPath();ctx.ellipse(-5,39,31,8,0,0,Math.PI*2);ctx.fill();
  if(captainSprite.complete&&captainSprite.naturalWidth){
    ctx.save();ctx.translate(game.shotKick>0?-3:0,0);
    ctx.rotate(Math.max(-.10,Math.min(.10,angle*.15)));
    ctx.drawImage(getCaptainCutout(),-70,-84,134,134);ctx.restore();
  }else drawEmoji('🌱',-8,0,95);
  ctx.font='bold 11px system-ui';ctx.fillStyle='#f8ffed';ctx.textAlign='center';ctx.shadowColor='#39522b';ctx.shadowBlur=4;ctx.fillText('豌豆队长',-4,56);ctx.restore();
  if(game.status==='playing'){
    ctx.save();ctx.strokeStyle='#ffffdc99';ctx.lineWidth=2;ctx.setLineDash([4,7]);
    ctx.beginPath();const muzzle=game.muzzle();ctx.moveTo(muzzle.x,muzzle.y);ctx.lineTo(target.x,target.y);ctx.globalAlpha=.17;ctx.stroke();ctx.restore();
    ctx.save();ctx.translate(target.x,target.y);ctx.strokeStyle='#ffffe9d9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-20,0);ctx.lineTo(-8,0);ctx.moveTo(8,0);ctx.lineTo(20,0);ctx.moveTo(0,-20);ctx.lineTo(0,-8);ctx.moveTo(0,8);ctx.lineTo(0,20);ctx.stroke();ctx.restore();
  }
}
function drawEffects() {
  for(const e of game.effects){
    const progress=1-e.life/e.fullLife;
    if(e.kind==='laser'){
      ctx.save();ctx.translate(game.hero.x,game.hero.y);ctx.rotate(e.angle);ctx.globalAlpha=Math.min(1,e.life*3);ctx.lineCap='round';
      ['#d4a6ff99','#b1eeffbb','#fff59fcc','#ffffffff'].forEach((color,i)=>{ctx.strokeStyle=color;ctx.lineWidth=[110,72,38,13][i]*((e.width||85)/85);ctx.shadowBlur=20;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(30,0);ctx.lineTo(1150,0);ctx.stroke();});ctx.restore();
    }
    if(e.kind==='freeze'){
      ctx.save();ctx.strokeStyle='#ddfaff';ctx.lineWidth=7*(1-progress);ctx.globalAlpha=1-progress;ctx.beginPath();ctx.arc(500,270,progress*650,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#c5f0ff';ctx.globalAlpha=(1-progress)*.16;ctx.fillRect(0,0,1000,530);ctx.restore();
    }
    if(e.kind==='melon'){
      ctx.save();ctx.strokeStyle='#ffeaa1';ctx.fillStyle='#fff2b032';ctx.lineWidth=3;ctx.setLineDash([7,8]);ctx.beginPath();ctx.ellipse(e.x,e.y,160,55,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      drawEmoji('🍉',e.x,e.y-(1-progress)*520,65+progress*65,progress*3);
    }
    if(e.kind==='explosion'){
      ctx.save();ctx.globalAlpha=(1-progress)*.7;ctx.fillStyle='#fff7a9';ctx.strokeStyle='#ffb15f';ctx.lineWidth=15*(1-progress);ctx.beginPath();ctx.arc(e.x,e.y,25+progress*230,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      if(progress<.4)drawEmoji('💥',e.x,e.y,160+progress*150);
    }
  }
}
function render(dt) {
  ctx.clearRect(0,0,1000,530);ctx.save();
  if(shake>0&&!reducedMotion)ctx.translate((Math.random()-.5)*shake*12,(Math.random()-.5)*shake*8);
  drawSunflowerDefense();
  if(game.freeze>0){ctx.fillStyle='#b4e9ff24';ctx.fillRect(0,0,1000,530);}
  [...game.enemies].sort((a,b)=>a.y-b.y).forEach(z=>drawZombie(z));
  game.dead.forEach(z=>drawZombie(z,true));
  for(const b of game.bullets){
    ctx.save();ctx.strokeStyle='#e6fa7ab0';ctx.lineWidth=5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(b.x-b.vx*.018,b.y-b.vy*.018);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.fillStyle='#e5ff77';ctx.shadowColor='#f0ffaa';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(b.x,b.y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#faffd6';ctx.beginPath();ctx.arc(b.x-1,b.y-2,2,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  drawEffects();
  drawHero();
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];if(game.status!=='paused'){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(!p.text)p.vy+=190*dt;}
    if(p.life<=0){particles.splice(i,1);continue;}
    ctx.save();ctx.globalAlpha=Math.min(1,p.life/p.max*1.8);ctx.fillStyle=p.color;
    if(p.text){ctx.font='900 '+p.size+'px system-ui';ctx.textAlign='center';ctx.shadowColor='#46612766';ctx.shadowBlur=5;ctx.fillText(p.text,p.x,p.y);}
    else{ctx.beginPath();ctx.arc(p.x,p.y,p.size*Math.min(1,p.life*3),0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  ctx.restore();recoil=Math.max(0,recoil-dt);shake=Math.max(0,shake-dt);
}
function frame(time) {
  const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;
  game.update(dt);soundscape.update(dt,game);render(dt);if(['playing','paused','upgrade'].includes(game.status)){saveClock+=dt;if(saveClock>=2){persistRun();saveClock=0;}}hudClock+=dt;if(hudClock>.07){updateHud();hudClock=0;}
  window.requestAnimationFrame(frame);
}
function begin(force=false) {
  if(force!==true&&(availableSave||saveProblem)){
    showDialog('<div class="dialog-icon">🌱</div><h2>开始全新的冒险？</h2><p>新的一局会替换当前存档。<br>想保留进度，可以返回并继续上次冒险。</p><button class="primary-button" id="confirmNewRun">重新开始一局 →</button><button class="secondary-button" id="keepRun">保留存档，返回</button>',game.status==='playing'||dialogResume);
    $('#confirmNewRun').onclick=()=>begin(true);$('#keepRun').onclick=()=>closeDialog();return;
  }
  if($('#gameDialog').open)closeDialog(false);
  claimSave();particles.length=0;game.learningMode=['english','sentences','speaking'].includes($('#difficulty').value)?$('#difficulty').value:'letters';game.adaptive=true;
  if(window.GuluLibraryUI){try{game.setCustomBank(GuluLibraryUI.selected());}catch(e){toast(e.message);return;}}
  $('#startScreen').hidden=true;$('#settingsPanel').open=false;game.start();canvas.focus({preventScroll:true});updateHud(true);
}
function showDialog(html,resume=game.status==='playing') {
  $('#closeDialog').hidden=game.status==='upgrade';
  dialogResume=resume;
  if(game.status==='playing')game.pause();
  $('#dialogContent').innerHTML=html;
  if(!$('#gameDialog').open)$('#gameDialog').showModal();
  updateHud(true);
}
function closeDialog(resume=true) {
  if(game.status==='upgrade')return;
  $('#gameDialog').close();
  if(resume&&dialogResume)game.resume();
  if(resume&&['won','lost'].includes(game.status)){$('#startScreen').hidden=false;game.status='ready';}
  dialogResume=false;updateHud(true);canvas.focus({preventScroll:true});
}
function pauseScreen() {
  if(game.status!=='playing')return;
  showDialog('<div class="dialog-icon">☁️</div><h2>小院暂停营业</h2><p>僵尸们也在休息，准备好再继续。</p><button class="primary-button" id="resumeButton">继续突突突 →</button><button class="secondary-button" id="pauseHomeButton">保存并返回主页</button><button class="secondary-button" id="restartButton">重新开始这一局</button>',true);
  $('#pauseHomeButton').onclick=returnHome;$('#resumeButton').onclick=()=>closeDialog();$('#restartButton').onclick=begin;
}
function finishScreen(win) {
  const copy=GuluModeCopy.practiceCopy(game.learningMode,{correct:game.correct,casts:game.casts,mobile:phoneSpeech});
  best=Math.max(best,game.score);try{localStorage.setItem('gulu-shooter-best',String(best));}catch{}
  $('#bestScore').textContent=best;
  showDialog('<div class="dialog-icon">'+(win?'🏆':'🌻')+'</div><h2>'+(win?'小院守住啦！':'这一局也很勇敢！')+'</h2><p>'+(win?'你和豌豆小队赶跑了全部捣蛋鬼！':'你守到了第 '+game.wave+' 波！<br>下次试试另一套强化组合，挑战更远。')+'</p><div class="result-grid"><div><strong>'+game.score+'</strong><span>本局得分</span></div><div><strong>'+game.kills+'</strong><span>击退僵尸</span></div><div><strong>'+game.casts+'</strong><span>释放大招</span></div></div><p>'+copy.summary+'</p><button class="primary-button" id="againButton">'+copy.again+'</button><button class="secondary-button" id="finishHomeButton">返回主页</button>',false);
  $('#againButton').onclick=begin;$('#finishHomeButton').onclick=returnHome;
  if(win){tone(520,.3,'sine',.04,1040);for(let i=0;i<7;i++)puff(180+Math.random()*650,140+Math.random()*230,'#ffef92',20,'✦');}
}

function upgradeScreen(){
  const nextWave=game.wave+1;
  const modeNote=GuluModeCopy.practiceCopy(game.learningMode,{mobile:phoneSpeech}).wave;
  const forecast=nextWave%5===0?'👑 下一波：巨型首领，会不断召唤跑跑僵尸':nextWave===2?'⚡ 下一波解锁：闪电跑跑、铁桶卫士':nextWave===3?'🛡️ 下一波解锁：盾牌兵、分裂软糖':nextWave===4?'💚 下一波解锁：治疗僵尸、爆破客':'下一波：更多敌人，更高生命，更快进攻';
  showDialog('<div class="upgrade-eyebrow">WAVE '+game.wave+' CLEAR</div><h2>守住了！选一张，变更强</h2><p>所有强化整局有效，同名卡牌可以叠加。<br>'+modeNote+'</p><div class="upgrade-options">'+game.offers.map((c,i)=>'<button class="upgrade-card cat-'+c.category+'" data-upgrade="'+c.id+'"><span class="upgrade-category">'+c.category+' <kbd>'+(i+1)+'</kbd></span><span class="upgrade-art">'+c.icon+'</span><strong>'+c.name+'</strong><span class="upgrade-description">'+c.description+'</span><span class="upgrade-stack">'+(game.stack(c.id)?'叠加强化：'+game.stack(c.id)+' → '+(game.stack(c.id)+1)+' 层':'新强化 · 获得第 1 层')+'</span><span class="choose-label">选择并迎战第 '+nextWave+' 波 →</span></button>').join('')+'</div><div class="next-wave-info">'+forecast+'</div><p class="upgrade-recovery">向日葵修复 '+(1+game.stack('repair'))+' 护盾 · 大招充能推进 3 秒 · 选卡时战场暂停</p><button class="secondary-button" id="upgradeHomeButton">保存并返回主页</button>',false);
  $('#upgradeHomeButton').onclick=returnHome;
  $('#gameDialog').classList.add('upgrade-dialog');
  document.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>pickUpgrade(b.dataset.upgrade));
}
function pickUpgrade(id){
  if(!game.chooseCard(id))return;
  $('#gameDialog').close();$('#gameDialog').classList.remove('upgrade-dialog');$('#closeDialog').hidden=false;dialogResume=false;
  tone(660,.25,'sine',.04,1100);updateHud(true);canvas.focus({preventScroll:true});
}
function showBuild(){
  if(game.status==='upgrade')return;
  const owned=GARDEN_CARDS.filter(c=>game.stack(c.id));
  showDialog('<div class="dialog-icon">🎒</div><h2>我的强化组合</h2><p>第 '+game.wave+' 波 · '+Object.values(game.stacks).reduce((a,b)=>a+b,0)+' 张卡牌 · '+owned.length+' 种强化</p><div class="owned-cards">'+(owned.length?owned.map(c=>'<div class="owned-card"><span>'+c.icon+'</span><div><strong>'+c.name+' <b>×'+game.stack(c.id)+'</b></strong><small>'+c.description+'</small></div></div>').join(''):'<p>打完第一波，就能三选一获得强化。<br>本局共可遇到 24 种卡牌，试试不同组合！</p>')+'</div>',game.status==='playing');
}

function help() {
  const resume=game.status==='playing'||dialogResume;
  showDialog('<div class="dialog-icon">🌻</div><h2>队长，作战指南来啦！</h2><div class="help-row"><span>⌖</span><div><strong>鼠标瞄准，按住左键射击</strong><br>滑块可随时调低射速，调到 0 就完全关闭普通子弹。按住空格也能射击。开启「自动瞄准射击」，可以腾出双手练习。</div></div><div class="help-row"><span>⌨</span><div><strong>打字或开口朗读来放大招</strong><br>字母、单词和句子模式按卡片提示输入。英语口语模式先选择一张技能卡，按住麦克风朗读，松开停止录音并自动识别，文字匹配成功就释放大招。首次请允许系统语音识别和麦克风权限；这不是发音评分。激光和西瓜会朝准星释放。</div></div><div class="help-row"><span>✧</span><div><strong>向日葵就是小院防线</strong><br>僵尸靠近后会停下啃食，花瓣逐渐掉落，吃完只剩残茎。全部倒下后有 3 秒抢救时间；恢复护盾、修理或加固都能修复向日葵。<br><strong>每一波结束，三选一叠加强化</strong><br>敌人每波增多、变强，大招回蓝也更快。施法从 1～3 个字母逐步增加至多行，最多 60 个；逐行输入，不用回车。按错保留进度，每 5 波有首领！字母上限可用滑块控制，慢动作可自行开启或关闭。</div></div><p>单词模式每 3 波增加 1 遍输入；句子和口语模式每 3 波增加 1 句连贯上下文，最高练习量可在设置中调整。<br>请切换英文输入；Esc 暂停。手机可点屏幕键盘。</p>',resume);
}
for(const row of ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM']){
  const line=document.createElement('div');line.className='key-row';
  for(const letter of row){const button=document.createElement('button');button.className='touch-key';button.textContent=letter;button.dataset.key=letter;button.setAttribute('aria-label','输入字母 '+letter);button.onclick=()=>{game.input(letter);updateHud(true);button.classList.add('pressed');setTimeout(()=>button.classList.remove('pressed'),130);};line.append(button);}
  $('#touchKeyboard').append(line);
}
const spaceButton=document.createElement('button');spaceButton.id='sentenceSpace';spaceButton.className='touch-key sentence-space';spaceButton.dataset.key=' ';spaceButton.textContent='␣ 空格';spaceButton.hidden=true;spaceButton.onclick=()=>{game.input(' ');updateHud(true);};$('#touchKeyboard').append(spaceButton);
for(const key of ["'",'-','.']){const b=document.createElement('button');b.className='touch-key word-punctuation';b.textContent=key;b.dataset.key=key;b.hidden=true;b.onclick=()=>{game.input(key);updateHud(true);};$('#touchKeyboard').append(b);}
updateTypingControls();
function pointerAim(event) {
  const rect=canvas.getBoundingClientRect();game.setAim((event.clientX-rect.left)/rect.width*1000,(event.clientY-rect.top)/rect.height*530);
}
canvas.addEventListener('pointermove',pointerAim);
canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||game.status!=='playing')return;
  event.preventDefault();pointerAim(event);game.shooting=true;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
});
function stopShooting(){game.shooting=false;}
canvas.addEventListener('pointerup',stopShooting);canvas.addEventListener('pointercancel',stopShooting);canvas.addEventListener('lostpointercapture',stopShooting);window.addEventListener('pointerup',stopShooting);
window.addEventListener('blur',()=>{stopShooting();if(game.status==='playing')pauseScreen();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.status==='playing')pauseScreen();});
document.addEventListener('keydown',event=>{
  if(game.status==='upgrade'&&['1','2','3'].includes(event.key)&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();pickUpgrade(game.offers[Number(event.key)-1]?.id);return;}
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing||$('#gameDialog').open)return;
  if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
  if(event.key==='Escape'){event.preventDefault();pauseScreen();return;}
  if(event.key==='Enter'&&game.status==='ready'&&event.target.tagName!=='BUTTON'){event.preventDefault();if(availableSave)continueRun();else begin();return;}
  if(event.key===' '&&game.status==='playing'&&['english','sentences'].includes(game.learningMode)){event.preventDefault();if(!event.repeat){game.input(' ');updateHud(true);}return;}
  if(event.key===' '&&game.status==='playing'&&event.target.tagName!=='BUTTON'){event.preventDefault();game.shooting=true;return;}
  if(event.repeat)return;
  if((/^[a-z]$/i.test(event.key)||(['english','sentences'].includes(game.learningMode)&&/^[.'-]$/.test(event.key)))&&game.status==='playing'){event.preventDefault();game.input(event.key);updateHud(true);}
  if(event.key==='Backspace'&&game.status==='playing'){event.preventDefault();game.backspace();updateHud(true);}
});
document.addEventListener('keyup',event=>{if(event.key===' ')game.shooting=false;});
$('#homeButton').onclick=returnHome;$('#saveButton').onclick=saveMenu;$('#continueButton').onclick=continueRun;$('#buildButton').onclick=showBuild;$('#startButton').onclick=begin;$('#pauseButton').onclick=pauseScreen;$('#helpButton').onclick=help;
$('#soundVolume').value=Math.round(soundscape.volume*100);$('#soundVolumeValue').textContent=Math.round(soundscape.volume*100)+'%';
$('#soundVolume').addEventListener('input',event=>{const value=Number(event.target.value);soundscape.setVolume(value/100);$('#soundVolumeValue').textContent=value+'%';try{localStorage.setItem('gulu-sfx-volume-v2',String(value/100));}catch{}});
$('#soundButton').onclick=()=>{soundOn=!soundOn;soundscape.setEnabled(soundOn);$('#soundButton').setAttribute('aria-pressed',String(soundOn));$('#soundButton').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');tone(700,.12);};
$('#autoButton').onclick=()=>{game.auto=!game.auto;$('#autoButton').setAttribute('aria-pressed',String(game.auto));updateFireControl();if(game.status==='playing')canvas.focus({preventScroll:true});};
$('#keyboardButton').onclick=()=>{const expanded=$('#touchKeyboard').hidden;$('#touchKeyboard').hidden=!expanded;$('#keyboardButton').setAttribute('aria-expanded',String(expanded));};
$('#difficulty').onchange=()=>{game.learningMode=['english','sentences','speaking'].includes($('#difficulty').value)?$('#difficulty').value:'letters';game.adaptive=true;speechFeedback='';if(['english','sentences','speaking'].includes($('#difficulty').value))$('#settingsPanel').open=true;updateTypingControls();updateHud(true);if(game.learningMode==='speaking'&&!speechAuthorized)enableSpeech();};
document.querySelectorAll('.skill-card').forEach((button,index)=>button.onclick=()=>{if(game.status!=='playing'){toast('先开始保卫小院吧！');return;}stopListening();speechFeedback='';if(phoneSpeech)document.body.dataset.visibleSkill=String(index);game.select(index);if(game.learningMode!=='speaking'&&window.matchMedia('(pointer: coarse)').matches){$('#touchKeyboard').hidden=game.learningMode==='speaking';$('#keyboardButton').setAttribute('aria-expanded','true');}updateHud(true);});
$('#speechSkip').onclick=skipSpeechPrompt;$('#speechReview').onclick=openSpeechReview;
$('#speechEnable').addEventListener('click',enableSpeech);
$('#speechButton').addEventListener('pointerdown',startListening);
$('#speechButton').addEventListener('pointerup',()=>microphone.release());
$('#speechButton').addEventListener('pointercancel',stopListening);
$('#speechButton').addEventListener('lostpointercapture',()=>{if(microphone.held)microphone.release();});
$('#speechButton').addEventListener('contextmenu',e=>e.preventDefault());
$('#speechButton').addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();if(!e.repeat)startListening();}});
$('#speechButton').addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();microphone.release();}});
window.addEventListener('pointerup',()=>{if(microphone.held)microphone.release();});
window.addEventListener('blur',stopListening);window.addEventListener('pagehide',stopListening);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopListening();});
if(!phoneSpeech)fetch('/api/speech/status').then(r=>r.json()).then(info=>{nativeSpeechReady=info.available;if(!info.available)speechFeedback=info.error;updateSpeechControl();}).catch(()=>{speechFeedback='请通过本机游戏启动器开启系统语音助手。';updateSpeechControl();});
$('#speechExample').addEventListener('click',()=>{
  const index=game.typing;if(index<0||game.status!=='playing')return;
  if(!localSpeech.speak((lookupSentence(game.skills[index].code)?.text||game.skills[index].code.toLowerCase()).replaceAll(' / ',' '),()=>{speechFeedback='系统朗读未成功，请检查系统英文声音。';updateSpeechControl();})){speechFeedback='没有可用的本地英文声音，请在系统设置中添加。';updateSpeechControl();}
});
window.speechSynthesis?.addEventListener('voiceschanged',updateSpeechControl);

$('#closeDialog').onclick=()=>closeDialog();$('#gameDialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
if(window.matchMedia('(pointer: coarse)').matches){$('#touchKeyboard').hidden=game.learningMode==='speaking';$('#keyboardButton').setAttribute('aria-expanded','true');}
updateHud(true);window.requestAnimationFrame(frame);

const reviewEntry=document.createElement('button');reviewEntry.type='button';reviewEntry.textContent='口语复盘 · 查看跳过的句子';reviewEntry.onclick=openSpeechReview;document.querySelector('.difficulty-controls').append(reviewEntry);
