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
  const canvas=document.querySelector(solo?'#gameCanvas':'#myCanvas');
  const stage=canvas.parentElement;
  if(solo){const backdrop=document.createElement('div');backdrop.className='scene-backdrop';backdrop.setAttribute('aria-hidden','true');stage.prepend(backdrop);}
  function fit(){
    const width=stage.clientWidth,height=stage.clientHeight;
    if(width<=0||height<=0)return;
    const fillPhoneDuel=!solo&&Boolean(window.GuluMobile?.active);
    const scale=Math.min(width/1000,height/530);
    const w=fillPhoneDuel?width:1000*scale,h=fillPhoneDuel?height:530*scale;
    stage.style.setProperty('--scene-width',w+'px');stage.style.setProperty('--scene-height',h+'px');
    const dpr=Math.min(2,window.devicePixelRatio||1),pixelsW=Math.round(w*dpr),pixelsH=Math.round(h*dpr);
    if(canvas.width!==pixelsW||canvas.height!==pixelsH){canvas.width=pixelsW;canvas.height=pixelsH;canvas.getContext('2d').setTransform(pixelsW/1000,0,0,pixelsH/530,0,0);}
  }
  new ResizeObserver(fit).observe(stage);window.addEventListener('resize',fit);document.addEventListener('fullscreenchange',fit);fit();
})();
