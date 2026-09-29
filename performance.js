/* Rendering policy only: simulation, input and scoring never depend on quality. */
(function(root){
 const profiles={eco:{fps:30,dpr:1,particles:72,glow:false,hudInterval:.12},standard:{fps:60,dpr:2,particles:260,glow:true,hudInterval:.07}};
 function needsSafariCompatibility(navigator){
  const ua=String(navigator?.userAgent||''),version=ua.match(/Version\/(\d+)(?:\.(\d+))?/);
  return /Macintosh/.test(ua)&&/Safari\//.test(ua)&&!/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)&&Boolean(version)&&Number(version[1])<=17;
 }
 function paintSteps(elapsed,interval){// Allow the 1–2 ms timestamp jitter seen with iOS 30Hz callbacks.
  return Math.floor((elapsed+Math.min(.002,interval*.06))/interval);}
 function profile(mode){return profiles[mode]||profiles.eco;}
 class SimulationClock{
  constructor(){this.remainder=0;}
  advance(elapsed,tick){
   this.remainder+=Math.max(0,Math.min(.25,Number.isFinite(elapsed)?elapsed:0));
   let steps=0;while(this.remainder+1e-9>=1/60&&steps<16){tick(1/60);this.remainder=Math.max(0,this.remainder-1/60);steps++;}
   return steps;
  }
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={profile,SimulationClock,paintSteps,needsSafariCompatibility};
 if(!root.document)return;
 const safariCompatibility=!root.GuluNative&&needsSafariCompatibility(root.navigator);
 let mode='eco';try{const saved=localStorage.getItem('gulu-render-quality');if(profiles[saved])mode=saved;}catch{}
 if(root.GuluNative){try{if(!localStorage.getItem('gulu-app-eco-default-v1')){mode='eco';localStorage.setItem('gulu-app-eco-default-v1','1');}}catch{}}
 function apply(next){mode=safariCompatibility?'eco':profiles[next]?next:'eco';document.body.dataset.renderQuality=mode;try{localStorage.setItem('gulu-render-quality',mode);}catch{}document.dispatchEvent(new Event('gulu-quality-change'));}
 root.GuluPerformance={paintSteps,safariCompatibility,get mode(){return mode;},get current(){return profile(mode);},clock:new SimulationClock(),set:apply};
 apply(mode);
 document.addEventListener('DOMContentLoaded',()=>{
  const controls=document.querySelector('.difficulty-controls');if(!controls)return;
  const label=document.createElement('label');label.textContent='画质与资源消耗';
  const select=document.createElement('select');select.id='renderQuality';select.setAttribute('aria-label','画质与资源消耗');
  select.add(new Option('低资源 · 30帧 / 简化光效（推荐）','eco'));select.add(new Option('标准 · 60帧 / 完整光效','standard'));select.value=mode;if(safariCompatibility)select.options[1].disabled=true;
  const note=document.createElement('small');
  const describe=()=>{note.textContent=safariCompatibility?'Safari 17及更早版本使用30帧兼容模式，降低绘制负载；不改变游戏速度或计分。':'不改变游戏速度、难度或计分。';};
  select.onchange=()=>{apply(select.value);describe();};describe();label.append(select,note);controls.prepend(label);
 });
})(typeof globalThis!=='undefined'?globalThis:this);
