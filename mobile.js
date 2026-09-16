/* Shared phone policy. Evaluate before either game client starts. */
(function(root){
  'use strict';
  function isPhone(env){return env.matchMedia('(pointer: coarse)').matches && env.matchMedia('(max-device-width: 1100px)').matches;}
  function allowedMode(mode,phone){return phone&&['adaptive','letters'].includes(mode)?'english':mode;}
  function createSpeech({onState=()=>{},onResult=()=>{},onPartial=()=>{},onError=()=>{},Recognition=root.SpeechRecognition||root.webkitSpeechRecognition}={}){
    let phase='idle',held=false,recognizer=null,timer=null,target=null,words=[];
    const state=p=>{phase=p;onState(p);};
    function cancel(){const r=recognizer;recognizer=null;held=false;clearTimeout(timer);r?.abort();state('idle');}
    function release(){held=false;if(!recognizer)return;if(phase==='preparing'){cancel();return;}state('recognizing');recognizer.stop();clearTimeout(timer);timer=setTimeout(()=>{const audioId=recognizer?.audioId;cancel();onError('识别超时，请重新按住朗读。',target,{audioId});},10000);}
    function start(next){
      if(phase!=='idle')return;
      if(!Recognition){onError('当前手机浏览器不支持语音识别，请使用支持语音识别的系统浏览器。');return;}
      target=next;words=[];held=true;const r=new Recognition();recognizer=r;r.lang='en-US';r.continuous=true;r.interimResults=true;state('preparing');
      r.onstart=()=>{if(recognizer!==r)return;if(!held){cancel();return;}state('recording');timer=setTimeout(release,30000);};
      r.onresult=e=>{if(recognizer!==r)return;for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)words[i]=e.results[i][0].transcript;onPartial(Array.from(e.results,result=>result[0].transcript).join(' '),target);};
      r.onerror=e=>{if(recognizer!==r)return;cancel();onError(['not-allowed','service-not-allowed'].includes(e.error)?'语音权限被拒绝，请在手机浏览器设置中允许麦克风与语音识别。':'手机语音识别未成功：'+e.error,target,{audioId:r.audioId||null});};
      r.onend=()=>{if(recognizer!==r)return;const text=words.filter(Boolean).join(' '),value=target;recognizer=null;held=false;clearTimeout(timer);state('idle');if(text.trim())onResult(text,value,{audioId:r.audioId||null});else onError('没有听清，请按住麦克风再说一次。',value,{audioId:r.audioId||null});};
      try{r.start();}catch(e){cancel();onError(e.message);}
    }
    return {start,release,cancel,get held(){return held;},get phase(){return phase;}};
  }
  function keySkillHints(skills,typing,mode){
    const hints={};if(mode==='speaking'||typing>=0)return hints;
    skills.forEach((skill,index)=>{
      if(skill.cd>0||(typing>=0&&typing!==index))return;
      const key=skill.code[typing>=0?skill.typed:0];
      if(key&&hints[key]===undefined)hints[key]=index;
    });
    return hints;
  }
  function sceneNeedsPortrait(state,dialogs=[]){return !['playing','upgrade'].includes(state)||dialogs.some(d=>!d.gameOverlay);}
  root.GuluMobile={isPhone,allowedMode,createSpeech,keySkillHints,sceneNeedsPortrait};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluMobile;
  if(!root.document)return;
  const phone=isPhone(root);root.GuluMobile.active=phone;
  document.body.classList.toggle('mobile-game',phone);
  for(const id of (phone?['difficulty','mode']:[])){
    const select=document.getElementById(id);if(!select)continue;
    if(id==='mode'&&document.body.classList.contains('duel-app'))continue;
    const mode=allowedMode(select.value,true);
    for(const option of [...select.options])if(['adaptive','letters'].includes(option.value))option.remove();
    select.value=mode;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(phone&&!root.GuluNative){
      const grid=document.getElementById('skillGrid');
      if(grid&&root.IntersectionObserver){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.intersectionRatio>=.6){const index=entry.target.dataset.skill;if(document.body.dataset.visibleSkill!==index){document.body.dataset.visibleSkill=index;document.dispatchEvent(new Event('gulu-visible-skill'));}}},{root:grid,threshold:[.6]});grid.querySelectorAll('.skill-card').forEach(card=>observer.observe(card));}
    }
    if(phone||root.GuluNative){
      let desired=null,sequence=Promise.resolve();
      const syncScene=()=>{
        const portrait=sceneNeedsPortrait(document.body.dataset.gameState,[...document.querySelectorAll('dialog[open]')].map(d=>({gameOverlay:d.dataset.gameOverlay==='true'})));
        if(portrait===desired)return;desired=portrait;
        sequence=sequence.catch(()=>{}).then(async()=>{
          if(portrait!==desired)return;
          const orientation=root.GuluNative||root.GuluWebOrientation;if(!orientation)return;
          if(!portrait)await orientation.setScreenDirection('landscape');
          if(portrait!==desired)return;
          await orientation.setSettingsPortrait(portrait);
        }).catch(()=>{});
      };
      const dialogs=new Map();
      const watchDialogs=()=>{for(const [d,observer] of dialogs)if(!d.isConnected){observer.disconnect();dialogs.delete(d);}for(const d of document.querySelectorAll('dialog'))if(!dialogs.has(d)){const observer=new MutationObserver(syncScene);observer.observe(d,{attributes:true,attributeFilter:['open','data-game-overlay']});dialogs.set(d,observer);}};
      watchDialogs();
      new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'))syncScene();if(records.some(r=>r.type==='childList')){watchDialogs();syncScene();}}).observe(document.body,{childList:true,attributes:true,attributeFilter:['data-game-state']});
      syncScene();
    }
    const settings=document.getElementById('settingsPanel');
    if(!settings)return;
    const controls=settings.querySelector('.difficulty-controls');
    const dialog=document.createElement('dialog');dialog.id='mobileSettingsDialog';dialog.setAttribute('aria-labelledby','mobileSettingsTitle');
    const header=document.createElement('div');header.className='mobile-settings-header';
    const title=document.createElement('strong');title.id='mobileSettingsTitle';title.textContent='游戏设置';
    const close=document.createElement('button');close.type='button';close.textContent='完成';close.setAttribute('aria-label','关闭游戏设置');
    header.append(title,close);
    const tabs=document.createElement('nav');tabs.className='mobile-settings-tabs';tabs.setAttribute('aria-label','设置分类');
    const learningTab=document.createElement('button'),soundTab=document.createElement('button');learningTab.type=soundTab.type='button';learningTab.textContent='📖 学习';soundTab.textContent='🔊 声音与性能';tabs.append(learningTab,soundTab);
    const learning=document.createElement('section'),sound=document.createElement('section');learning.className=sound.className='mobile-settings-page';learning.dataset.page='learning';sound.dataset.page='sound';
    const items=[...controls.children];for(const item of items){const isSound=item.classList.contains('audio-volume-control')||Boolean(item.querySelector('#renderQuality'));item.dataset.settingIcon=item.querySelector('#renderQuality')?'⚡':item.querySelector('#soundVolume')?'🔊':item.querySelector('#fireStrength')?'🎯':item.querySelector('#englishLevel')?'📚':item.querySelector('#maxLearningLoad')?'🔁':item.querySelector('#magicSlowButton')?'🐢':item.textContent.includes('口语复盘')?'🎙️':'';(isSound?sound:learning).append(item);}controls.replaceChildren(learning,sound);
    // Move existing controls, preserving their handlers and current values.
    const audio=sound.querySelector('.audio-volume-control');
    if(audio){
      const readout=audio.querySelector('#learningReadout')?.parentElement,preview=audio.querySelector('#soundPreviewKind')?.parentElement,link=audio.querySelector('a');
      const readoutTest=readout?.nextElementSibling,readoutStatus=audio.querySelector('#learningReadoutStatus');
      const soundTest=audio.querySelector('#soundTestButton'),soundStatus=audio.querySelector('#soundStatus');
      function card(nodes){const box=document.createElement('section');box.className='settings-card';for(const node of nodes)if(node)box.append(node);sound.append(box);}
      card([readout,readoutStatus,readoutTest]);if(link){link.classList.add('settings-link');sound.append(link);}card([preview,soundTest,soundStatus]);
    }
    learningTab.textContent='学习';soundTab.textContent='声音与性能';
    const selectPage=page=>{for(const [name,node] of [['learning',learning],['sound',sound]])node.hidden=name!==page;learningTab.classList.toggle('active',page==='learning');soundTab.classList.toggle('active',page==='sound');learningTab.setAttribute('aria-selected',String(page==='learning'));soundTab.setAttribute('aria-selected',String(page==='sound'));controls.scrollTop=0;};
    learningTab.onclick=()=>selectPage('learning');soundTab.onclick=()=>selectPage('sound');selectPage('learning');
    dialog.append(header,tabs,controls);document.body.append(dialog);
    const trigger=settings.querySelector('summary');
    trigger.tabIndex=0;
    let resume=false;
    function finish(){settings.open=false;if(dialog.open)dialog.close();trigger.focus({preventScroll:true});if(resume&&typeof game!=='undefined'&&game.status==='paused'){game.resume();updateHud(true);}resume=false;}
    function sync(){
      if(settings.open&&!dialog.open){resume=typeof game!=='undefined'&&game.status==='playing';if(resume){stopListening();game.pause();updateHud(true);}trigger.focus({preventScroll:true});title.textContent='游戏设置';dialog.showModal();}
      else if(!settings.open&&dialog.open)finish();
    }
    settings.addEventListener('toggle',sync);
    close.onclick=finish;dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish();}});
    dialog.addEventListener('close',()=>{if(settings.open)finish();});
    sync();
  });
})(typeof globalThis!=='undefined'?globalThis:this);
