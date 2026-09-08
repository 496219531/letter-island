import {importImage} from './library-service.mjs';
import http from 'node:http';
import https from 'node:https';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import vocabulary from './vocabulary.js';
import dialogues from './dialogues.js';
import {DuelMatch} from './duel.cjs';
import {createSpeechBridge} from './speech-bridge.mjs';

const root=new URL('./',import.meta.url);
const assets=new Set(['duel-garden-v2.png','zombie.png','pea-captain-v1.png','garden.png','gulu-island.png']);
const publicFiles=new Set(['custom-library.js','library-ui.js','library.css','speech-review.js','mode-copy.js','mobile.js','mobile.css','dialogues.js','dialogue-guide.html','press-to-talk.js','pcm-capture.js','system-speech.js','immersive.css','game-ui.js','vocabulary.js','vocabulary-guide.html','licenses/ECDICT.txt','index.html','styles.css','game.js','engine.js','save.js','sound.js','adventure.html','adventure.css','adventure.js','duel.html','duel.css','duel-client.js']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req) {
  let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw new Error('请求过大');}
  let data;try{data=JSON.parse(text);}catch{throw new Error('请求格式错误');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('请求格式错误');return data;
}
export function createLanServer(tlsOptions=null) {
  const protocol=tlsOptions?'https':'http';
  const rooms=new Map();
  const speech=createSpeechBridge();
  function broadcast(room) {
    room.streams.forEach((res,side)=>{
      if(!res||res.destroyed)return;
      if(res.writableLength>256000){res.destroy();return;}
      res.write(`data: ${JSON.stringify({code:room.code,...room.match.snapshot(side)})}\n\n`);
    });
  }
  const handler=async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(req.headers.origin&&req.headers.origin!==`${protocol}://${req.headers.host}`){json(res,403,{error:'请从本机提供的游戏地址连接'});return;}
      if(url.pathname==='/api/library/import-image'&&req.method==='POST'){
        if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){json(res,403,{error:'网页版Qwen导入请在运行服务的电脑上使用；手机App可直接配置Qwen。'});return;}
        let text='';for await(const chunk of req){text+=chunk;if(text.length>12001000)throw Error('图片过大');}const result=await importImage(JSON.parse(text));json(res,200,result);return;
      }
      if(url.pathname.startsWith('/api/speech/')){
        const host=new URL('http://'+req.headers.host).hostname;
        const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['127.0.0.1','localhost','[::1]'].includes(host);
        if(!local){json(res,403,{error:'系统语音识别需要在自己的 Mac 上运行游戏，并通过 localhost 打开。'});return;}
        if(url.pathname==='/api/speech/status'&&req.method==='GET'){json(res,200,await speech.status());return;}
        if(req.method!=='POST'){json(res,405,{error:'不支持的语音操作'});return;}
        const control=new AbortController();res.on('close',()=>control.abort());
        if(url.pathname==='/api/speech/authorize'){await body(req);const result=await speech.authorize(control.signal);if(!res.destroyed)json(res,200,result);return;}
        if(url.pathname==='/api/speech/recognize'){
          if(req.headers['content-type']!=='audio/wav'){json(res,400,{error:'请使用麦克风录音'});return;}
          const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>6000000)throw new Error('录音过长，请控制在30秒内');chunks.push(chunk);}
          const result=await speech.recognize(Buffer.concat(chunks),control.signal);if(!res.destroyed)json(res,200,result);return;
        }
        json(res,404,{error:'语音接口不存在'});return;
      }
      if(url.pathname==='/api/lan'&&req.method==='GET') {
        const port=server.address().port;
        const addresses=Object.values(networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>`${protocol}://${n.address}:${port}/duel.html`);
        json(res,200,{addresses,stages:vocabulary.stages,dialogueStages:dialogues.stages});return;
      }
      if(url.pathname==='/api/rooms'&&req.method==='POST') {
        const data=await body(req);let room,side;
        if(data.code){
          room=rooms.get(String(data.code).trim().toUpperCase());
          if(!room){json(res,404,{error:'找不到房间，请检查房间码'});return;}
          if(data.mobile===true&&room.match.config.mode==='letters'){json(res,400,{error:'手机版不使用纯字母模式，请房主创建英语单词或句子房间。'});return;}
          side=room.match.join(data.name);
        }else{
          if(rooms.size>=64){json(res,503,{error:'房间已满，请稍后再试'});return;}
          let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
          room={code,match:new DuelMatch({mode:data.mobile===true&&(!data.mode||data.mode==='letters')?'english':data.mode,level:data.level}),tokens:[],streams:[],lastSeen:[],lastActive:Date.now(),rates:[[],[]]};
          side=room.match.join(data.name);rooms.set(code,room);
        }
        const token=randomBytes(24).toString('hex');room.tokens[side]=token;room.lastActive=Date.now();
        json(res,200,{code:room.code,token,side});broadcast(room);return;
      }
      if(url.pathname.startsWith('/api/room/')) {
        const [, , ,code,operation]=url.pathname.split('/');const room=rooms.get(code);
        const token=operation==='events'?url.searchParams.get('token'):req.headers.authorization?.replace(/^Bearer /,'');
        const side=room?.tokens.findIndex(t=>t===token);
        if(!room||side===undefined||side<0){json(res,401,{error:'房间已过期，请重新开房或加入'});return;}
        if(operation==='state'&&req.method==='GET'){json(res,200,{code:room.code,...room.match.snapshot(side)});return;}
        if(operation==='events'&&req.method==='GET') {
          const previous=room.streams[side];
          res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
          res.write('retry: 1000\n\n');room.streams[side]=res;previous?.end();room.match.connect(side,true);room.lastActive=Date.now();room.lastSeen[side]=Date.now();
          req.on('close',()=>{if(room.streams[side]===res){room.streams[side]=null;room.match.connect(side,false);broadcast(room);}});
          broadcast(room);return;
        }
        if(operation==='action'&&req.method==='POST') {
          const now=Date.now();room.rates[side]=room.rates[side].filter(t=>now-t<1000);
          if(room.rates[side].length>=100){json(res,429,{error:'操作太快，请稍等'});return;}
          room.rates[side].push(now);const data=await body(req);
          if(data.type!=='ping')room.match.command(side,data);
          room.lastSeen[side]=now;room.lastActive=now;json(res,200,{ok:true});if(data.type!=='ping')broadcast(room);return;
        }
        json(res,404,{error:'接口不存在'});return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'不支持的请求'});return;}
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!publicFiles.has(name)&&!(name.startsWith('assets/')&&assets.has(name.slice(7)))){json(res,404,{error:'文件不存在'});return;}
      const file=await readFile(new URL(name,root));
      res.writeHead(200,{'Content-Type':mime[name.slice(name.lastIndexOf('.'))]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:file);
    }catch(error){if(!res.headersSent)json(res,400,{error:error.message});else res.end();}
  };
  const server=tlsOptions?https.createServer(tlsOptions,handler):http.createServer(handler);
  let previous=performance.now(),accumulator=0,broadcastIn=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min(.25,(now-previous)/1000);previous=now;
    while(accumulator>=.05){for(const room of rooms.values())room.match.tick(.05);accumulator-=.05;}
    if((broadcastIn+=.025)>=.1){
      broadcastIn=0;
      for(const [code,room] of rooms){
        room.streams.forEach((res,side)=>{if(res&&Date.now()-room.lastSeen[side]>6500){room.streams[side]=null;room.match.connect(side,false);res.destroy();}});
        if(room.streams.some(Boolean))room.lastActive=Date.now();
        if(Date.now()-room.lastActive>30*60*1000){rooms.delete(code);continue;}
        broadcast(room);
      }
    }
  },25);
  server.on('close',()=>{clearInterval(timer);speech.close();});
  return {server,rooms,stop(){speech.close();clearInterval(timer);for(const room of rooms.values())room.streams.forEach(res=>res?.end());server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  if(Boolean(process.env.GULU_TLS_CERT)!==Boolean(process.env.GULU_TLS_KEY))throw new Error('请同时提供 GULU_TLS_CERT 和 GULU_TLS_KEY');
  const tlsOptions=process.env.GULU_TLS_CERT?{cert:await readFile(process.env.GULU_TLS_CERT),key:await readFile(process.env.GULU_TLS_KEY)}:null;
  const protocol=tlsOptions?'https':'http';
  const port=Number(process.env.PORT||4174),{server}=createLanServer(tlsOptions);
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用 PORT=4175 npm run lan`:e.message);process.exit(1);});
  server.listen(port,'0.0.0.0',()=>{
    console.log(`本机打开 ${protocol}://127.0.0.1:${port}/duel.html`);
    for(const n of Object.values(networkInterfaces()).flat())if(n.family==='IPv4'&&!n.internal)console.log(`另一台设备打开 ${protocol}://${n.address}:${port}/duel.html`);
    console.log('两台电脑连接同一局域网；房主关闭此进程会结束对战。');
  });
}
