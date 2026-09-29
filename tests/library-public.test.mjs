import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CommunityStore} from '../community-store.mjs';
import {createLanServer} from '../lan-server.mjs';
import C from '../custom-library.js';
const payload={version:1,groups:[{id:'words',name:'旅行词组',kind:'word',entries:[C.entry({text:'take care',meaning:'保重',ipa:''},'word')]},{id:'sentences',name:'旅行句子',kind:'sentence',entries:[C.entry({text:'Have a nice day.',meaning:'祝你愉快'},'sentence')]}]};
test('public resources persist, rank by unique downloads, paginate and only owners can remove',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gulu-public-'));let store=new CommunityStore(join(dir,'test.sqlite'));try{
 const owner=store.register('发布者').user,other=store.register('下载者').user;
 const a=store.publishLibrary(owner,{title:'旅行',payload});assert.equal(store.publishLibrary(owner,{title:'旅行',payload}).id,a.id);
 const b=store.publishLibrary(owner,{title:'日常',payload});
 assert.equal(store.downloadLibrary({id:a.id,visitor:'a'.repeat(16)},owner).downloads,0);
 assert.equal(store.downloadLibrary({id:a.id,visitor:'a'.repeat(16)},other).downloads,1);
 assert.equal(store.downloadLibrary({id:a.id,visitor:'b'.repeat(16)},other).downloads,1);
 assert.equal(store.downloadLibrary({id:a.id,visitor:'c'.repeat(16)},null).downloads,2);
 assert.equal(store.downloadLibrary({id:a.id,visitor:'c'.repeat(16)},null).downloads,2);
 assert.equal(store.listLibraries().rows[0].id,a.id);assert.equal(store.listLibraries({kind:'sentence'}).total,2);assert.equal(store.listLibraries({page:1}).rows.length,0);
 assert.throws(()=>store.removeLibrary(other,a.id),/只能/);
 assert.throws(()=>store.publishLibrary(owner,{title:'坏资源',payload:{version:1,groups:[{...payload.groups[0],entries:[{text:'bad'}]}]}}),/格式/);
 store.close();store=new CommunityStore(join(dir,'test.sqlite'));assert.equal(store.publicLibrary(a.id).downloads,2);assert.equal(JSON.parse(store.publicLibrary(a.id).payload).groups[0].entries[0].meaning,'保重');
 store.removeLibrary(owner,b.id);assert.throws(()=>store.publicLibrary(b.id),/不存在/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('public API protects publishing and supplies identical server-owned banks for duels and rematches',async()=>{
 const app=createLanServer();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 const call=(path,data,cookie)=>fetch(base+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 try{
 assert.equal((await call('library/public/publish',{title:'公开',payload})).status,401);
 const registered=await call('account/register',{name:'公开测试'}),cookie=registered.headers.get('set-cookie').split(';')[0];
 const published=await call('library/public/publish',{title:'公开',payload},cookie);assert.equal(published.status,200);const {id}=await published.json();
 const listing=await (await call('library/public/list',{})).json();assert.equal(listing.rows[0].downloads,0);assert.equal(listing.rows[0].groups.length,2);assert.equal(listing.rows[0].mine,false);
 const detail=await (await call('library/public/detail',{id})).json();assert.ok(detail.payload.groups.every(C.validate));assert.equal(detail.author,'公开测试');assert.equal(typeof detail.authorId,'string');
 let saved;C.repository({getItem:()=>saved,setItem:(k,v)=>saved=v}).importGroups(detail.payload.groups);assert.equal(JSON.parse(saved)[0].entries[0].word,'TAKE CARE');
 assert.equal((await call('rooms',{mode:'letters',level:0,publicResourceId:id,publicGroupId:'0'})).status,400);
 for(const [mode,groupId,word] of [['english','0','TAKE CARE'],['sentences','1','HAVE A NICE DAY']]){
 const response=await call('rooms',{name:'甲',mode,level:0,publicResourceId:id,publicGroupId:groupId});assert.equal(response.status,200);const room=await response.json(),match=app.rooms.get(room.code).match;
 match.join('乙');match.connect(0,true);match.connect(1,true);match.begin();
 for(let side=0;side<2;side++){assert.ok(match.snapshot(side).skills.every(s=>s.code===word));assert.ok(match.snapshot(side).skills.every(s=>s.meaning));}
 match.end(0,'测试');match.begin();assert.ok(match.snapshot(0).skills.every(s=>s.code===word));
 }
 const removed=await call('library/public/remove',{id},cookie);assert.equal(removed.status,200);assert.equal((await call('library/public/detail',{id})).status,404);
 // Existing matches hold their own immutable snapshot after the resource is withdrawn.
 for(const room of app.rooms.values()){room.match.begin();assert.ok(room.match.snapshot(0).skills.every(s=>s.meaning));}
 }finally{await app.stop();}
});

test('same owner and title replaces all content while keeping identity and unique downloads',()=>{
 let now=1000;const store=new CommunityStore(':memory:',{now:()=>now});
 try{
  const owner=store.register('作者甲').user,other=store.register('作者乙').user;
  const a=store.publishLibrary(owner,{title:'同名词库',payload});
  store.downloadLibrary({id:a.id,visitor:'a'.repeat(16)},other);
  now=2000;const b=store.publishLibrary(other,{title:'同名词库',payload});
  const revised={version:1,groups:[{...payload.groups[0],entries:[C.entry({text:'good night',meaning:'晚安'},'word')]}]};
  now=3000;const updated=store.publishLibrary(owner,{title:'同名词库',payload:revised});
  assert.equal(updated.id,a.id);assert.equal(updated.updated,true);assert.equal(updated.author,'作者甲');
  assert.equal(store.listLibraries().total,2);assert.equal(store.publicLibrary(a.id).downloads,1);
  assert.deepEqual(JSON.parse(store.publicLibrary(a.id).payload).groups[0].entries.map(e=>e.word),['GOOD NIGHT']);
  assert.equal(JSON.parse(store.publicLibrary(a.id).payload).groups.length,1);
  assert.equal(store.listLibraries({sort:'newest'}).rows[0].id,a.id);
  assert.equal(store.publicLibrary(b.id).author,'作者乙');
  store.db.prepare('INSERT INTO public_libraries(id,owner,title,payload,created) VALUES(?,?,?,?,?)').run('legacy',owner.id,'同名词库',JSON.stringify(payload),4000);
  store.downloadLibrary({id:'legacy',visitor:'a'.repeat(16)},other);
  store.downloadLibrary({id:'legacy',visitor:'b'.repeat(16)},null);
  store.publishLibrary(owner,{title:'同名词库',payload:revised});
  assert.equal(store.listLibraries().total,2);assert.equal(store.publicLibrary(a.id).downloads,2);
  assert.throws(()=>store.publicLibrary('legacy'),/不存在/);
 }finally{store.close();}
});

test('public downloads preserve authors, merge other authors, overwrite same authors and allow renamed copies',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(key,value)=>{raw=value;}},repo=C.repository(storage);
 const detail={id:'public-a',authorId:'a',author:'作者甲',title:'旅行',payload};
 const local=repo.save({name:'旅行',kind:'word',entries:[{text:'take care',meaning:'旧释义',ipa:'keə'},{text:'hello',meaning:'你好'}]});
 assert.equal(repo.publicConflict(detail,'旅行').action,'merge');const before=raw;
 assert.throws(()=>repo.importPublic(detail,'旅行'),/重新确认/);assert.equal(raw,before);
 repo.importPublic(detail,'旅行','merge');
 let groups=repo.list();assert.equal(groups.length,2);assert.equal(groups.find(g=>g.kind==='word').id,local.id);
 let word=groups.find(g=>g.kind==='word').entries.find(e=>e.word==='TAKE CARE');assert.equal(word.meaning,'保重');assert.equal(word.ipa,'keə');
 assert.ok(groups.every(g=>g.sources[0].author==='作者甲'));
 const changed={...detail,payload:{version:1,groups:[{...payload.groups[0],entries:[C.entry({text:'good night'},'word')]}]}};
 assert.equal(repo.publicConflict(changed,'旅行').action,'overwrite');
 assert.throws(()=>repo.importPublic(changed,'旅行','merge'),/重新确认/);
 repo.importPublic(changed,'旅行备份');assert.equal(repo.list().length,3);
 repo.importPublic(changed,'旅行','overwrite');groups=repo.list();assert.equal(groups.length,2);
 assert.deepEqual(groups.find(g=>g.name==='旅行').entries.map(e=>e.word),['GOOD NIGHT']);
 const other={...detail,id:'public-b',authorId:'b',author:'作者乙'};
 assert.equal(repo.publicConflict(other,'旅行').action,'merge');repo.importPublic(other,'旅行','merge');
 assert.deepEqual(C.librarySources(...repo.list().filter(g=>g.name==='旅行')).map(s=>s.author),['作者甲','作者乙']);
 // Editing, reclassification and backup restoration retain origin usernames.
 const group=repo.list().find(g=>g.name==='旅行'&&g.kind==='word');repo.save({...group,entries:[...group.entries,{text:'apple'}]});
 repo.saveClassified({id:group.id,name:group.name,entries:[{text:'banana',kind:'word'}]});
 assert.deepEqual(repo.list().find(g=>g.id===group.id).sources.map(s=>s.author),['作者甲','作者乙']);
 let restored=null;const backup=C.repository({getItem:()=>restored,setItem:(k,v)=>restored=v});backup.importGroups(repo.list());
 assert.ok(backup.list().every(g=>g.sources.length));
});

test('public import failure is atomic and never exceeds capacity after a merge',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(k,v)=>raw=v},repo=C.repository(storage);
 const name=i=>'word'+String.fromCharCode(97+Math.floor(i/676),97+Math.floor(i/26)%26,97+i%26);
 repo.save({name:'满库',kind:'word',entries:Array.from({length:2000},(_,i)=>({text:name(i)}))});
 const before=raw,detail={id:'a',author:'作者',title:'满库',payload};
 assert.throws(()=>repo.importPublic(detail,'满库','merge'),/2000/);assert.equal(raw,before);
 const broken=C.repository({getItem:()=>raw,setItem:()=>{throw Error('Quota exceeded');}});
 assert.throws(()=>broken.importPublic(detail,'另存'),/Quota/);assert.equal(raw,before);
});
