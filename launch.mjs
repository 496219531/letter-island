import {spawn} from 'node:child_process';
import {networkInterfaces} from 'node:os';
import {createLanServer} from './lan-server.mjs';

const app=createLanServer();
const preferred=Number(process.env.PORT||4174);
if(!Number.isInteger(preferred)||preferred<1024||preferred>65525){console.error('PORT 必须是 1024 至 65525 之间的整数。');await app.stop();process.exit(1);}
function listen(port){return new Promise((resolve,reject)=>{
  const fail=error=>{app.server.removeListener('listening',ready);reject(error);};
  const ready=()=>{app.server.removeListener('error',fail);resolve();};
  app.server.once('error',fail);app.server.once('listening',ready);app.server.listen(port,'0.0.0.0');
});}
let port=preferred;
try{
  for(;;){try{await listen(port);break;}catch(e){if(e.code!=='EADDRINUSE'||port>=preferred+10)throw e;port++;}}
  const url=`http://127.0.0.1:${port}/`;
  console.log('\n豌豆突突队 · 全屏版已启动\n');
  console.log(`本机游戏：${url}`);
  console.log(`双人对战：http://127.0.0.1:${port}/duel.html`);
  for(const n of Object.values(networkInterfaces()).flat())if(n.family==='IPv4'&&!n.internal)console.log(`另一台电脑：http://${n.address}:${port}/duel.html`);
  console.log('\n点击游戏右上角“进入全屏”。保持此窗口运行；按 Ctrl+C 关闭服务。\n');
  if(process.env.GULU_NO_OPEN!=='1'){
    const command=process.platform==='darwin'?['open',[url]]:process.platform==='win32'?['cmd',['/c','start','',url]]:['xdg-open',[url]];
    const browser=spawn(command[0],command[1],{stdio:'ignore',detached:true});browser.on('error',()=>console.log('请手动在浏览器打开上方地址。'));browser.unref();
  }
}catch(e){console.error('启动失败：'+e.message);await app.stop();process.exitCode=1;}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.stop();process.exit(0);});
