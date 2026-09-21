/* OS dictation writes into a normal text field. Demonstrations use local voices only. */
(function(root){
  'use strict';
  function createLocalSpeech(synth,Utterance){
    const femaleEnglish=/samantha|karen|moira|tessa|kathy|victoria|zira|aria|jenny|female/i;
    function voice(){const voices=(synth?.getVoices()||[]).filter(v=>v.localService&&/^en(?:[-_]|$)/i.test(v.lang));return voices.find(v=>femaleEnglish.test(v.name)&&/^en-US$/i.test(v.lang))||voices.find(v=>femaleEnglish.test(v.name))||voices.find(v=>/^en-US$/i.test(v.lang))||voices[0];}
    function chineseVoice(){
      const voices=(synth?.getVoices()||[]).filter(v=>v.localService&&!/cantonese|粤语|廣東話|广东话/i.test(v.name||'')&&/^(?:zh-(?:CN|SG)(?:-|$)|zh-Hans(?:-|$)|cmn(?:-|$))/i.test(String(v.lang).replaceAll('_','-')));
      return voices.find(v=>/^zh[-_]CN$/i.test(v.lang))||voices[0];
    }
    const pending=new Set(),MAX_PENDING=10;
    function release(u){pending.delete(u);u.onend=null;u.onerror=null;}
    function cancel(){for(const u of pending){u.onend=null;u.onerror=null;}pending.clear();synth?.cancel();}
    return {
      available(){return Boolean(synth&&Utterance&&voice());},
      cancel,
      enqueueLearning(text,meaning,{chinese=true,volume=1,onError=()=>{}}={}){
        const english=voice();if(!english||!Utterance)return false;
        const zh=chineseVoice();
        const lines=[[text,english],...(chinese&&meaning&&zh?[[meaning,zh]]:[])];
        // Bound both the native speech queue and JS references if playback is
        // slower than practice, or Safari stops delivering completion events.
        if(pending.size+lines.length>MAX_PENDING){onError("queue-full");return true;}
        for(const [line,chosen] of lines){
          const u=new Utterance(String(line).replaceAll(" / ",". "));u.voice=chosen;u.lang=chosen.lang;u.rate=.9;u.pitch=1;u.volume=Math.max(0,Math.min(1,volume));
          pending.add(u);u.onend=()=>release(u);u.onerror=e=>{release(u);if(!["interrupted","canceled"].includes(e.error))onError(e.error);};
          try{synth.speak(u);}catch{release(u);onError("unavailable");return false;}
        }
        if(chinese&&meaning&&!zh)onError("missing-chinese");
        return true;
      },
      speak(text,onError=()=>{},language='en'){
        text=String(text||'').trim();if(!text)return false;
        const chosen=language==='zh'?chineseVoice():voice();if(!chosen||!Utterance)return false;
        cancel();const utterance=new Utterance(text);utterance.voice=chosen;utterance.lang=chosen.lang;utterance.rate=.85;
        pending.add(utterance);utterance.onend=()=>release(utterance);
        utterance.onerror=event=>{release(utterance);if(!['interrupted','canceled'].includes(event.error))onError(event.error);};
        try{synth.speak(utterance);return true;}catch{release(utterance);onError("unavailable");return false;}
      }
    };
  }
  root.GuluSystemSpeech={createLocalSpeech};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSystemSpeech;
})(typeof globalThis!=='undefined'?globalThis:this);
