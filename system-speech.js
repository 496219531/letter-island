/* OS dictation writes into a normal text field. Demonstrations use local voices only. */
(function(root){
  'use strict';
  function createLocalSpeech(synth,Utterance){
    const femaleEnglish=/samantha|karen|moira|tessa|kathy|victoria|zira|aria|jenny|female/i;
    function voice(){const voices=(synth?.getVoices()||[]).filter(v=>v.localService&&/^en(?:[-_]|$)/i.test(v.lang));return voices.find(v=>femaleEnglish.test(v.name)&&/^en-US$/i.test(v.lang))||voices.find(v=>femaleEnglish.test(v.name))||voices.find(v=>/^en-US$/i.test(v.lang))||voices[0];}
    function chineseVoice(){const voices=(synth?.getVoices()||[]).filter(v=>v.localService&&/^zh(?:[-_]|$)/i.test(v.lang));return voices.find(v=>/^zh[-_]CN$/i.test(v.lang))||voices[0];}
    const pending=new Set();
    function cancel(){pending.clear();synth?.cancel();}
    return {
      available(){return Boolean(synth&&Utterance&&voice());},
      cancel,
      enqueueLearning(text,meaning,{chinese=true,volume=1,onError=()=>{}}={}){
        const english=voice();if(!english||!Utterance)return false;
        const zh=chineseVoice();
        const lines=[[text,english],...(chinese&&meaning&&zh?[[meaning,zh]]:[])];
        for(const [line,chosen] of lines){
          const u=new Utterance(String(line).replaceAll(" / ",". "));u.voice=chosen;u.lang=chosen.lang;u.rate=.9;u.pitch=1;u.volume=Math.max(0,Math.min(1,volume));
          pending.add(u);u.onend=()=>pending.delete(u);u.onerror=e=>{pending.delete(u);if(!["interrupted","canceled"].includes(e.error))onError(e.error);};
          try{synth.speak(u);}catch{pending.delete(u);onError("unavailable");return false;}
        }
        if(chinese&&meaning&&!zh)onError("missing-chinese");
        return true;
      },
      speak(text,onError=()=>{}){
        const chosen=voice();if(!chosen||!Utterance)return false;
        cancel();const utterance=new Utterance(text);utterance.voice=chosen;utterance.lang=chosen.lang;utterance.rate=.85;
        utterance.onerror=event=>{if(!['interrupted','canceled'].includes(event.error))onError(event.error);};
        synth.speak(utterance);return true;
      }
    };
  }
  root.GuluSystemSpeech={createLocalSpeech};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSystemSpeech;
})(typeof globalThis!=='undefined'?globalThis:this);
