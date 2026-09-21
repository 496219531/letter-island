import customLibrary from './custom-library.js';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const hash=value=>createHash('sha256').update(value).digest('hex');
const id=()=>randomBytes(18).toString('base64url');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export class CommunityStore{
 constructor(path=':memory:',{now=Date.now}={}){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  this.now=now;this.db=new DatabaseSync(path);
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL COLLATE NOCASE UNIQUE,recovery_hash TEXT NOT NULL UNIQUE,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS solo_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),mode TEXT NOT NULL,level INTEGER NOT NULL,created INTEGER NOT NULL,finished INTEGER,score INTEGER,wave INTEGER,casts INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS solo_best(user_id TEXT NOT NULL REFERENCES users(id),mode TEXT NOT NULL,level INTEGER NOT NULL,score INTEGER NOT NULL,wave INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,mode,level));
   CREATE TABLE IF NOT EXISTS duels(id TEXT PRIMARY KEY,a TEXT NOT NULL REFERENCES users(id),b TEXT NOT NULL REFERENCES users(id),winner TEXT,counted INTEGER NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS duel_totals(match TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created INTEGER NOT NULL,casts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(match,user_id));
   CREATE TABLE IF NOT EXISTS ai_usage(day TEXT NOT NULL, scope TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(day,scope));
   CREATE TABLE IF NOT EXISTS public_libraries(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL,downloads INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS public_downloads(resource TEXT NOT NULL REFERENCES public_libraries(id) ON DELETE CASCADE,visitor TEXT NOT NULL,PRIMARY KEY(resource,visitor));
   CREATE INDEX IF NOT EXISTS public_library_popular ON public_libraries(downloads DESC,created DESC);
   CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
   CREATE INDEX IF NOT EXISTS duel_pair ON duels(a,b,created);
   CREATE INDEX IF NOT EXISTS duel_total_user ON duel_totals(user_id,created);
   CREATE INDEX IF NOT EXISTS solo_owner ON solo_runs(user_id,created);`);
  if(!this.db.prepare('PRAGMA table_info(solo_runs)').all().some(column=>column.name==='casts'))this.db.exec('ALTER TABLE solo_runs ADD COLUMN casts INTEGER NOT NULL DEFAULT 0');
  if(!this.db.prepare('PRAGMA table_info(duel_totals)').all().some(column=>column.name==='casts'))this.db.exec('ALTER TABLE duel_totals ADD COLUMN casts INTEGER NOT NULL DEFAULT 0');
  this.db.exec(`INSERT OR IGNORE INTO duel_totals(match,user_id,created,casts) SELECT id,a,created,0 FROM duels;
   INSERT OR IGNORE INTO duel_totals(match,user_id,created,casts) SELECT id,b,created,0 FROM duels;`);
 }
 profile(token){if(!token||token.length>100)return null;return this.db.prepare('SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(hash(token),this.now())||null;}
 session(user){const token=id();this.db.prepare('DELETE FROM sessions WHERE expires<?').run(this.now());this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),user.id,this.now()+90*86400000);return {user,token};}
 recovery(){return randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');}
 register(name){
  name=String(name||'').normalize('NFKC').trim();if(!/^[\p{L}\p{N}_ -]{1,16}$/u.test(name))fail('昵称需为1～16个汉字、字母、数字或空格');
  if(this.db.prepare('SELECT id FROM users WHERE name=?').get(name))fail('昵称已有人使用，换一个试试',409);
  const user={id:id(),name},recoveryCode=this.recovery();
  this.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user.id,name,hash(recoveryCode.replaceAll('-','')),this.now());
  return {...this.session(user),recoveryCode};
 }
 restore(code){
  code=String(code||'').replace(/[\s-]/g,'').toUpperCase();if(!/^[A-F0-9]{32}$/.test(code))fail('恢复码不正确',401);
  const user=this.db.prepare('SELECT id,name FROM users WHERE recovery_hash=?').get(hash(code));if(!user)fail('恢复码不正确',401);return this.session(user);
 }
 rotateRecovery(user){const code=this.recovery();this.db.prepare('UPDATE users SET recovery_hash=? WHERE id=?').run(hash(code.replaceAll('-','')),user.id);return code;}
 logout(token){if(token)this.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token));}
 category(mode,level){if(!['letters','english','sentences'].includes(mode))fail('该模式暂不参加单人榜');level=mode==='letters'?0:Number(level);if(!Number.isInteger(level)||level<0||level>4)fail('请选择有效学段');return {mode,level};}
 startSolo(user,data){
  const {mode,level}=this.category(data.mode,data.level);if(data.custom)fail('自定义词库只作练习，不计入榜单');
  this.db.prepare('DELETE FROM solo_runs WHERE created<?').run(this.now()-30*86400000);
  const recent=this.db.prepare('SELECT count(*) n FROM solo_runs WHERE user_id=? AND created>?').get(user.id,this.now()-60000).n;
  if(recent>=10)fail('开始得太快，稍后再试',429);
  const runId=id();this.db.prepare('INSERT INTO solo_runs(id,user_id,mode,level,created) VALUES(?,?,?,?,?)').run(runId,user.id,mode,level,this.now());return {runId,mode,level};
 }
 finishSolo(user,data){
  const run=this.db.prepare('SELECT * FROM solo_runs WHERE id=? AND user_id=?').get(String(data.runId||''),user.id);
  if(!run)fail('这局没有有效的参榜记录，请登录后重新开始',404);
  if(run.finished!==null)return {accepted:true,duplicate:true,score:run.score};
  if(run.created<this.now()-30*86400000)fail('这局参榜记录已过期');
  const {score,wave,kills,casts,seconds}=data;
  if(![score,wave,kills,casts].every(Number.isSafeInteger)||score<0||score>10000000||wave<1||wave>10000||kills<0||casts<0||!Number.isFinite(seconds)||seconds<1)fail('成绩数据不完整');
  const elapsed=(this.now()-run.created)/1000;
  if(seconds>elapsed+15||score>1000+seconds*1500||wave>1+seconds/2||kills>10+seconds*10||casts>10+seconds*10)fail('成绩未通过基础校验');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   this.db.prepare('UPDATE solo_runs SET finished=?,score=?,wave=?,casts=? WHERE id=?').run(this.now(),score,wave,casts,run.id);
   this.db.prepare(`INSERT INTO solo_best VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mode,level) DO UPDATE SET score=excluded.score,wave=excluded.wave,updated=excluded.updated WHERE excluded.score>solo_best.score OR (excluded.score=solo_best.score AND excluded.wave>solo_best.wave)`).run(user.id,run.mode,run.level,score,wave,this.now());
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  return {accepted:true,score};
 }
 recordDuel(matchId,users,winner,seconds,casts=[]){
  const validPair=Array.isArray(users)&&users.length===2&&users[0]!==users[1];
  const participants=validPair?[...new Set(users.filter(Boolean))]:[];
  if(!matchId||participants.length>2||!Number.isFinite(seconds)||seconds<0||!Array.isArray(casts)||casts.some(value=>!Number.isSafeInteger(value)||value<0||value>100000))fail('无效结算');
  if(winner!==null&&winner!==0&&winner!==1)fail('无效结算');
  const eligible=validPair&&users.every(Boolean)&&seconds>=30;
  const [a,b]=eligible?[...users].sort():[null,null];const start=Math.floor((this.now()+8*3600000)/86400000)*86400000-8*3600000;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.db.prepare('SELECT counted FROM duels WHERE id=?').get(matchId);
   const seen=this.db.prepare('SELECT 1 FROM duel_totals WHERE match=? LIMIT 1').get(matchId);
   if(seen){this.db.exec('COMMIT');return {counted:!!existing?.counted,duplicate:true};}
   for(const userId of participants){const side=users.indexOf(userId);this.db.prepare('INSERT INTO duel_totals(match,user_id,created,casts) VALUES(?,?,?,?)').run(matchId,userId,this.now(),casts[side]||0);}
   if(!eligible){this.db.exec('COMMIT');return {counted:false,reason:'本局已计入累计对战；双方登录、不同账号且对局满30秒才计入积分榜'};}
   const n=this.db.prepare('SELECT count(*) n FROM duels WHERE a=? AND b=? AND counted=1 AND created>=?').get(a,b,start).n;
   const counted=n<3;this.db.prepare('INSERT INTO duels VALUES(?,?,?,?,?,?)').run(matchId,a,b,winner===null?null:users[winner],counted?1:0,this.now());
   this.db.exec('COMMIT');return {counted,reason:counted?'本局已计入对战榜':'与同一对手每天最多3局计分'};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 overview(){
  const practice=this.db.prepare('SELECT count(DISTINCT user_id) players,count(*) runs,COALESCE(sum(casts),0) casts FROM solo_runs WHERE finished IS NOT NULL').get();
  const duel=this.db.prepare('SELECT count(DISTINCT user_id) players,count(DISTINCT match) matches,COALESCE(sum(casts),0) casts FROM duel_totals').get();
  return {practice,duel};
 }
 leaderboard(kind,mode='english',level=0,user=null){
  let rows;
  if(kind==='solo'){
   ({mode,level}=this.category(mode,level));rows=this.db.prepare(`WITH totals AS (SELECT user_id id,count(*) practice,COALESCE(sum(casts),0) casts FROM solo_runs WHERE finished IS NOT NULL GROUP BY user_id)
    SELECT u.id,u.name,s.score,s.wave,COALESCE(t.practice,0) practice,COALESCE(t.casts,0) casts FROM solo_best s JOIN users u ON u.id=s.user_id LEFT JOIN totals t ON t.id=s.user_id WHERE mode=? AND level=? ORDER BY score DESC,wave DESC,updated ASC,u.id`).all(mode,level);
  }else if(kind==='duel'){
   rows=this.db.prepare(`WITH totals AS (SELECT user_id id,count(*) played,SUM(casts) casts FROM duel_totals GROUP BY user_id),
    entries AS (SELECT a id,winner FROM duels WHERE counted=1 UNION ALL SELECT b id,winner FROM duels WHERE counted=1),
    scores AS (SELECT id,SUM(CASE WHEN winner=id THEN 3 WHEN winner IS NULL THEN 1 ELSE 0 END) points,SUM(CASE WHEN winner=id THEN 1 ELSE 0 END) wins FROM entries GROUP BY id)
    SELECT u.id,u.name,COALESCE(s.points,0) points,COALESCE(s.wins,0) wins,t.played,t.casts FROM totals t JOIN users u ON u.id=t.id LEFT JOIN scores s ON s.id=t.id ORDER BY points DESC,wins DESC,played ASC,u.id`).all();
  }else fail('未知榜单');
  rows=rows.map((r,i)=>({...r,rank:i+1}));return {kind,mode,level,total:rows.length,overview:this.overview(),rows:rows.slice(0,50),me:user?(rows.find(r=>r.id===user.id)||null):null};
 }
 reserveAI(user,ip,{userLimit=20,ipLimit=20,globalLimit=100}={}){
  const day=new Date(this.now()+8*3600000).toISOString().slice(0,10),scopes=[['all',globalLimit],['user:'+user.id,userLimit],['ip:'+hash(String(ip)),ipLimit]];
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const [scope,limit] of scopes){const row=this.db.prepare('SELECT used FROM ai_usage WHERE day=? AND scope=?').get(day,scope);if((row?.used||0)>=limit)fail(scope==='all'?'今日智能整理总额度已用完，请明天再试':'今日智能整理次数已用完，请明天再试',429);}
   for(const [scope] of scopes)this.db.prepare('INSERT INTO ai_usage VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET used=used+1').run(day,scope);
   this.db.prepare('DELETE FROM ai_usage WHERE day<?').run(new Date(this.now()-7*86400000).toISOString().slice(0,10));this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 publishLibrary(user,data){
  const title=String(data.title||'').trim();
  if(!title||title.length>50)fail('资源名称需为1～50个字');
  const parsed=data.payload;
  if(!parsed||parsed.version!==1||!Array.isArray(parsed.groups)||!parsed.groups.length||parsed.groups.length>30||parsed.groups.some(g=>!customLibrary.validate(g)))fail('公共词句库格式不正确');
  const groups=parsed.groups.map((g,i)=>({id:String(i),familyId:'public',name:g.name,kind:g.kind,entries:g.entries.map(e=>customLibrary.entry(e,g.kind))}));
  const payload=JSON.stringify({version:1,groups});if(Buffer.byteLength(payload)>1500000)fail('资源过大，请拆分发布');
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.db.prepare('SELECT id FROM public_libraries WHERE owner=? AND title=? ORDER BY created,id').all(user.id,title);
   if(existing.length){
    const resourceId=existing[0].id;
    // Collapse duplicates made by older clients, preserving unique download receipts.
    for(const old of existing.slice(1)){
     this.db.prepare('INSERT OR IGNORE INTO public_downloads(resource,visitor) SELECT ?,visitor FROM public_downloads WHERE resource=?').run(resourceId,old.id);
     this.db.prepare('DELETE FROM public_libraries WHERE id=?').run(old.id);
    }
    this.db.prepare('UPDATE public_libraries SET payload=?,created=?,downloads=(SELECT count(*) FROM public_downloads WHERE resource=?) WHERE id=?').run(payload,this.now(),resourceId,resourceId);
    this.db.exec('COMMIT');return {id:resourceId,updated:true,author:user.name,authorId:user.id};
   }
   if(this.db.prepare('SELECT count(*) n FROM public_libraries WHERE owner=?').get(user.id).n>=100)fail('每个账号最多发布100份资源，请先撤下旧资源');
   const resourceId=id();this.db.prepare('INSERT INTO public_libraries(id,owner,title,payload,created) VALUES(?,?,?,?,?)').run(resourceId,user.id,title,payload,this.now());
   this.db.exec('COMMIT');return {id:resourceId,updated:false,author:user.name,authorId:user.id};
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 listLibraries({sort='popular',page=0,kind='all'}={},user=null){
  if(!['popular','newest'].includes(sort)||!['all','word','sentence'].includes(kind)||!Number.isSafeInteger(page)||page<0)fail('无效的榜单筛选');
  const where=kind==='all'?'':"WHERE EXISTS (SELECT 1 FROM json_each(l.payload,'$.groups') g WHERE json_extract(g.value,'$.kind')=?)";
  const args=kind==='all'?[]:[kind];
  const total=this.db.prepare('SELECT count(*) n FROM public_libraries l '+where).get(...args).n;
  const rows=this.db.prepare(`SELECT l.id,l.title,l.owner,u.name author,l.created,l.downloads,l.payload FROM public_libraries l JOIN users u ON u.id=l.owner ${where} ORDER BY ${sort==='popular'?'l.downloads DESC,':''} l.created DESC,l.id LIMIT 20 OFFSET ?`).all(...args,page*20);
  return {total,page,rows:rows.map(({payload,owner,...r})=>({...r,mine:owner===user?.id,groups:JSON.parse(payload).groups.map(g=>({id:g.id,name:g.name,kind:g.kind,count:g.entries.length}))}))};
 }
 publicLibrary(resourceId){const row=this.db.prepare('SELECT l.*,u.name author FROM public_libraries l JOIN users u ON u.id=l.owner WHERE l.id=?').get(String(resourceId||''));if(!row)fail('资源不存在或已被撤下',404);return row;}
 downloadLibrary(data,user){
  const row=this.publicLibrary(data.id);if(typeof data.visitor!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(data.visitor))fail('下载标识无效');
  if(row.owner===user?.id)return {downloads:row.downloads};
  const visitor=hash(user?'user:'+user.id:'device:'+data.visitor);
  this.db.exec('BEGIN IMMEDIATE');try{
   const added=this.db.prepare('INSERT OR IGNORE INTO public_downloads VALUES(?,?)').run(row.id,visitor);
   if(added.changes)this.db.prepare('UPDATE public_libraries SET downloads=downloads+1 WHERE id=?').run(row.id);
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
  return {downloads:this.publicLibrary(row.id).downloads};
 }
 removeLibrary(user,resourceId){const row=this.publicLibrary(resourceId);if(row.owner!==user.id)fail('只能撤下自己发布的资源',403);this.db.prepare('DELETE FROM public_libraries WHERE id=?').run(row.id);return {ok:true};}
 close(){this.db.close();}
}
