/* Dry, layered arcade sound design. No vocal/formant buzz or low sliding notes. */
(function(root){
  'use strict';
  const RATE=44100,TAU=Math.PI*2;
  const SPECS={shot:[.085,880],flesh:[.095,640],metal:[.22,1480],shield:[.28,1046.5],iceHit:[.18,2093],kill:[.24,783.99],groan:[.32,430],boss:[.65,261.63],nibble:[.11,920],laser:[.38,1244.5],freeze:[.65,1567.98],melon:[.36,740],explosion:[.42,130],critical:[.25,1567.98],warning:[.4,523.25]};
  const GAPS={shot:.07,flesh:.065,metal:.09,shield:.1,iceHit:.09,kill:.13,groan:6,boss:3,nibble:.18,laser:.18,freeze:.4,melon:.2,explosion:.22,critical:.16,warning:2.5};
  const LEVELS={shot:.16,flesh:.16,metal:.13,shield:.16,iceHit:.12,kill:.18,groan:.055,boss:.24,nibble:.1,laser:.26,freeze:.22,melon:.18,explosion:.26,critical:.18,warning:.16};
  const CAPS={shot:3,flesh:5,metal:4,shield:3,iceHit:4,kill:3,groan:1,boss:1,nibble:2,laser:2,freeze:1,melon:2,explosion:2,critical:2,warning:1};
  const SPELLS=new Set(['laser','freeze','melon','explosion','boss']);
  function samples(kind,variant=0,rate=RATE){
    if(!SPECS[kind])throw new Error('Unknown sound: '+kind);
    const [duration,base]=SPECS[kind],out=new Float32Array(Math.ceil(duration*rate)),pitch=base*(1+(variant-1)*.023);
    let seed=12345+variant*3571,slow=0,fast=0,phase=0,previous=0,high=0,smooth=0;
    const cutoff=kind==='explosion'?85:kind==='boss'?150:kind==='groan'?260:220;
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
        case 'groan':
          // Compatibility sound only: a soft rustle, never an automatic low groan.
          v=brush*.3*Math.sin(Math.PI*p)*Math.exp(-p*3);break;
        case 'boss':
          v=(.4*bell(t,pitch,6)+.3*bell(t,pitch*1.5,7)+.16*bell(t,pitch*2,10))+.12*brush*Math.exp(-t*28);break;
        case 'nibble':{
          const second=Math.max(0,t-.045);
          v=.45*brush*(Math.exp(-t*110)+(t>.045?.65*Math.exp(-second*110):0))+.22*bell(t,pitch,90);break;
        }
        case 'laser':
          phase+=TAU*(pitch*(1-.23*p))/rate;
          v=(.5*Math.sin(phase)+.13*Math.sin(phase*2))*(1-Math.exp(-t*250))*Math.exp(-t*11)+.14*brush*Math.exp(-t*35);break;
        case 'freeze':{
          v=.08*air*Math.sin(Math.PI*p)*Math.exp(-p*2);
          for(let n=0;n<4;n++){const age=t-n*.055;if(age>=0)v+=.27*bell(age,pitch*[1,1.25,1.5,2][n],12+n*3);}
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
    constructor(factory){this.factory=factory;this.context=null;this.enabled=true;this.volume=.6;this.recording=false;this.voices=new Set();this.cache=new Map();this.last=new Map();this.duckUntil=0;this.nextGroan=Infinity;}
    init(){
      if(!this.enabled)return false;
      if(root.GuluNative?.playEffect)return true;
      if(!this.context){const c=this.context=this.factory();this.master=c.createGain();this.master.gain.value=this.volume*.65*(this.recording?.15:1);this.compressor=c.createDynamicsCompressor();
        this.compressor.threshold.value=-12;this.compressor.ratio.value=3;
        if(this.compressor.knee)this.compressor.knee.value=18;if(this.compressor.attack)this.compressor.attack.value=.004;if(this.compressor.release)this.compressor.release.value=.12;
        this.master.connect(this.compressor);this.compressor.connect(c.destination);
      }
      if(['suspended','interrupted'].includes(this.context.state))this.context.resume().catch(()=>{});return true;
    }
    start(buffer,volume,pan=0,kind='ui'){
      if(this.voices.size>=32)return false;
      const c=this.context,source=c.createBufferSource(),gain=c.createGain(),stereo=c.createStereoPanner();source.buffer=buffer;gain.gain.value=volume;stereo.pan.value=Math.max(-.6,Math.min(.6,pan));
      source.connect(gain);gain.connect(stereo);stereo.connect(this.master);
      const voice={source,kind,cleanup:()=>{if(!this.voices.delete(voice))return;source.onended=null;source.disconnect();gain.disconnect();stereo.disconnect();}};
      this.voices.add(voice);source.onended=voice.cleanup;try{source.start();}catch(e){voice.cleanup();throw e;}return true;
    }
    play(kind,{x=500}={}){
      if(!SPECS[kind]||!this.enabled||this.volume===0)return;
      if(root.GuluNative?.playEffect){const now=Date.now()/1000;if(now-(this.last.get(kind)??-Infinity)<GAPS[kind])return;this.last.set(kind,now);root.GuluNative.playEffect(kind,Math.floor(Math.random()*3),LEVELS[kind],Math.max(-.6,Math.min(.6,(x-500)/900)));return;}
      try{
        if(!this.init())return;
        const now=this.context.currentTime;if(now-(this.last.get(kind)??-Infinity)<GAPS[kind])return;
        if([...this.voices].filter(v=>v.kind===kind).length>=CAPS[kind])return;
        const variant=Math.floor(Math.random()*3),key=kind+variant;let buffer=this.cache.get(key);
        if(!buffer){const data=samples(kind,variant);buffer=this.context.createBuffer(1,data.length,RATE);buffer.getChannelData(0).set(data);this.cache.set(key,buffer);}
        if(SPELLS.has(kind))this.duckUntil=now+.25;
        const duck=now<this.duckUntil&&!SPELLS.has(kind)?.5:1;
        if(this.start(buffer,LEVELS[kind]*duck,(x-500)/900,kind))this.last.set(kind,now);
      }catch(error){this.lastError=String(error?.message||error);this.setEnabled(false);}
    }
    tone(frequency,duration=.1,type='sine',volume=.035,end=frequency){
      if(!this.enabled||this.volume===0)return;
      if(root.GuluNative?.playEffect){const now=Date.now()/1000;if(now-(this.last.get('ui')??-Infinity)<.045)return;this.last.set('ui',now);root.GuluNative.playEffect('ui',frequency<720?0:frequency<840?1:2,Math.min(.12,volume*2),0);return;}
      try{
        if(!this.init()||this.voices.size>=32)return;
        const now=this.context.currentTime;if(now-(this.last.get('ui')??-Infinity)<.045)return;this.last.set('ui',now);
        const length=Math.max(.025,Math.min(.32,duration)),buffer=this.context.createBuffer(1,Math.ceil(length*RATE),RATE),data=buffer.getChannelData(0);let phase=0;
        for(let i=0;i<data.length;i++){const t=i/RATE,p=i/(data.length-1);phase+=TAU*(frequency+(end-frequency)*p)/RATE;data[i]=(Math.sin(phase)+.12*Math.sin(phase*2))*Math.min(1,t/.003)*Math.exp(-t*35)*Math.pow(1-p,1.5)*.65;}
        this.start(buffer,Math.min(.12,volume*2),0,'ui');
      }catch(error){this.lastError=String(error?.message||error);this.setEnabled(false);}
    }
    applyVolume(){const target=this.volume*.65*(this.recording?.15:1);if(root.GuluNative?.setEffectGain)root.GuluNative.setEffectGain(target);if(this.master){const gain=this.master.gain;if(gain.setTargetAtTime)gain.setTargetAtTime(target,this.context.currentTime,.025);else gain.value=target;}}
    setRecording(value){const next=Boolean(value);if(this.recording===next)return;this.recording=next;this.applyVolume();}
    setVolume(value){const n=Number(value);if(!Number.isFinite(n))return;this.volume=Math.max(0,Math.min(1,n));this.applyVolume();if(this.volume===0)this.stop();}
    stop(){root.GuluNative?.stopEffects?.();for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}this.duckUntil=0;this.last.clear();}
    setEnabled(value){this.enabled=Boolean(value);if(!value)this.stop();}
    // Silence between actions is intentional; no recurring synthetic zombie groans.
    update(){}
  }
  root.GardenAudio=GardenAudio;if(typeof module!=='undefined')module.exports={GardenAudio,samples,SPECS,LEVELS,GAPS,CAPS,RATE};
})(typeof globalThis!=='undefined'?globalThis:this);
