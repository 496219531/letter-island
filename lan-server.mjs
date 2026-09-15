import {importImage,organizeContent} from './library-service.mjs';
import http from 'node:http';
import https from 'node:https';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {isIP} from 'node:net';
import {CommunityStore} from './community-store.mjs';
import {performance} from 'node:perf_hooks';
import vocabulary from './vocabulary.js';
import dialogues from './dialogues.js';
import {DuelMatch} from './duel.cjs';
import {createSpeechBridge} from './speech-bridge.mjs';

const root=new URL(process.env.WEB_ROOT==='dist'?'./dist/':'./',import.meta.url);
const assets=new Set(['duel-garden-v2.png','zombie.png','pea-captain-v1.png','garden.png','gulu-island.png']);
const publicFiles=new Set(['zombie-recorder.html','zombie-recorder.js','custom-library.js','library-ui.js','library.css','speech-review.js','mode-copy.js','mobile.js','mobile.css','dialogues.js','dialogue-guide.html','press-to-talk.js','pcm-capture.js','system-speech.js','immersive.css','game-ui.js','vocabulary.js','vocabulary-guide.html','licenses/ECDICT.txt','index.html','styles.css','game.js','engine.js','save.js','sound.js','adventure.html','adventure.css','adventure.js','duel.html','duel.css','duel-client.js']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png'};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,maxBytes=4096) {
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>maxBytes)throw new Error('请求过大');}
  let data;try{data=JSON.parse(text);}catch{throw new Error('请求格式错误');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('请求格式错误');return data;
}
export function createLanServer(tlsOptions=null,options={}) {
  if(process.env.WEB_ROOT==='dist'){publicFiles.add('mobile-app.js');publicFiles.add('iphone.css');publicFiles.add('web-runtime.js');}
  const protocol=tlsOptions?'https':'http';
  const rooms=new Map();
  const speech=createSpeechBridge();
  publicFiles.add('performance.js');publicFiles.add('performance.css');publicFiles.add('community.js');publicFiles.add('community.css');
  const community=new CommunityStore(options.dbPath||':memory:',options.storeOptions);
  // Library shares deliberately live only in process memory. They never enter
  // SQLite, deployment backups, or a durable user profile.
  const libraryShares=new Map();
  const cleanLibraryShares=()=>{const now=Date.now();for(const [code,share] of libraryShares)if(share.expiresAt<=now)libraryShares.delete(code);};
  let aiInFlight=0;const aiUsers=new Set();
  const files=new Map(),limits=new Map(),serverId=randomBytes(12).toString('hex');
  const cookiePath=process.env.PUBLIC_URL?new URL(process.env.PUBLIC_URL).pathname.replace(/\/$/,'')+'/':'/';
  function cookie(res,token){res.setHeader('Set-Cookie',`letter_session=${token||''}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${token?90*86400:0}${tlsOptions?'; Secure':''}`);}
  function rate(req,key,max=30){
    const peer=req.socket.remoteAddress,forward=req.headers['x-real-ip'];
    const ip=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&isIP(String(forward))?forward:peer;
    const k=key+':'+ip,now=Date.now();let value=limits.get(k);if(!value||value.until<now){value={n:0,until:now+600000};limits.set(k,value);}
    if(++value.n>max)throw Object.assign(new Error('操作过于频繁，请稍后再试'),{status:429});
    if(limits.size>5000)for(const [id,v] of limits)if(v.until<now)limits.delete(id);
  }
  function settle(room){
    if(room.match.status!=='finished'||room.settledRound===room.match.round)return;
    if(room.nextSettlementAt>Date.now())return;
    try{room.ranking=community.recordDuel(`${serverId}:${room.code}:${room.match.round}`,room.rankUsers||[],room.match.winner,room.match.elapsed);room.settledRound=room.match.round;}
    catch{room.nextSettlementAt=Date.now()+10000;room.ranking={counted:false,reason:'成绩保存暂时失败，请稍后刷新榜单'};}
  }
  function release(room,side) {
    if(room.match.status==='playing')room.match.end(room.match.players.every(p=>!p?.connected)?null:1-side,'对方离开房间');
    settle(room);if(room.accounts)room.accounts[side]=null;
    const stream=room.streams[side];room.streams[side]=null;room.tokens[side]=null;
    room.match.leave(side);stream?.end();
    if(room.match.players.every(p=>!p))rooms.delete(room.code);
    else broadcast(room);
  }
  function broadcast(room) {
    settle(room);
    let fields;
    room.streams.forEach((res,side)=>{
      if(!res||res.destroyed)return;
      if(res.writableLength>256000){res.destroy();return;}
      const snapshot=room.match.snapshot(side,fields);fields=snapshot.fields;
      const data=JSON.stringify({code:room.code,...snapshot,ranking:room.ranking||null});
      // Keep unchanged rooms alive without retransmitting their full state.
      const now=Date.now();
      if(res.lastRoomData===data){if(now-(res.lastRoomSent||0)>15000){res.write(': heartbeat\n\n');res.lastRoomSent=now;}return;}
      res.lastRoomData=data;res.lastRoomSent=now;
      res.write(`data: ${data}\n\n`);
    });
  }
  const handler=async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/health'&&req.method==='GET'){json(res,200,{ok:true,service:'letter-island'});return;}
      if(req.headers.origin&&req.headers.origin!==`${protocol}://${req.headers.host}`){json(res,403,{error:'请从本机提供的游戏地址连接'});return;}
      const accountToken=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('letter_session='))?.slice(15);
      const user=()=>community.profile(accountToken);
      const requireUser=()=>{const u=user();if(!u)throw Object.assign(new Error('请先加入小院账号'),{status:401});return u;};
      if(url.pathname==='/api/account'&&req.method==='GET'){json(res,200,{user:user()});return;}
      if(url.pathname==='/api/account/register'&&req.method==='POST'){
        rate(req,'register',60);const data=await body(req),result=community.register(data.name);cookie(res,result.token);json(res,200,{user:result.user,recoveryCode:result.recoveryCode});return;
      }
      if(url.pathname==='/api/account/restore'&&req.method==='POST'){
        rate(req,'restore');const data=await body(req),result=community.restore(data.code);cookie(res,result.token);json(res,200,{user:result.user});return;
      }
      if(url.pathname==='/api/account/recovery'&&req.method==='POST'){rate(req,'recovery',10);json(res,200,{recoveryCode:community.rotateRecovery(requireUser())});return;}
      if(url.pathname==='/api/account/logout'&&req.method==='POST'){community.logout(accountToken);cookie(res,null);json(res,200,{ok:true});return;}
      if(url.pathname==='/api/leaderboards'&&req.method==='GET'){const u=user();json(res,200,{user:u,...community.leaderboard(url.searchParams.get('kind')||'solo',url.searchParams.get('mode')||'english',url.searchParams.get('level')||0,u)});return;}
      if(url.pathname==='/api/solo/start'&&req.method==='POST'){const u=requireUser();json(res,200,community.startSolo(u,await body(req)));return;}
      if(url.pathname==='/api/solo/finish'&&req.method==='POST'){const u=requireUser();rate(req,'finish',60);json(res,200,community.finishSolo(u,await body(req)));return;}
      if(url.pathname==='/api/library/share'&&req.method==='POST'){
        const owner=requireUser();rate(req,'library-share',10);cleanLibraryShares();
        const data=await body(req,1600000),payload=typeof data.payload==='string'?data.payload:'';
        if(!payload||payload.length>1500000)throw Object.assign(Error('词句库分享内容过大，请分成多个词库分享。'),{status:400});
        let parsed;try{parsed=JSON.parse(payload);}catch{throw Object.assign(Error('词句库分享内容格式不正确。'),{status:400});}
        if(!parsed||parsed.version!==1||!Array.isArray(parsed.groups)||!parsed.groups.length||parsed.groups.length>30)throw Object.assign(Error('词句库分享内容格式不正确。'),{status:400});
        if(libraryShares.size>=100)throw Object.assign(Error('临时分享队列已满，请稍后再试。'),{status:503});
        const code=randomBytes(15).toString('base64url'),expiresAt=Date.now()+24*60*60*1000;
        libraryShares.set(code,{owner:owner.id,payload,expiresAt});json(res,200,{code,expiresAt});return;
      }
      if(url.pathname==='/api/library/share/claim'&&req.method==='POST'){
        rate(req,'library-claim',20);cleanLibraryShares();const data=await body(req),code=String(data.code||'').trim();
        const share=libraryShares.get(code);if(!share){json(res,404,{error:'发送码不存在或已过期。'});return;}
        json(res,200,{payload:share.payload,expiresAt:share.expiresAt});return;
      }
      if(['/api/library/import-image','/api/library/organize'].includes(url.pathname)&&req.method==='POST'){
        const owner=requireUser();rate(req,'ai',6);
        const key=process.env.QWEN_API_KEY||process.env.DASHSCOPE_API_KEY;
        if(!key){json(res,503,{error:'智能整理服务暂未就绪，请稍后再试。'});return;}
        if(aiInFlight>=2||aiUsers.has(owner.id)){json(res,429,{error:'智能整理繁忙，请稍后再试。'});return;}
        aiInFlight++;aiUsers.add(owner.id);
        try{
          const chunks=[];let size=0;const uploadTimer=setTimeout(()=>req.destroy(),30000);try{for await(const chunk of req){size+=chunk.length;if(size>50000000)throw Object.assign(Error('内容过大，请分批录入。'),{status:413});chunks.push(chunk);}}finally{clearTimeout(uploadTimer);}
          let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('内容格式不正确'),{status:400});}
          const images=Array.isArray(input?.images)?input.images:(input?.image?[input.image]:[]);
          if(!input||typeof input!=='object'||!['word','sentence','auto'].includes(input.kind)||typeof (input.text??'')!=='string'||(input.text||'').length>30000||(!(input.text||'').trim()&&!images.length)||images.length>4||images.some(image=>typeof image!=='string'||image.length>12000000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))||images.reduce((sum,image)=>sum+image.length,0)>48000000)throw Object.assign(Error('请输入有效词句或图片，图片一次最多4张且总大小不超过36MB。'),{status:400});
          const peer=req.socket.remoteAddress,forward=req.headers['x-real-ip'],ip=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&isIP(String(forward))?forward:peer;
          community.reserveAI(owner,ip);
          let result;try{result=await (options.organizeContent||organizeContent)({text:input.text||'',images,kind:input.kind,pipeline:input.pipeline==='staged'?'staged':'one-shot'},{key});}catch{throw Object.assign(Error('智能整理暂时失败，请稍后重试。'),{status:502});}
          json(res,200,result);return;
        }finally{aiInFlight--;aiUsers.delete(owner.id);}
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
        const addresses=process.env.PUBLIC_URL?[process.env.PUBLIC_URL.replace(/\/$/,'')+'/duel.html']:Object.values(networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>`${protocol}://${n.address}:${port}/duel.html`);
        json(res,200,{addresses,hosted:Boolean(process.env.PUBLIC_URL),stages:vocabulary.stages,dialogueStages:dialogues.stages});return;
      }
      if(url.pathname==='/api/rooms'&&req.method==='POST') {
        rate(req,'room',60);const data=await body(req),account=user();let room,side;
        if(data.code){
          room=rooms.get(String(data.code).trim().toUpperCase());
          if(!room){json(res,404,{error:'找不到房间，请检查房间码'});return;}
          if(account&&room.accounts?.includes(account.id)){json(res,400,{error:'同一账号不能同时坐在房间两侧'});return;}
          side=room.match.join(account?.name||data.name);
        }else{
          if(rooms.size>=64){json(res,503,{error:'房间已满，请稍后再试'});return;}
          let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
          room={code,match:new DuelMatch({mode:data.mode,level:data.level}),tokens:[],streams:[],accounts:[],lastSeen:[],lastActive:Date.now(),rates:[[],[]]};
          side=room.match.join(account?.name||data.name);rooms.set(code,room);
        }
        room.accounts[side]=account?.id||null;startRoomLoop();
        const token=randomBytes(24).toString('hex');room.tokens[side]=token;room.lastSeen[side]=Date.now();room.lastActive=Date.now();
        json(res,200,{code:room.code,token,side});broadcast(room);return;
      }
      if(url.pathname.startsWith('/api/room/')) {
        const [, , ,code,operation]=url.pathname.split('/');const room=rooms.get(code);
        const token=operation==='events'?url.searchParams.get('token'):req.headers.authorization?.replace(/^Bearer /,'');
        const side=room?.tokens.findIndex(t=>t===token);
        if(!token||!room||side===undefined||side<0){json(res,401,{error:'房间已过期，请重新开房或加入'});return;}
        if(operation==='leave'&&req.method==='POST'){release(room,side);json(res,200,{ok:true});return;}
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
          settle(room);const previousRound=room.match.round;
          if(data.type!=='ping')room.match.command(side,data);
          if(previousRound!==room.match.round){room.rankUsers=[...room.accounts];room.ranking=null;}
          room.lastSeen[side]=now;room.lastActive=now;json(res,200,{ok:true});if(data.type!=='ping')broadcast(room);return;
        }
        json(res,404,{error:'接口不存在'});return;
      }
      if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'不支持的请求'});return;}
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!publicFiles.has(name)&&!(name.startsWith('assets/')&&assets.has(name.slice(7)))){json(res,404,{error:'文件不存在'});return;}
      const path=new URL(name,root),info=await stat(path);let cached=files.get(name);
      if(!cached||cached.mtime!==info.mtimeMs){const bytes=await readFile(path);cached={mtime:info.mtimeMs,bytes,etag:'W/"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"'};if(/\.(js|css|html|txt)$/.test(name)&&bytes.length>1024)cached.gzip=gzipSync(bytes);files.set(name,cached);}
      const headers={'Content-Type':mime[name.slice(name.lastIndexOf('.'))]||'application/octet-stream','Cache-Control':'public, max-age=0, must-revalidate','ETag':cached.etag,'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff'};
      if(name.endsWith('.png')&&url.searchParams.get('v')===cached.etag.split('"')[1].slice(0,12))headers['Cache-Control']='public, max-age=31536000, immutable';
      if(req.headers['if-none-match']===cached.etag){res.writeHead(304,headers);res.end();return;}
      const compressed=cached.gzip&&/\bgzip\b(?!\s*;\s*q=0(?:\.0*)?(?:\s*(?:,|$)))/.test(req.headers['accept-encoding']||'');const bytes=compressed?cached.gzip:cached.bytes;
      if(compressed)headers['Content-Encoding']='gzip';headers['Content-Length']=bytes.length;
      res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){if(!res.headersSent)json(res,error.status||400,{error:error.message});else res.end();}
  };
  const server=tlsOptions?https.createServer(tlsOptions,handler):http.createServer(handler);
  let previous=performance.now(),accumulator=0,broadcastIn=0;
  let timer=null;
  function startRoomLoop(){if(!timer){previous=performance.now();timer=setInterval(tickRooms,25);}}
  function tickRooms(){
    const now=performance.now();if(!rooms.size){clearInterval(timer);timer=null;previous=now;accumulator=0;return;}accumulator+=Math.min(.25,(now-previous)/1000);previous=now;
    while(accumulator>=.05){for(const room of rooms.values())room.match.tick(.05);accumulator-=.05;}
    if((broadcastIn+=.025)>=.1){
      broadcastIn=0;
      for(const [code,room] of rooms){
        room.streams.forEach((res,side)=>{if(res&&Date.now()-room.lastSeen[side]>(room.match.status==='playing'?6500:45000)){room.streams[side]=null;room.match.connect(side,false);res.destroy();}});
        room.match.players.forEach((p,side)=>{if(p&&!p.connected&&Date.now()-room.lastSeen[side]>30000)release(room,side);});
        if(!rooms.has(code))continue;
        if(room.streams.some(Boolean))room.lastActive=Date.now();
        if(Date.now()-room.lastActive>30*60*1000){rooms.delete(code);continue;}
        broadcast(room);
      }
    }
  }
  server.on('close',()=>{clearInterval(timer);speech.close();community.close();});
  return {server,rooms,community,stop(){speech.close();clearInterval(timer);for(const room of rooms.values())room.streams.forEach(res=>res?.end());server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  if(Boolean(process.env.GULU_TLS_CERT)!==Boolean(process.env.GULU_TLS_KEY))throw new Error('请同时提供 GULU_TLS_CERT 和 GULU_TLS_KEY');
  const tlsOptions=process.env.GULU_TLS_CERT?{cert:await readFile(process.env.GULU_TLS_CERT),key:await readFile(process.env.GULU_TLS_KEY)}:null;
  const protocol=tlsOptions?'https':'http';
  const port=Number(process.env.PORT||4174),{server}=createLanServer(tlsOptions,{dbPath:resolve(process.env.DATA_DIR||'data','community.sqlite')});
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已被占用，请使用 PORT=4175 npm run lan`:e.message);process.exit(1);});
  server.listen(port,process.env.HOST||'0.0.0.0',()=>{
    console.log(`本机打开 ${protocol}://127.0.0.1:${port}/duel.html`);
    for(const n of Object.values(networkInterfaces()).flat())if(n.family==='IPv4'&&!n.internal)console.log(`另一台设备打开 ${protocol}://${n.address}:${port}/duel.html`);
    console.log('两台电脑连接同一局域网；房主关闭此进程会结束对战。');
  });
}
