(function(){
 window.guluErrors=[];window.addEventListener("error",e=>guluErrors.push(e.message+" @ "+e.filename+":"+e.lineno));
  let serial=0;const waiting=new Map(),sessions=new Map();
  const post=(command,id)=>window.webkit.messageHandlers.gulu.postMessage({command,id});
  window.GuluNative={authorize(){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});post('authorize',id);});}};
  function audioCommand(command,ids=[]){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});window.webkit.messageHandlers.gulu.postMessage({command,id,ids});});}
  Object.assign(window.GuluNative,{retainAudio:ids=>audioCommand('retainAudio',ids),playAudio:id=>audioCommand('playAudio',[id]),deleteAudio:ids=>audioCommand('deleteAudio',ids).catch(()=>{}),stopAudio:()=>audioCommand('stopAudio').catch(()=>{})});
  function libraryCommand(command,payload={}){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});window.webkit.messageHandlers.gulu.postMessage({command,id,...payload});});}
  Object.assign(window.GuluNative,{configureQwen:()=>libraryCommand('configureQwen'),importImage:(image,kind)=>libraryCommand('importImage',{image,kind}),translateTexts:texts=>libraryCommand('translateTexts',{texts}),exportLibrary:text=>libraryCommand('exportLibrary',{text})});
  class NativeRecognition {
    start(){this.id=++serial;sessions.set(this.id,this);post('start',this.id);}
    stop(){post('stop',this.id);}
    abort(){sessions.delete(this.id);post('cancel',this.id);}
  }
  window.SpeechRecognition=NativeRecognition;
  window.GuluNativeReceive=function(e){
    if(e.type==='nativeReply'){const p=waiting.get(e.id);waiting.delete(e.id);if(p)e.ok?p.resolve(e.result):p.reject(new Error(e.error||'录音操作失败'));return;}
    if(e.type==='permission'){const p=waiting.get(e.id);waiting.delete(e.id);if(p)e.ok?p.resolve():p.reject(new Error('请在 iPhone 设置中允许麦克风与语音识别。'));return;}
    const r=sessions.get(e.id);if(!r)return;if(e.audioId)r.audioId=e.audioId;
    if(e.type==='start')r.onstart?.();
    if(e.type==='result'){r.onresult?.({resultIndex:0,results:[Object.assign([{transcript:e.text}],{isFinal:true})]});sessions.delete(e.id);r.onend?.();}
    if(e.type==='error'){sessions.delete(e.id);r.onerror?.({error:e.error});}
  };
  document.addEventListener('DOMContentLoaded',()=>{
    document.body.classList.add('native-iphone');
    // The web game has a desktop heading. In the app, its mode picker belongs
    // with the one primary action on the home surface instead.
    const startPanel=document.querySelector('.start-panel'),difficulty=document.querySelector('.difficulty-label'),duel=document.querySelector('.lan-entry');
    if(startPanel&&difficulty){
      const mode=document.createElement('section');mode.className='native-home-mode';
      const label=document.createElement('strong');label.textContent='练习方式';
      const start=startPanel.querySelector('#startButton');
      mode.append(label,difficulty);start.before(mode);
      if(duel){duel.textContent='⚔ 和朋友对战';start.after(duel);}
    }
    // The native shell always returns to the app home when the game is ready.
    // Keep this independent of stale WebKit session state from an earlier run.
    const home=document.getElementById('startScreen');
    const syncHome=()=>{if(home&&(document.body.dataset.gameState||'ready')==='ready')home.hidden=false;};
    new MutationObserver(syncHome).observe(document.body,{attributes:true,attributeFilter:['data-game-state']});
    requestAnimationFrame(syncHome);
    document.querySelector('.arsenal').prepend(document.getElementById('battleToast'));
    const promptBoard=document.getElementById('skillGrid');
    promptBoard.setAttribute('role','region');promptBoard.setAttribute('aria-label','单词提示看板');
    const cards=[...document.querySelectorAll('.skill-card')];
    const tabs=document.createElement('div');tabs.className='iphone-skill-tabs';tabs.setAttribute('aria-label','选择大招');
    let active=0;
    function show(index){active=index;cards.forEach((c,i)=>c.classList.toggle('iphone-visible',i===index));[...tabs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));document.body.dataset.visibleSkill=String(index);document.dispatchEvent(new Event('gulu-visible-skill'));}
    ['🌈 激光','❄️ 冰冻','🍉 西瓜'].forEach((label,i)=>{const b=document.createElement('button');b.type='button';b.dataset.skill=String(i);b.textContent=label;b.onclick=()=>{show(i);cards[i].click();};tabs.append(b);});
    promptBoard.before(tabs);show(0);
    new MutationObserver(()=>{const index=cards.findIndex(c=>c.classList.contains('selected'));if(index>=0&&index!==active)show(index);}).observe(promptBoard,{subtree:true,attributes:true,attributeFilter:['class']});
    document.getElementById('keyboardButton').setAttribute('aria-expanded','true');
    // Controls are already initialized by the game client.

    const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='iphone.css';document.head.append(sheet);
    document.addEventListener('gulu-background',()=>{if(typeof stopListening==='function')stopListening();if(typeof game!=='undefined'&&game.status==='playing')game.pause();});
  });
})();
