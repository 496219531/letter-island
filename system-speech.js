/* OS dictation writes into a normal text field. Demonstrations use local voices only. */
(function(root){
  'use strict';
  function createLocalSpeech(synth,Utterance){
    function voice(){return synth?.getVoices().find(v=>v.localService&&/^en-US$/i.test(v.lang))||synth?.getVoices().find(v=>v.localService&&/^en[-_]/i.test(v.lang));}
    return {
      available(){return Boolean(synth&&Utterance&&voice());},
      cancel(){synth?.cancel();},
      speak(text,onError=()=>{}){
        const chosen=voice();if(!chosen||!Utterance)return false;
        synth.cancel();const utterance=new Utterance(text);utterance.voice=chosen;utterance.lang=chosen.lang;utterance.rate=.85;
        utterance.onerror=event=>{if(!['interrupted','canceled'].includes(event.error))onError(event.error);};
        synth.speak(utterance);return true;
      }
    };
  }
  root.GuluSystemSpeech={createLocalSpeech};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSystemSpeech;
})(typeof globalThis!=='undefined'?globalThis:this);
