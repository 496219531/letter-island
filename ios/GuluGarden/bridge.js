(function(){
 window.guluErrors=[];window.addEventListener("error",e=>guluErrors.push(e.message+" @ "+e.filename+":"+e.lineno));
  let serial=0;const waiting=new Map(),sessions=new Map();
  const post=(command,id)=>window.webkit.messageHandlers.gulu.postMessage({command,id});
  window.GuluNative={authorize(){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});post('authorize',id);});}};
  function audioCommand(command,ids=[]){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});window.webkit.messageHandlers.gulu.postMessage({command,id,ids});});}
  Object.assign(window.GuluNative,{retainAudio:ids=>audioCommand('retainAudio',ids),playAudio:id=>audioCommand('playAudio',[id]),deleteAudio:ids=>audioCommand('deleteAudio',ids).catch(()=>{}),stopAudio:()=>audioCommand('stopAudio').catch(()=>{})});
  function libraryCommand(command,payload={}){return new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});window.webkit.messageHandlers.gulu.postMessage({command,id,...payload});});}
  Object.assign(window.GuluNative,{getScreenDirection:()=>libraryCommand('getScreenDirection'),setScreenDirection:direction=>libraryCommand('setScreenDirection',{direction})});
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
    const keyboard=document.getElementById('touchKeyboard'),speech=document.getElementById('speechControl');
    const original=[...keyboard.children].map(node=>({node,children:[...node.childNodes]}));
    const keyMap=new Map([...keyboard.querySelectorAll('button')].map(button=>[button.dataset.key,button]));
    const backspace=document.createElement('button');backspace.type='button';backspace.className='touch-key';backspace.textContent='⌫';backspace.setAttribute('aria-label','退格');backspace.onclick=()=>{game.backspace();updateHud(true);};keyMap.set('Backspace',backspace);
    const center=document.createElement('div');center.className='landscape-center';promptBoard.before(center);center.append(tabs,promptBoard,speech);
    const label=document.createElement('label');label.className='landscape-choice';label.textContent='横屏布局';
    const layoutSelect=document.createElement('select');layoutSelect.id='landscapeLayout';layoutSelect.setAttribute('aria-label','横屏布局');
    layoutSelect.add(new Option('右侧操作台','sidebar'));layoutSelect.add(new Option('双拇指分体键盘','split'));
    try{layoutSelect.value=localStorage.getItem('gulu-landscape-layout')==='split'?'split':'sidebar';}catch{}
    const directionLabel=document.createElement('label');directionLabel.className='landscape-choice';directionLabel.textContent='屏幕方向';
    const directionSelect=document.createElement('select');directionSelect.id='screenDirection';directionSelect.setAttribute('aria-label','屏幕方向');directionSelect.add(new Option('竖屏（锁定）','portrait'));directionSelect.add(new Option('横屏（锁定）','landscape'));
    const directionNote=document.createElement('small');directionNote.textContent='手动选择后立即切换，转动手机不会自动改变方向。';directionLabel.append(directionSelect,directionNote);
    GuluNative.getScreenDirection().then(value=>{directionSelect.value=value;}).catch(error=>{directionNote.textContent=error.message;});
    directionSelect.onchange=async()=>{directionSelect.disabled=true;try{directionSelect.value=await GuluNative.setScreenDirection(directionSelect.value);directionNote.textContent='已锁定方向，下次打开会保留。';}catch(error){directionNote.textContent='切换失败：'+error.message;directionSelect.value=await GuluNative.getScreenDirection();}finally{directionSelect.disabled=false;}};
    const note=document.createElement('small');note.textContent='选择横屏方向后使用；单词提示看板与键盘均为半透明。';label.append(layoutSelect,note);document.querySelector('.difficulty-controls').append(directionLabel,label);
    const landscape=matchMedia('(orientation: landscape)');let keyboardLayout='portrait';
    function restoreKeys(){
      keyboard.replaceChildren();
      for(const record of original){record.node.replaceChildren(...record.children);keyboard.append(record.node);}
    }
    function buildBank(rows,name){
      const bank=document.createElement('div');bank.className='landscape-key-bank '+name;
      for(const keys of rows){const row=document.createElement('div');row.className='landscape-key-row';for(const key of keys){const button=keyMap.get(key);if(button)row.append(button);}bank.append(row);}
      keyboard.append(bank);
    }
    function applyLandscape(){
      const next=landscape.matches?layoutSelect.value:'portrait';document.body.dataset.landscapeLayout=next;
      if(next!==keyboardLayout){
        restoreKeys();
        if(next!=='portrait'){
          keyboard.replaceChildren();
          if(next==='split'){
            buildBank(['QWERT'.split(''),'ASDFG'.split(''),'ZXCV'.split(''),[' ']],'left-bank');
            buildBank(['YUIOP'.split(''),'HJKL'.split(''),'BNM'.split(''),["'",'-','.','Backspace']],'right-bank');
          }else buildBank(['QWERTYUIOP'.split(''),'ASDFGHJKL'.split(''),'ZXCVBNM'.split(''),["'",'-','.',' ','Backspace']],'full-bank');
        }
        keyboardLayout=next;
      }
      requestAnimationFrame(()=>{updateHud(true);scheduleLayout();});
    }
    layoutSelect.onchange=()=>{try{localStorage.setItem('gulu-landscape-layout',layoutSelect.value);}catch{}applyLandscape();};
    landscape.addEventListener('change',applyLandscape);requestAnimationFrame(applyLandscape);
    const landscapeSettings=document.createElement('button');landscapeSettings.type='button';landscapeSettings.className='landscape-settings';landscapeSettings.textContent='⚙';landscapeSettings.setAttribute('aria-label','游戏设置');landscapeSettings.onclick=()=>{document.getElementById('settingsPanel').open=true;};document.querySelector('.game-toolbar').append(landscapeSettings);
    new MutationObserver(()=>{const index=cards.findIndex(c=>c.classList.contains('selected'));if(index>=0&&index!==active)show(index);}).observe(promptBoard,{subtree:true,attributes:true,attributeFilter:['class']});
    document.getElementById('keyboardButton').setAttribute('aria-expanded','true');
    // Controls are already initialized by the game client.

    const sheet=document.createElement('link');sheet.rel='stylesheet';sheet.href='iphone.css';document.head.append(sheet);
    // WKWebView already occupies the native safe area. Budget its actual size,
    // including every visible input row, before giving space to the battlefield.
    const frame=document.querySelector('.game-frame'),arsenal=document.querySelector('.arsenal');
    let layoutFrame=0;
    function fitLayout(){
      layoutFrame=0;
      if(document.body.dataset.gameState==='ready'||landscape.matches)return;
      const css=getComputedStyle(arsenal),gap=parseFloat(css.rowGap)||0;
      const visible=[...arsenal.children].flatMap(e=>e===center?[...center.children]:[e]).filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none');
      const fixed=visible.filter(e=>e!==promptBoard).reduce((sum,e)=>{
        const style=getComputedStyle(e);return sum+e.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);
      },0)+(parseFloat(css.paddingTop)||0)+(parseFloat(css.paddingBottom)||0)+(parseFloat(css.borderTopWidth)||0)+Math.max(0,visible.length-1)*gap;
      const height=frame.clientHeight,toolbar=document.querySelector('.game-toolbar').getBoundingClientRect().height;
      const available=Math.max(0,height-toolbar-fixed);
      const boardMinimum=Math.min(120,available*.48);
      const field=Math.max(0,Math.min(height*.29,available-boardMinimum));
      const value=field.toFixed(2)+'px';
      if(frame.style.getPropertyValue('--native-field-height')!==value)frame.style.setProperty('--native-field-height',value);
    }
    function scheduleLayout(){if(!layoutFrame)layoutFrame=requestAnimationFrame(fitLayout);}
    const sizes=new ResizeObserver(scheduleLayout);sizes.observe(frame);
    for(const element of arsenal.children)if(element!==promptBoard)sizes.observe(element);
    sizes.observe(tabs);sizes.observe(speech);
    sizes.observe(document.querySelector('.game-toolbar'));
    new MutationObserver(scheduleLayout).observe(document.body,{attributes:true,attributeFilter:['data-game-state','data-learning-mode']});
    window.addEventListener('resize',scheduleLayout);window.visualViewport?.addEventListener('resize',scheduleLayout);
    sheet.addEventListener('load',scheduleLayout);scheduleLayout();
    document.addEventListener('gulu-background',()=>{if(typeof stopListening==='function')stopListening();if(typeof game!=='undefined'&&game.status==='playing')game.pause();});
  });
})();
