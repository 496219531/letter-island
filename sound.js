/* Original cartoon sound synthesis: bounded buffers, voices and event rates. */
(function(root){
  const SPECS={shot:[.11,310],flesh:[.15,115],metal:[.3,690],shield:[.25,940],iceHit:[.19,1350],kill:[.42,135],groan:[.95,83],boss:[1.25,58],nibble:[.2,170],laser:[.65,170],freeze:[.75,1100],melon:[.55,480],explosion:[.6,70],critical:[.22,720],warning:[.27,155]};
  const GAPS={shot:.045,flesh:.07,metal:.08,shield:.09,iceHit:.08,kill:.18,groan:2.8,boss:3,nibble:.22,explosion:.16,critical:.12,warning:1.8};
  function samples(kind,variant=0,rate=22050){
    const [duration,base]=SPECS[kind],out=new Float32Array(Math.ceil(duration*rate));let phase=0,low=0,seed=12345+variant*3571;
    for(let i=0;i<out.length;i++){
      const t=i/rate,p=t/duration,attack=Math.min(1,t/.008),env=attack*Math.pow(1-p,1.6);
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low+=.15*(noise-low);
      const pitch=base*(1+(variant-1)*.075);let v=0;
      if(['groan','boss','kill'].includes(kind)){
        const hz=pitch*(1+.05*Math.sin(t*29))*(1-.3*p);phase+=2*Math.PI*hz/rate;
        // Glottal harmonics with two vowel resonances give a silly, rounded "urr-ah".
        for(let h=1;h<=12;h++){const f=h*hz,formant=280+220*p;const w=.12/h+.28*Math.exp(-Math.pow((f-formant)/130,2))+.1*Math.exp(-Math.pow((f-1000)/230,2));v+=Math.sin(phase*h)*w;}
        v=(v*.65+low*.14)*(.8+.2*Math.sin(t*19));
      }else if(kind==='metal'||kind==='shield'||kind==='iceHit'){
        for(const [r,w] of [[1,.5],[1.47,.26],[2.31,.16],[3.82,.08]])v+=Math.sin(2*Math.PI*pitch*r*t)*w*Math.exp(-p*r*4);
        v+=noise*.12*Math.exp(-p*30);
      }else if(kind==='explosion'){v=low*2.5*Math.exp(-p*3)+Math.sin(2*Math.PI*(pitch*t-35*t*t))*.45*Math.exp(-p*5);}
      else if(kind==='nibble'){const pulse=Math.pow(Math.max(0,Math.sin(t*85)),3);v=noise*.55*pulse+Math.sin(2*Math.PI*pitch*t)*.25*pulse;}
      else if(kind==='freeze'){v=(Math.sin(2*Math.PI*(pitch*t+1200*t*t))*.35+Math.sin(2*Math.PI*pitch*1.5*t)*.2+noise*.3)*(.7+.3*Math.sin(t*55));}
      else if(kind==='laser'){phase+=2*Math.PI*pitch*(1+7*p)/rate;v=Math.sin(phase)*.45+Math.sin(phase*2)*.2+noise*.08;}
      else if(kind==='melon'){phase+=2*Math.PI*pitch*(1-.85*p)/rate;v=Math.sin(phase)*.65+Math.sin(phase*2)*.14;}
      else if(kind==='flesh'){v=low*1.6*Math.exp(-p*7)+Math.sin(2*Math.PI*(pitch*t-100*t*t))*.5*Math.exp(-p*5);}
      else {phase+=2*Math.PI*pitch*(kind==='shot'?1-.7*p:1+.5*p)/rate;v=Math.sin(phase)*.65+noise*.15*Math.exp(-p*14);}
      out[i]=Math.tanh(v*1.2)*env*.65;
    }
    return out;
  }
  class GardenAudio{
    constructor(factory){this.factory=factory;this.context=null;this.enabled=true;this.voices=new Set();this.cache=new Map();this.last=new Map();this.nextGroan=2;}
    init(){if(!this.enabled)return false;if(!this.context){this.context=this.factory();const c=this.context;this.master=c.createGain();this.master.gain.value=.65;this.compressor=c.createDynamicsCompressor();this.compressor.threshold.value=-16;this.compressor.ratio.value=5;this.master.connect(this.compressor);this.compressor.connect(c.destination);}if(this.context.state==='suspended')this.context.resume().catch(()=>{});return true;}
    start(buffer,volume,pan=0){if(this.voices.size>=32)return false;const c=this.context,source=c.createBufferSource(),gain=c.createGain(),stereo=c.createStereoPanner();source.buffer=buffer;gain.gain.value=volume;stereo.pan.value=Math.max(-.65,Math.min(.65,pan));source.connect(gain);gain.connect(stereo);stereo.connect(this.master);
      const voice={source,cleanup:()=>{if(!this.voices.delete(voice))return;source.onended=null;source.disconnect();gain.disconnect();stereo.disconnect();}};this.voices.add(voice);source.onended=voice.cleanup;try{source.start();}catch(e){voice.cleanup();throw e;}return true;
    }
    play(kind,{x=500,boss=false}={}){if(!SPECS[kind]||!this.enabled)return;try{if(!this.init())return;const now=this.context.currentTime;if(now-(this.last.get(kind)??-Infinity)<(GAPS[kind]||.1))return;this.last.set(kind,now);const variant=Math.floor(Math.random()*3),key=kind+variant;let buffer=this.cache.get(key);if(!buffer){const data=samples(kind,variant);buffer=this.context.createBuffer(1,data.length,22050);buffer.getChannelData(0).set(data);this.cache.set(key,buffer);}const quiet=['groan','boss'].includes(kind)?.28:kind==='shot'?.28:kind==='warning'?.3:.45;this.start(buffer,quiet,(x-500)/700);}catch{this.setEnabled(false);}}
    tone(frequency,duration=.1,type='sine',volume=.035,end=frequency){if(!this.enabled)return;try{if(!this.init()||this.voices.size>=32)return;const rate=22050,buffer=this.context.createBuffer(1,Math.ceil(duration*rate),rate),data=buffer.getChannelData(0);let phase=0;for(let i=0;i<data.length;i++){const p=i/data.length;phase+=2*Math.PI*(frequency+(end-frequency)*p)/rate;data[i]=Math.sin(phase)*Math.min(1,p*20)*Math.pow(1-p,2);}this.start(buffer,Math.min(.3,volume*3));}catch{this.setEnabled(false);}}
    stop(){for(const voice of [...this.voices]){try{voice.source.stop();}catch{}voice.cleanup();}this.nextGroan=2;}
    setEnabled(value){this.enabled=value;if(!value)this.stop();}
    update(dt,game){if(!this.enabled||!this.context||game.status!=='playing'||game.freeze>0)return;this.nextGroan-=dt;if(this.nextGroan>0)return;this.nextGroan=3+Math.random()*4;const candidates=game.enemies.filter(z=>z.hp>0&&z.x<1000);if(candidates.length){const z=candidates[Math.floor(Math.random()*candidates.length)];this.play(z.boss?'boss':'groan',{x:z.x});}}
  }
  root.GardenAudio=GardenAudio;if(typeof module!=='undefined')module.exports={GardenAudio,samples,SPECS};
})(typeof globalThis!=='undefined'?globalThis:this);
