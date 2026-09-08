import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm,access,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const bundle=fileURLToPath(new URL('./native/GuluSpeech.app',import.meta.url));
const executable=join(bundle,'Contents','MacOS','GuluSpeech');
export function validateRecording(buffer){
  if(buffer.length<44||buffer.length>6000000||buffer.toString('ascii',0,4)!=='RIFF'||buffer.toString('ascii',8,12)!=='WAVE'||buffer.toString('ascii',12,16)!=='fmt '||buffer.readUInt32LE(16)!==16||buffer.readUInt16LE(20)!==1||buffer.readUInt16LE(22)!==1||buffer.readUInt16LE(34)!==16||buffer.toString('ascii',36,40)!=='data')throw new Error('录音格式不正确，请重新按住麦克风录音。');
  const rate=buffer.readUInt32LE(24),size=buffer.readUInt32LE(40);
  if(rate<8000||rate>96000||size!==buffer.length-44||size%2||buffer.readUInt32LE(4)!==buffer.length-8||size/rate/2>31||size/rate/2<.15)throw new Error('请录制 0.2 至 30 秒的语音。');
}
export function createSpeechBridge(){
  let active=null,closed=false,lastAuthorization=null;
  async function installed(){
    if(process.platform!=='darwin')return {available:false,error:'系统识别助手目前支持 Mac。请在 Mac 上启动游戏使用此功能。'};
    try{await access(executable);return {available:true,engine:'macOS Speech',local:true};}catch{return {available:false,error:'缺少系统语音助手，请使用最新完整运行包。'};}
  }
  async function run(operation,file,signal){
    const availability=await installed();if(!availability.available)throw new Error(availability.error);
    if(closed||signal?.aborted)throw new Error('录音请求已取消');
    if(active)throw new Error('系统语音正在处理上一项请求，请稍后再试。');
    const job={cancelled:false,dir:null,cancel(){this.cancelled=true;if(this.dir)writeFile(join(this.dir,'cancel'),'1').catch(()=>{});}};active=job;
    try{
      job.dir=await mkdtemp(join(tmpdir(),'gulu-speech-job-'));
      const resultFile=join(job.dir,'result.json'),cancelFile=join(job.dir,'cancel');
      if(job.cancelled||signal?.aborted)throw new Error('录音请求已取消');
      const result=await new Promise((resolve,reject)=>{
        // LaunchServices gives the helper a real application identity for the system prompt.
        const child=spawn('/usr/bin/open',['-g','-n','-W',bundle,'--args',operation,...(file?[file]:[]),'--result',resultFile,'--cancel',cancelFile],{stdio:['ignore','ignore','ignore']});
        const abort=()=>job.cancel();signal?.addEventListener('abort',abort,{once:true});
        const timeout=setTimeout(abort,operation==='authorize'?902000:92000);let settled=false;
        function finish(error,value){if(settled)return;settled=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);}
        child.on('error',()=>finish(new Error('花园语音小助手无法启动，请使用最新完整运行包。')));
        child.on('close',async()=>{
          if(job.cancelled){finish(new Error('录音请求已取消'));return;}
          try{const text=await readFile(resultFile,'utf8');if(text.length>16000)throw new Error();const value=JSON.parse(text);finish(value.error?new Error(value.error):null,value);}
          catch{finish(new Error('系统语音助手未能完成请求。请打开 native/GuluSpeech.app 允许启动后重试。'));}
        });
        if(signal?.aborted)abort();
      });
      if(result.authorization!==undefined)lastAuthorization=result.authorization;
      else if(operation==='authorize'&&result.ok)lastAuthorization=3;
      return result;
    }finally{if(job.dir)await rm(job.dir,{recursive:true,force:true});if(active===job)active=null;}
  }
  async function status(){
    const info=await installed();if(!info.available)return info;
    if(active)return {...info,authorization:lastAuthorization,authorized:lastAuthorization===3};
    try{const probe=await run('probe');return {...info,authorization:probe.authorization,authorized:probe.authorization===3,onDevice:probe.onDevice};}
    catch(error){return {...info,authorized:false,error:error.message};}
  }
  return {status,authorize:signal=>run('authorize',null,signal),async recognize(audio,signal){
    validateRecording(audio);const dir=await mkdtemp(join(tmpdir(),'gulu-speech-'));
    try{const file=join(dir,'recording.wav');await writeFile(file,audio,{mode:0o600});return await run('recognize',file,signal);}
    finally{await rm(dir,{recursive:true,force:true});}
  },close(){closed=true;active?.cancel();}};
}
