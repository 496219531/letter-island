/* Browser capabilities and orientation. Native builds keep their own bridge. */
(function(){
  if(window.GuluNative)return;
  const phone=Boolean(window.GuluMobile?.active);
  let preferredDirection='landscape';
  try{if(localStorage.getItem('gulu-web-screen-direction')==='portrait')preferredDirection='portrait';}catch{}
  let rotation=0,height=innerHeight,settingsPortrait=true;
  const effectiveDirection=()=>settingsPortrait?'portrait':preferredDirection;
  function syncViewport(){
    if(!phone)return;
    const viewport=window.visualViewport,w=viewport?.width||innerWidth,h=viewport?.height||innerHeight;
    const physicalLandscape=innerWidth>innerHeight;
    const direction=effectiveDirection();
    rotation=direction==='landscape'&&!physicalLandscape?90:direction==='portrait'&&physicalLandscape?-90:0;
    const width=rotation?h:w;height=rotation?w:h;
    const body=document.body;
    body.dataset.webDirection=direction;body.dataset.webRotation=String(rotation);
    body.style.setProperty('--web-width',width+'px');body.style.setProperty('--web-height',height+'px');
    body.style.setProperty('--browser-app-height',height+'px');
    body.style.setProperty('--web-left',(viewport?.offsetLeft||0)+'px');body.style.setProperty('--web-top',(viewport?.offsetTop||0)+'px');
    body.style.setProperty('--web-transform',rotation===90?'translateX('+w+'px) rotate(90deg)':rotation===-90?'translateY('+h+'px) rotate(-90deg)':'none');
    body.style.setProperty('--web-angle',rotation+'deg');
    const select=document.querySelector('#screenDirection');if(select)select.value=preferredDirection;
    window.dispatchEvent(new Event('gulu-web-orientation'));
  }
  window.GuluWebOrientation={
    get height(){return height;},
    landscape:{get matches(){return effectiveDirection()==='landscape';},addEventListener(type,listener){if(type==='change')window.addEventListener('gulu-web-orientation',listener);}},
    async setSettingsPortrait(value){settingsPortrait=Boolean(value);syncViewport();return effectiveDirection();},
    async getScreenDirection(){return preferredDirection;},
    async setScreenDirection(direction){
      if(!['portrait','landscape'].includes(direction))throw new Error('Invalid direction');
      preferredDirection=direction;try{localStorage.setItem('gulu-web-screen-direction',direction);}catch{}
      syncViewport();return direction;
    },
    point(event,element){
      const r=element.getBoundingClientRect();
      if(rotation===90)return {x:(event.clientY-r.top)/r.height,y:(r.right-event.clientX)/r.width};
      if(rotation===-90)return {x:(r.bottom-event.clientY)/r.height,y:(event.clientX-r.left)/r.width};
      return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height};
    }
  };
  if(phone){
    syncViewport();document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(syncViewport));
    window.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);
  }
  function disableSpeech(reason){
    const picker=document.querySelector('#difficulty'),option=picker?.querySelector('option[value="speaking"]');
    if(!option)return;
    option.disabled=true;option.textContent='口语（当前浏览器暂不支持）';option.title=reason;
    if(picker.value==='speaking'){picker.value='english';game.learningMode='english';updateTypingControls();updateHud(true);}
  }
  if(!window.isSecureContext||(phone&&!(window.SpeechRecognition||window.webkitSpeechRecognition)))disableSpeech('此浏览器暂不支持录音识别，单词与句子练习可正常使用。');
  else if(!phone){if(window.guluSpeechStatus)window.guluSpeechStatus.then(status=>{if(!status.available)disableSpeech(status.error||'语音服务不可用');});else disableSpeech('此地址未提供系统语音服务');}
})();
