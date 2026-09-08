import {execFileSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
if(process.platform!=='darwin')throw new Error('系统语音助手需要在 Mac 上构建');
const here=fileURLToPath(new URL('./',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'gulu-speech-build-'));
const app=join(here,'GuluSpeech.app'),binary=join(app,'Contents','MacOS','GuluSpeech');
await mkdir(join(app,'Contents','MacOS'),{recursive:true});await copyFile(join(here,'Info.plist'),join(app,'Contents','Info.plist'));
try{
  for(const arch of ['arm64','x86_64'])execFileSync('xcrun',['swiftc',join(here,'SpeechHelper.swift'),'-target',`${arch}-apple-macos13.0`,'-O','-o',join(temp,arch),'-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__info_plist','-Xlinker',join(here,'Info.plist')],{stdio:'inherit'});
  execFileSync('lipo',['-create',join(temp,'arm64'),join(temp,'x86_64'),'-output',binary]);
  execFileSync('codesign',['--force','--sign','-','--identifier','com.gulu.garden.speechhelper',app],{stdio:'inherit'});
}finally{await rm(temp,{recursive:true,force:true});}
