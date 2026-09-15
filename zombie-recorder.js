(function(){
 'use strict';
 const $=id=>document.getElementById(id),prefix='gulu-effect-recording-v1-';
 const choices=[['groan','🧟 僵尸低吼',4,'拖长一声“呃——啊——”。'],['horde','🚨 大波来袭',4,'喊一声“僵尸来啦！”'],['nibble','🦷 啃食',1,'短短的“咔嚓、咔嚓”。'],['step','👣 脚步',1,'轻轻跺脚或敲桌面。'],['shot','🟢 豌豆射击',.6,'短促的一声“啵”！'],['flesh','💥 命中僵尸',.6,'短促的一声“啪”。'],['laser','🌈 彩虹激光',2,'来一声“咻——”！'],['freeze','❄️ 冰冻派对',3,'喊出“冰冻派对！”'],['melon','🍉 西瓜大招',2,'试试“西瓜来啦！”'],['celebrate','🎉 清波庆祝',4,'欢呼“耶！守住啦！”']];
 let recorder=null,stream=null,timer=null,ticker=null,draft=null,generation=0,originalAudio=null,busy=false;
 choices.forEach(([id,label])=>$('kind').add(new Option(label,id)));
 const choice=()=>choices.find(c=>c[0]===$('kind').value),key=()=>prefix+choice()[0];
 function lock(value){busy=value;for(const id of ['kind','record','import','reset','original'])$(id).disabled=value;$('stop').disabled=!value;}
 function release(){clearTimeout(timer);clearInterval(ticker);stream?.getTracks().forEach(t=>t.stop());stream=null;lock(false);}
 function clearDraft(){draft=null;$('preview').pause();$('preview').hidden=true;$('save').disabled=true;$('download').hidden=true;}
 function show(data){draft=data;$('preview').src=data;$('preview').hidden=false;$('download').href=data;$('download').download='my-'+choice()[0]+'.'+(data.startsWith('data:audio/mp4')?'m4a':/^data:audio\/(?:x-)?wav/.test(data)?'wav':data.startsWith('data:audio/mpeg')?'mp3':data.startsWith('data:audio/ogg')?'ogg':'webm');$('download').hidden=false;$('save').disabled=false;}
 function select(){generation++;clearDraft();originalAudio?.stop();const [id,label,max,hint]=choice();$('hint').textContent=hint+' 最长 '+max+' 秒。';let saved=null;try{saved=localStorage.getItem(key())||(id==='groan'?localStorage.getItem('gulu-zombie-recording-v1'):null);}catch{}if(saved&&/^data:audio\//.test(saved)){show(saved);$('status').textContent=label+' · 正在使用你的配音。';}else $('status').textContent=label+' · 当前使用原版。点击开始后才会申请麦克风权限。';}
 function stop(){if(recorder?.state==='recording')recorder.stop();release();}
 async function read(blob,token){
  if(!/^audio\//.test(blob.type))throw Error('请选择音频文件，例如 M4A、MP3 或 WAV。');
  if(!blob.size||blob.size>1000000){$('status').textContent='录音为空或超过 1 MB，请使用短音频。';return;}
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
  const probe=new Audio(data);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('读取音频超时')),5000);probe.onloadedmetadata=()=>{clearTimeout(t);resolve();};probe.onerror=()=>{clearTimeout(t);reject(Error('无法播放这个音频格式'));};});
  if(token!==generation)return;
  if(!Number.isFinite(probe.duration)||probe.duration>choice()[2]+.4)throw Error('这项音效最长 '+choice()[2]+' 秒，请录短一点。');
  show(data);$('status').textContent='录好了！先试听，满意后点“使用这段配音”。';
 }
 $('kind').onchange=select;select();
 $('original').onclick=async()=>{originalAudio?.stop();$('preview').pause();originalAudio=new GardenAudio(()=>new (window.AudioContext||window.webkitAudioContext)());originalAudio.customEffects.clear();await originalAudio.unlock();originalAudio.play(choice()[0]);};
 $('record').onclick=async()=>{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){$('status').textContent='当前环境不能直接录音，可先用系统录音工具录好，再点“导入录音”。';return;}
  const token=++generation;clearDraft();originalAudio?.stop();lock(true);$('stop').disabled=true;$('status').textContent='等待麦克风权限…';
  try{
   const acquired=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   if(token!==generation||document.hidden){acquired.getTracks().forEach(t=>t.stop());release();return;}
   stream=acquired;const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(m=>MediaRecorder.isTypeSupported(m));
   const current=recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{}),chunks=[];let failed=false;
   current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   current.onerror=()=>{failed=true;release();$('status').textContent='录音失败，请重试或导入录音。';};
   current.onstop=async()=>{release();if(token!==generation||failed)return;try{await read(new Blob(chunks,{type:current.mimeType||chunks[0]?.type||'audio/mp4'}),token);}catch(e){if(token===generation)$('status').textContent=e.message||'读取录音失败';}};
   current.start();$('stop').disabled=false;const started=Date.now(),max=choice()[2];const update=()=>{$('status').textContent='● 正在录音 · '+Math.min(max,(Date.now()-started)/1000).toFixed(1)+' / '+max+' 秒';};update();ticker=setInterval(update,100);timer=setTimeout(stop,max*1000);
  }catch(e){release();$('status').textContent=e.name==='NotAllowedError'?'麦克风未获授权。请在浏览器的网站设置中允许麦克风，再重试。':'无法打开麦克风，请检查设备或导入录音。';}
 };
 $('stop').onclick=stop;
 $('import').onchange=async()=>{const file=$('import').files[0];if(!file)return;const token=++generation;clearDraft();try{await read(file,token);}catch(e){if(token===generation)$('status').textContent=e.message||'读取音频失败';}$('import').value='';};
 $('save').onclick=()=>{if(!draft)return;try{localStorage.setItem(key(),draft);$('status').textContent='已保存！返回游戏后生效，仅替换这一项音效。';}catch{$('status').textContent='本地空间不足或不可用，请先下载录音。';}};
 $('reset').onclick=()=>{try{localStorage.removeItem(key());if(choice()[0]==='groan')localStorage.removeItem('gulu-zombie-recording-v1');select();$('status').textContent='这一项已恢复原版，其他配音保留。';}catch{$('status').textContent='无法更改本地设置。';}};
 function leave(){if(busy){generation++;stop();$('status').textContent='录音已取消，请重新开始。';}$('preview').pause();originalAudio?.stop();}
 document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();});window.addEventListener('pagehide',leave);
})();
