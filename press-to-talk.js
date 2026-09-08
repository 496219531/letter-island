(function(root){
  'use strict';
  function encodeWav(chunks,rate){
    const length=chunks.reduce((n,c)=>n+c.length,0),buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer);
    const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
    text(0,'RIFF');view.setUint32(4,36+length*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,length*2,true);
    let offset=44;for(const chunk of chunks)for(const value of chunk){const sample=Math.max(-1,Math.min(1,value));view.setInt16(offset,sample<0?sample*32768:sample*32767,true);offset+=2;}
    return buffer;
  }
  async function captureMicrophone(signal,preparedContext){
    if(!root.navigator?.mediaDevices?.getUserMedia)throw new Error('当前页面无法使用麦克风，请在本机通过 localhost 打开游戏。');
    const stream=await root.navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    let context=preparedContext,node,source,mute,stopped=false;const chunks=[];
    const cleanup=()=>{if(stopped)return;stopped=true;stream.getTracks().forEach(t=>t.stop());node?.disconnect();source?.disconnect();mute?.disconnect();context?.close().catch(()=>{});};
    signal.addEventListener('abort',cleanup,{once:true});
    try{
      if(signal.aborted)throw new Error('录音已取消');
      context=context||new (root.AudioContext||root.webkitAudioContext)();
      await context.audioWorklet.addModule('pcm-capture.js');
      if(signal.aborted)throw new Error('录音已取消');
      node=new root.AudioWorkletNode(context,'gulu-capture');
      let count=0;node.port.onmessage=event=>{if(!stopped&&count<context.sampleRate*30){const samples=event.data.subarray(0,Math.max(0,context.sampleRate*30-count));chunks.push(samples);count+=samples.length;}};
      source=context.createMediaStreamSource(stream);mute=context.createGain();mute.gain.value=0;source.connect(node);node.connect(mute);mute.connect(context.destination);
      await context.resume();if(signal.aborted)throw new Error('录音已取消');
      return {stop(){const rate=context.sampleRate;cleanup();signal.removeEventListener('abort',cleanup);return encodeWav(chunks,rate);}};
    }catch(error){cleanup();signal.removeEventListener('abort',cleanup);if(signal.aborted)throw new Error('录音已取消');throw error;}
  }
  function createVoicePermissions({requestMicrophone,authorizeNative,onState=()=>{}}){
    let pending=null;
    function enable(){
      if(pending)return pending;
      onState('microphone');let permission;
      // This call must run synchronously inside the user's click/change gesture.
      try{permission=requestMicrophone();}catch(error){permission=Promise.reject(error);}
      pending=Promise.resolve(permission).then(stream=>{
        for(const track of stream.getTracks()){try{track.stop();}catch{}}
        onState('system');return authorizeNative();
      }).then(()=>{onState('ready');return true;},error=>{onState('error');throw error;}).finally(()=>{pending=null;});
      return pending;
    }
    return {enable};
  }
  function createPressToTalk({request=(...args)=>root.fetch(...args),capture=captureMicrophone,authorize=null,onState=()=>{},onResult=()=>{},onError=()=>{},maxMs=30000}={}){
    let phase='idle',held=false,version=0,session=null,controller=null,timer=null,context=null,preparedContext=null;
    const state=next=>{phase=next;onState(next);};
    async function post(path,options){const response=await request(path,options);const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'系统识别未成功');return result;}
    async function start(target){
      if(phase!=='idle')return;
      const current=++version;held=true;context=target;controller=new AbortController();state('preparing');
      try{
        // Resume Web Audio in the actual pointer/keyboard gesture, before awaiting permissions.
        if(capture===captureMicrophone){
          preparedContext=new (root.AudioContext||root.webkitAudioContext)();
          preparedContext.resume().catch(()=>{});
        }
        // Releasing while a permission dialog is open must not start a late recording.
        if(authorize)await authorize();else await post('/api/speech/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        if(current!==version)return;
        if(!held){preparedContext?.close().catch(()=>{});preparedContext=null;state('idle');return;}
        const recording=await capture(controller.signal,preparedContext);preparedContext=null;
        if(current!==version||!held){recording.stop();if(current===version)state('idle');return;}
        session=recording;state('recording');timer=setTimeout(release,maxMs);
      }catch(error){if(current===version){held=false;controller?.abort();preparedContext?.close().catch(()=>{});preparedContext=null;session=null;state('idle');if(error.message==='录音已取消')return;onError(error.name==='NotAllowedError'?'麦克风权限未开启，请允许游戏使用麦克风。':error.message);}}
    }
    async function release(){
      held=false;if(phase==='preparing'){state('preparing');controller?.abort();preparedContext?.close().catch(()=>{});return;}if(phase!=='recording')return;
      clearTimeout(timer);timer=null;const current=version,target=context,recording=session;session=null;state('recognizing');
      try{
        const audio=recording.stop();
        const result=await post('/api/speech/recognize',{method:'POST',headers:{'Content-Type':'audio/wav'},body:audio,signal:controller.signal});
        if(current===version){state('idle');if(result.text?.trim())onResult(result.text,target);else onError('没有听清，请按住麦克风再说一次。');}
      }catch(error){if(current===version){state('idle');onError(error.message);}}
    }
    function cancel(){version++;held=false;clearTimeout(timer);timer=null;controller?.abort();preparedContext?.close().catch(()=>{});preparedContext=null;session?.stop();session=null;state('idle');}
    return {start,release,cancel,get phase(){return phase;},get held(){return held;}};
  }
  root.GuluPressToTalk={createPressToTalk,createVoicePermissions,encodeWav};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluPressToTalk;
})(typeof globalThis!=='undefined'?globalThis:this);
