/* Shared viewport, high-DPI canvas and fullscreen controls. */
(function(){
  'use strict';
  const solo=document.body.classList.contains('solo-app');
  const header=document.querySelector('.topbar');
  const actions=document.querySelector('.header-actions')||header;
  const full=document.createElement('button');
  full.className='fullscreen-button';full.type='button';full.textContent='进入全屏';full.setAttribute('aria-label','进入全屏');full.setAttribute('aria-pressed','false');
  actions.append(full);
  const message=document.createElement('div');message.className='viewport-message';message.hidden=true;message.setAttribute('role','status');document.body.append(message);
  let messageTimer;
  full.addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else throw new Error('unsupported');
    }catch{
      message.textContent='当前浏览器不支持原生全屏，可使用浏览器的全屏菜单。游戏已自动适配窗口。';message.hidden=false;
      clearTimeout(messageTimer);messageTimer=setTimeout(()=>message.hidden=true,5000);
    }
  });
  document.addEventListener('fullscreenchange',()=>{
    const active=Boolean(document.fullscreenElement);full.textContent=active?'退出全屏':'进入全屏';full.setAttribute('aria-label',full.textContent);full.setAttribute('aria-pressed',String(active));
  });
  if(solo){
    const settings=document.querySelector('#settingsPanel');if(settings)actions.prepend(settings);
    const mode=document.querySelector('.difficulty-label'),button=document.querySelector('#continueButton');
    if(mode&&button)button.before(mode);
    document.addEventListener('pointerdown',event=>{if(settings?.open&&!settings.contains(event.target)&&!event.target.closest('#mobileSettingsDialog')&&!event.target.closest('#difficulty'))settings.open=false;});
  }
  if(solo&&!window.GuluNative&&!window.GuluMobile?.active){
    document.body.classList.add('web-home');
    const panel=document.querySelector('.start-panel'),start=document.querySelector('#startButton'),resume=document.querySelector('#continueButton'),mode=document.querySelector('.difficulty-label'),source=document.querySelector('.custom-source');
    const options=document.createElement('section');options.className='web-home-options';options.setAttribute('aria-label','练习配置');start.before(options);
    function card(title,content){const box=document.createElement('section'),heading=document.createElement('strong');box.className='web-home-option';heading.textContent=title;box.append(heading,content);options.append(box);}
    card('练习方式',mode);const manage=source.querySelector('button');manage.remove();card('练习题库',source);
    manage.className='web-home-library';manage.textContent='词句库';options.after(manage);
    const buttons=document.createElement('nav');buttons.className='web-home-actions';buttons.setAttribute('aria-label','开始游玩');manage.after(buttons);const pending=source.querySelector('.ocr-pending-entry');if(pending){pending.classList.add('web-home-library');buttons.before(pending);}
    const duel=document.querySelector('.lan-entry');buttons.append(start,resume);if(duel){duel.textContent='和朋友对战';buttons.append(duel);}
    for(const action of buttons.children)action.classList.add('web-home-action');
    buttons.after(document.querySelector('#saveHint'));panel.querySelector('.start-keys')?.remove();
    GuluLibraryUI.refresh();refreshSaveMenu();
  }
  const canvas=document.querySelector(solo?'#gameCanvas':'#myCanvas');
  const stage=canvas.parentElement;
  if(solo){const backdrop=document.createElement('div');backdrop.className='scene-backdrop';backdrop.setAttribute('aria-hidden','true');stage.prepend(backdrop);}
  function fit(){
    const width=stage.clientWidth,height=stage.clientHeight;
    if(width<=0||height<=0)return;
    const fillPhoneDuel=Boolean(window.GuluMobile?.active)||document.body.classList.contains('native-iphone');
    const scale=Math.min(width/1000,height/530);
    const w=fillPhoneDuel?width:1000*scale,h=fillPhoneDuel?height:530*scale;
    if(stage.style.getPropertyValue('--scene-width')!==w+'px')stage.style.setProperty('--scene-width',w+'px');
    if(stage.style.getPropertyValue('--scene-height')!==h+'px')stage.style.setProperty('--scene-height',h+'px');
    // Positions use the full phone field; character art keeps its proportions.
    const ratio=(h/530)/(w/1000),portrait=solo&&fillPhoneDuel&&height>width*.65;
    canvas.characterScale=portrait?{x:Math.min(1.8,ratio),y:Math.min(1.8,ratio)/ratio}:{x:1,y:1};
    const dpr=Math.min(window.GuluPerformance?.current.dpr||2,window.devicePixelRatio||1),pixelsW=Math.round(w*dpr),pixelsH=Math.round(h*dpr);
    if(canvas.width!==pixelsW||canvas.height!==pixelsH){canvas.width=pixelsW;canvas.height=pixelsH;canvas.getContext('2d').setTransform(pixelsW/1000,0,0,pixelsH/530,0,0);document.dispatchEvent(new Event('gulu-scene-resized'));}
  }
  let fitFrame=0;
  function scheduleFit(){if(!fitFrame)fitFrame=requestAnimationFrame(()=>{fitFrame=0;fit();});}
  document.addEventListener('gulu-quality-change',scheduleFit);new ResizeObserver(scheduleFit).observe(stage);window.addEventListener('resize',scheduleFit);document.addEventListener('fullscreenchange',scheduleFit);fit();
})();
