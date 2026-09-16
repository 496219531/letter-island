/* Layered arcade effects with a sparse, separately scheduled zombie voice. */
(function(root){
  'use strict';
  const RATE=44100,TAU=Math.PI*2,FANFARE=[1,1.25,1.5,2];
  const SPECS={shot:[.085,880],flesh:[.095,640],metal:[.22,1480],shield:[.28,1046.5],iceHit:[.18,2093],kill:[.24,783.99],groan:[.85,145],boss:[.65,261.63],nibble:[.18,920],laser:[.38,1244.5],freeze:[.65,1567.98],melon:[.36,740],explosion:[.42,130],critical:[.25,1567.98],warning:[.4,523.25],step:[.16,420],horde:[.9,392],celebrate:[1.0,783.99]};
  const GAPS={shot:.07,flesh:.065,metal:.09,shield:.1,iceHit:.09,kill:.13,groan:6,boss:3,nibble:.3,laser:.18,freeze:.4,melon:.2,explosion:.22,critical:.16,warning:2.5,step:1.1,horde:5,celebrate:2};
  const LEVELS={shot:.16,flesh:.16,metal:.13,shield:.16,iceHit:.12,kill:.18,groan:.24,boss:.24,nibble:.13,laser:.26,freeze:.22,melon:.18,explosion:.26,critical:.18,warning:.16,step:.035,horde:.23,celebrate:.22};
  const CAPS={shot:3,flesh:5,metal:4,shield:3,iceHit:4,kill:3,groan:1,boss:1,nibble:1,laser:2,freeze:1,melon:2,explosion:2,critical:2,warning:1,step:1,horde:1,celebrate:1};
  const SPELLS=new Set(['laser','freeze','melon','explosion','boss','horde','celebrate']);
  function samples(kind,variant=0,rate=RATE){
    if(!SPECS[kind])throw new Error('Unknown sound: '+kind);
    const [duration,base]=SPECS[kind],out=new Float32Array(Math.ceil(duration*rate)),pitch=base*(1+(variant-1)*.023);
    let seed=12345+variant*3571,slow=0,fast=0,phase=0,previous=0,high=0,smooth=0;
    const cutoff=kind==='explosion'?85:kind==='boss'?150:kind==='groan'?95:220;
    const hp=Math.exp(-TAU*cutoff/rate),lp=1-Math.exp(-TAU*7200/rate);
    function bell(t,f,decay){return (Math.sin(TAU*f*t)+.23*Math.sin(TAU*f*2.01*t)*Math.exp(-t*16)+.07*Math.sin(TAU*f*3.97*t)*Math.exp(-t*28))*Math.exp(-t*decay);}
    for(let i=0;i<out.length;i++){
      const t=i/rate,p=t/duration;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const white=seed/2147483648-1;slow+=.055*(white-slow);fast+=.48*(white-fast);
      const brush=fast-slow,air=white-fast;
      let v=0;
      switch(kind){
        case 'shot':
          // A tiny wooden spring plus a dry air click; no sub-bass pitch dive.
          v=.65*bell(t,pitch,67)+.24*brush*Math.exp(-t*100)+.1*air*Math.exp(-t*180);break;
        case 'flesh':
          v=.6*brush*Math.exp(-t*55)+.32*bell(t,pitch,60)+.12*bell(t,pitch*1.61,90);break;
        case 'metal':
          v=.48*bell(t,pitch,24)+.2*bell(t,pitch*1.47,35)+.07*air*Math.exp(-t*95);break;
        case 'shield':
          v=.55*bell(t,pitch,18)+.22*bell(t,pitch*1.5,22)+.07*bell(t,pitch*2.5,35);break;
        case 'iceHit':
          v=.35*bell(t,pitch,32)+.25*bell(t,pitch*1.26,38)+.3*air*Math.exp(-t*75);break;
        case 'kill':{
          const second=Math.max(0,t-.055);
          v=.42*bell(t,pitch,25)+(t>.055?.34*bell(second,pitch*1.5,28):0);break;
        }
        case 'groan': {
          // Original playful zombie growl, restored by user preference.
          phase+=TAU*pitch*(1-.22*p+.045*Math.sin(TAU*(7+variant)*t))/rate;
          const throat=.3*Math.sin(phase)+.3*Math.sin(phase*2)+.2*Math.sin(phase*3)+.1*Math.sin(phase*5);
          v=(Math.tanh(throat*1.7)*.42+.16*brush)*Math.pow(Math.sin(Math.PI*p),.8)*(.8+.2*Math.sin(TAU*29*t));break;
        }
        case 'boss':
          v=(.4*bell(t,pitch,6)+.3*bell(t,pitch*1.5,7)+.16*bell(t,pitch*2,10))+.12*brush*Math.exp(-t*28);break;
        case 'nibble':{
          const offset=.04+variant*.012,second=Math.max(0,t-offset);
          v=.5*brush*(Math.exp(-t*85)+(t>offset?.7*Math.exp(-second*95):0))+.25*bell(t,pitch,65)+.08*air*Math.exp(-t*42);break;
        }
        case 'step':{
          v=.32*brush*Math.exp(-t*45)+.14*bell(t,pitch,65)+.06*air*Math.sin(Math.PI*p)*Math.exp(-p*5);break;
        }
        case 'horde':{
          for(let n=0;n<2+variant;n++){const age=t-n*.16;if(age>=0)v+=.4*bell(age,pitch*(n%2?1.33:1),15)+.24*brush*Math.exp(-age*30);}
          if(t>.5)v+=.17*bell(t-.5,pitch*2,10);break;
        }
        case 'celebrate':{
          const notes=FANFARE;
          for(let n=0;n<notes.length;n++){const age=t-n*.13;if(age>=0)v+=.27*bell(age,pitch*notes[n],10+n);}
          if(t>.42)v+=.1*bell(t-.42,pitch*2.5,14);break;
        }
        case 'laser':
          phase+=TAU*(pitch*(1-.23*p))/rate;
          v=(.5*Math.sin(phase)+.13*Math.sin(phase*2))*(1-Math.exp(-t*250))*Math.exp(-t*11)+.14*brush*Math.exp(-t*35);break;
        case 'freeze':{
          v=.08*air*Math.sin(Math.PI*p)*Math.exp(-p*2);
          for(let n=0;n<4;n++){const age=t-n*.055;if(age>=0)v+=.27*bell(age,pitch*FANFARE[n],12+n*3);}
          break;
        }
        case 'melon':
          phase+=TAU*pitch*(1+.6*p)/rate;
          v=.3*brush*Math.sin(Math.PI*p)*Math.exp(-p*1.2)+.3*Math.sin(phase)*Math.sin(Math.PI*p)*Math.exp(-p*2);break;
        case 'explosion':
          v=brush*.95*Math.exp(-t*22)+slow*.65*Math.exp(-t*17)+.36*Math.sin(TAU*pitch*t)*Math.exp(-t*23)+.2*air*Math.exp(-t*65);break;
        case 'critical':
          v=.5*bell(t,pitch,22)+.28*bell(t,pitch*1.5,25);break;
        case 'warning':{
          const age=t% .18;
          v=t<.34?.42*bell(age,pitch*(t<.18?1:1.25),24):0;break;
        }
      }
      // Remove rumble/DC and tame the highest hiss without saturating the signal.
      high=hp*(high+v-previous);previous=v;smooth+=lp*(high-smooth);
      const attack=Math.min(1,t/.0025),tail=Math.min(1,(duration-t)/.022);
      out[i]=smooth*attack*Math.max(0,tail);
    }
    const peak=out.reduce((m,x)=>Math.max(m,Math.abs(x)),0),gain=peak>.001?.7/peak:1;
    for(let i=0;i<out.length;i++)out[i]*=gain;
    out[0]=0;out[out.length-1]=0;
    return out;
  }
  class GardenAudio{
    constructor(factory){this.factory=factory;this.context=null;this.enabled=true;this.volume=.6;this.recording=false;this.voices=new Set();this.cache=new Map();this.last=new Map();this.duckUntil=0;this.ambientClock=0;this.stepDelay=1.4;this.chewDelay=0;this.groanDelay=2;this.nativeMinorNext=0;this.nativeUiNext=0;this.customEffects=new Map();this.customPlaying=new Set();this.customGeneration=0;
      for(const kind of Object.keys(SPECS)){try{const clip=root.localStorage?.getItem('gulu-effect-recording-v1-'+kind)||(kind==='groan'?root.localStorage?.getItem('gulu-zombie-recording-v1'):null);if(clip&&/^data:audio\//.test(clip)&&clip.length<1400000&&root.Audio){const audio=new root.Audio(clip);audio.preload='none';this.customEffects.set(kind,audio);}}catch{}}
    }

    init(){
      if(!this.enabled||this.failed)return false;
      if(root.GuluNative?.playEffect)return true;
      if(!this.context||this.context.state==='closed'){this.stop();const c=this.factory();this.master=c.createGain();this.master.gain.value=this.volume*.65*(this.recording?.15:1);this.compressor=c.createDynamicsCompressor();
        this.compressor.threshold.value=-12;this.compressor.ratio.value=3;
        if(this.compressor.knee)this.compressor.knee.value=18;if(this.compressor.attack)this.compressor.attack.value=.004;if(this.compressor.release)this.compressor.release.value=.12;
        this.master.connect(this.compressor);this.compressor.connect(c.destination);this.context=c;
      }
      if(['suspended','interrupted'].includes(this.context.state))this.resumeContext().catch(error=>{this.lastError=String(error?.message||error);});return this.context.state==='running';
    }
    resumeContext(){
      // Retry inside each new gesture: an earlier Safari resume can stay pending.
      return Promise.resolve(this.context.resume());
    }
    async unlock(){
      if(!this.enabled)return false;
      this.failed=false;
      try{
        // Safari's playback session routes game audio as media, not ambient sound.
        if(!root.GuluNative&&!this.recording&&root.navigator?.audioSession){try{if(root.navigator.audioSession.type!=='playback')root.navigator.audioSession.type='playback';}catch{}}
        this.init();
        if(root.GuluNative?.playEffect)return true;
        if(this.context.state!=='running'){
          let timeout;try{await Promise.race([this.resumeContext(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Audio permission is still blocked')),2000);})]);}finally{clearTimeout(timeout);}
        }
        const ready=this.context.state==='running';if(ready)this.lastError=null;return ready;
      }catch(error){this.lastError=String(error?.message||error);this.failed=true;return false;}
    }
    recover(){
      this.stop();const old=this.context;this.context=null;this.failed=false;this.lastError=null;
      try{this.master?.disconnect();this.compressor?.disconnect();}catch{}
      this.master=null;this.compressor=null;
      try{old?.close?.()?.catch?.(()=>{});}catch{}
      return this.unlock();
    }
    start(buffer,volume,pan=0,kind='ui'){
      if(this.voices.size>=32){const quiet=SPELLS.has(kind)?[...this.voices].find(v=>!SPELLS.has(v.kind)):null;if(!quiet)return false;try{quiet.source.stop();}catch{}quiet.cleanup();}
      const c=this.context,source=c.createBufferSource(),gain=c.createGain(),stereo=c.createStereoPanner?c.createStereoPanner():c.createGain();source.buffer=buffer;gain.gain.value=volume;if(stereo.pan)stereo.pan.value=Math.max(-.6,Math.min(.6,pan));
      source.connect(gain);gain.connect(stereo);stereo.connect(this.master);
      const voice={source,kind,cleanup:()=>{if(!this.voices.delete(voice))return;source.onended=null;source.disconnect();gain.disconnect();stereo.disconnect();}};
      this.voices.add(voice);source.onended=voice.cleanup;try{source.start();}catch(e){voice.cleanup();throw e;}return true;
    }
    playSkill(kind,options={}){
      // A cast must not be suppressed by a recent wave/boss cue using the same sound.
      this.last.delete(kind);
      for(const voice of [...this.voices])if(voice.kind===kind){try{voice.source.stop();}catch{}voice.cleanup();}
      const clip=this.customEffects.get(kind);if(clip){try{clip.pause();}catch{}this.customPlaying.delete(kind);}
      this.play(kind,options);
    }
    play(kind,{x=500,variant:chosenVariant}={}){
      if(!SPECS[kind]||!this.enabled||this.volume===0)return;
      if(this.customEffects.has(kind)){
        const now=Date.now()/1000,clip=this.customEffects.get(kind);
        if(now-(this.last.get(kind)??-Infinity)<GAPS[kind]||this.customPlaying.has(kind)||this.customPlaying.size>=3)return;
        this.last.set(kind,now);this.customPlaying.add(kind);const generation=this.customGeneration;
        clip.volume=this.volume*.65*(this.recording?.15:1);try{clip.currentTime=0;}catch{}
        clip.onended=()=>this.customPlaying.delete(kind);
        const failed=()=>{if(this.customGeneration!==generation||this.customEffects.get(kind)!==clip)return;try{clip.pause();}catch{}this.customPlaying.delete(kind);this.customEffects.delete(kind);this.last.delete(kind);this.play(kind,{x});};
        clip.onerror=failed;try{clip.play().catch(failed);}catch{failed();}return;
      }
      if(root.GuluNative?.playEffect){const now=Date.now()/1000,priority=SPELLS.has(kind)||kind==='warning';if(now-(this.last.get(kind)??-Infinity)<GAPS[kind]||(!priority&&now<this.nativeMinorNext))return;this.last.set(kind,now);if(!priority)this.nativeMinorNext=now+.085;root.__guluLastNativeSound={kind,at:root.performance?.now?.()||Date.now()};root.GuluNative.playEffect(kind,Number.isInteger(chosenVariant)?Math.max(0,Math.min(2,chosenVariant)):Math.floor(Math.random()*3),LEVELS[kind],Math.max(-.6,Math.min(.6,(x-500)/900)));return;}
      try{
        if(!this.init())return;
        const now=this.context.currentTime;if(now-(this.last.get(kind)??-Infinity)<GAPS[kind])return;
        if([...this.voices].filter(v=>v.kind===kind).length>=CAPS[kind])return;
        const variant=Number.isInteger(chosenVariant)?Math.max(0,Math.min(2,chosenVariant)):Math.floor(Math.random()*3),key=kind+variant;let buffer=this.cache.get(key);
        if(!buffer){const rate=['step','horde','celebrate'].includes(kind)?22050:RATE,data=samples(kind,variant,rate);buffer=this.context.createBuffer(1,data.length,rate);buffer.getChannelData(0).set(data);this.cache.set(key,buffer);}
        if(SPELLS.has(kind))this.duckUntil=now+.25;
        const duck=now<this.duckUntil&&!SPELLS.has(kind)?.5:1;
        if(this.start(buffer,LEVELS[kind]*duck,(x-500)/900,kind))this.last.set(kind,now);
      }catch(error){this.lastError=String(error?.message||error);this.failed=true;this.stop();}
    }
    tone(frequency,duration=.1,type='sine',volume=.035,end=frequency){
      if(!this.enabled||this.volume===0)return;
      if(root.GuluNative?.playEffect){const now=Date.now()/1000;if(now-(this.last.get('ui')??-Infinity)<.045||now<this.nativeUiNext)return;this.last.set('ui',now);this.nativeUiNext=now+.075;root.__guluLastNativeSound={kind:'ui',at:root.performance?.now?.()||Date.now()};root.GuluNative.playEffect('ui',frequency<720?0:frequency<840?1:2,Math.min(.12,volume*2),0);return;}
      try{
        if(!this.init()||this.voices.size>=32)return;
        const now=this.context.currentTime;if(now-(this.last.get('ui')??-Infinity)<.045)return;this.last.set('ui',now);
        const length=Math.max(.025,Math.min(.32,duration)),buffer=this.context.createBuffer(1,Math.ceil(length*RATE),RATE),data=buffer.getChannelData(0);let phase=0;
        for(let i=0;i<data.length;i++){const t=i/RATE,p=i/(data.length-1);phase+=TAU*(frequency+(end-frequency)*p)/RATE;data[i]=(Math.sin(phase)+.12*Math.sin(phase*2))*Math.min(1,t/.003)*Math.exp(-t*35)*Math.pow(1-p,1.5)*.65;}
        this.start(buffer,Math.min(.12,volume*2),0,'ui');
      }catch(error){this.lastError=String(error?.message||error);this.failed=true;this.stop();}
    }
    applyVolume(){const target=this.volume*.65*(this.recording?.15:1);for(const clip of this.customEffects.values())clip.volume=target;if(root.GuluNative?.setEffectGain)root.GuluNative.setEffectGain(target);if(this.master){const gain=this.master.gain;if(gain.setTargetAtTime)gain.setTargetAtTime(target,this.context.currentTime,.025);else gain.value=target;}}
    setRecording(value){const next=Boolean(value);if(this.recording===next)return;this.recording=next;this.applyVolume();}
    setVolume(value){const n=Number(value);if(!Number.isFinite(n))return;this.volume=Math.max(0,Math.min(1,n));this.applyVolume();if(this.volume===0)this.stop();}
    stop({preserveSkills=false}={}){
      if(!preserveSkills)this.customGeneration++;
      for(const [kind,clip] of this.customEffects){if(preserveSkills&&SPELLS.has(kind))continue;this.customPlaying.delete(kind);this.last.delete(kind);try{clip.pause();clip.currentTime=0;}catch{}}
      if(!preserveSkills)root.GuluNative?.stopEffects?.();
      for(const voice of [...this.voices]){if(preserveSkills&&SPELLS.has(voice.kind))continue;try{voice.source.stop();}catch{}voice.cleanup();}
      if(!preserveSkills){this.customPlaying.clear();this.last.clear();this.duckUntil=0;this.nativeMinorNext=0;this.nativeUiNext=0;}
      this.ambientClock=0;this.stepDelay=1.4;this.chewDelay=0;this.groanDelay=2;
    }

    setEnabled(value){this.enabled=Boolean(value);if(!value)this.stop();}
    // One quiet crowd channel, sampled at 4Hz; never one sound source per zombie.
    update(dt,game){
      if(!this.enabled||this.volume===0||this.recording||root.document?.hidden||game?.status!=='playing')return;
      this.ambientClock+=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;if(this.ambientClock<.25)return;
      const elapsed=this.ambientClock;this.ambientClock=0;this.stepDelay-=elapsed;this.chewDelay-=elapsed;this.groanDelay-=elapsed;
      let walker=null,chewer=null,count=0;
      for(const z of game.enemies||[]){if(z.hp<=0)continue;if(z.eating||z.engaged||z.charmEngaged||(z.speed===undefined&&z.x<=195&&game.health>0))chewer=chewer||z;else if((z.speed>0||(z.speed===undefined&&Number.isFinite(z.gait)))&&z.x>75){count++;walker=walker||z;}}
      if((walker||chewer)&&this.groanDelay<=0){this.play('groan',{x:(walker||chewer).x});this.groanDelay=7;}
      if(chewer&&this.chewDelay<=0){this.play('nibble',{x:chewer.x});this.chewDelay=.6;}
      if(walker&&this.stepDelay<=0){this.play('step',{x:walker.x});this.stepDelay=(count>=12?1.4:2.2)/(game.freeze>0?.5:1)/(game.typingSlow?.22:1);}
    }
  }
  root.GardenAudio=GardenAudio;if(typeof module!=='undefined')module.exports={GardenAudio,samples,SPECS,LEVELS,GAPS,CAPS,RATE};
})(typeof globalThis!=='undefined'?globalThis:this);
