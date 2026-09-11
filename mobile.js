/* Shared phone policy. Evaluate before either game client starts. */
(function(root){
  'use strict';
  function isPhone(env){return env.matchMedia('(pointer: coarse)').matches && env.matchMedia('(max-device-width: 1100px)').matches;}
  function allowedMode(mode,phone){return phone&&['adaptive','letters'].includes(mode)?'english':mode;}
  function createSpeech({onState=()=>{},onResult=()=>{},onError=()=>{},Recognition=root.SpeechRecognition||root.webkitSpeechRecognition}={}){
    let phase='idle',held=false,recognizer=null,timer=null,target=null,words=[];
    const state=p=>{phase=p;onState(p);};
    function cancel(){const r=recognizer;recognizer=null;held=false;clearTimeout(timer);r?.abort();state('idle');}
    function release(){held=false;if(!recognizer)return;if(phase==='preparing'){cancel();return;}state('recognizing');recognizer.stop();clearTimeout(timer);timer=setTimeout(()=>{const audioId=recognizer?.audioId;cancel();onError('识别超时，请重新按住朗读。',target,{audioId});},10000);}
    function start(next){
      if(phase!=='idle')return;
      if(!Recognition){onError('当前手机浏览器不支持语音识别，请使用支持语音识别的系统浏览器。');return;}
      target=next;words=[];held=true;const r=new Recognition();recognizer=r;r.lang='en-US';r.continuous=true;r.interimResults=false;state('preparing');
      r.onstart=()=>{if(recognizer!==r)return;if(!held){cancel();return;}state('recording');timer=setTimeout(release,30000);};
      r.onresult=e=>{if(recognizer!==r)return;for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)words[i]=e.results[i][0].transcript;};
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
  root.GuluMobile={isPhone,allowedMode,createSpeech,keySkillHints};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluMobile;
  if(!root.document)return;
  const phone=isPhone(root);root.GuluMobile.active=phone;
  document.body.classList.toggle('mobile-game',phone);
  if(!phone)return;
  for(const id of ['difficulty','mode']){
    const select=document.getElementById(id);if(!select)continue;
    if(id==='mode'&&document.body.classList.contains('duel-app'))continue;
    const mode=allowedMode(select.value,true);
    for(const option of [...select.options])if(['adaptive','letters'].includes(option.value))option.remove();
    select.value=mode;
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!root.GuluNative){
      const grid=document.getElementById('skillGrid');
      if(grid&&root.IntersectionObserver){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.intersectionRatio>=.6){const index=entry.target.dataset.skill;if(document.body.dataset.visibleSkill!==index){document.body.dataset.visibleSkill=index;document.dispatchEvent(new Event('gulu-visible-skill'));}}},{root:grid,threshold:[.6]});grid.querySelectorAll('.skill-card').forEach(card=>observer.observe(card));}
    }
    const settings=document.getElementById('settingsPanel');
    if(!settings)return;
    const controls=settings.querySelector('.difficulty-controls');
    const dialog=document.createElement('dialog');dialog.id='mobileSettingsDialog';dialog.setAttribute('aria-labelledby','mobileSettingsTitle');
    const header=document.createElement('div');header.className='mobile-settings-header';
    const title=document.createElement('strong');title.id='mobileSettingsTitle';title.textContent='游戏设置';
    const close=document.createElement('button');close.type='button';close.textContent='完成';close.setAttribute('aria-label','关闭游戏设置');
    header.append(title,close);dialog.append(header,controls);document.body.append(dialog);
    const trigger=settings.querySelector('summary');
    trigger.tabIndex=0;
    let resume=false;
    function finish(){settings.open=false;if(dialog.open)dialog.close();trigger.focus({preventScroll:true});if(resume&&typeof game!=='undefined'&&game.status==='paused'){game.resume();updateHud(true);}resume=false;}
    function sync(){
      if(settings.open&&!dialog.open){resume=typeof game!=='undefined'&&game.status==='playing';if(resume){stopListening();game.pause();updateHud(true);}trigger.focus({preventScroll:true});dialog.showModal();}
      else if(!settings.open&&dialog.open)finish();
    }
    settings.addEventListener('toggle',sync);
    close.onclick=finish;dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish();}});
    dialog.addEventListener('close',()=>{if(settings.open)finish();});
    sync();
  });
})(typeof globalThis!=='undefined'?globalThis:this);
