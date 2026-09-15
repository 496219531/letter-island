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
   CREATE TABLE IF NOT EXISTS solo_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),mode TEXT NOT NULL,level INTEGER NOT NULL,created INTEGER NOT NULL,finished INTEGER,score INTEGER,wave INTEGER);
   CREATE TABLE IF NOT EXISTS solo_best(user_id TEXT NOT NULL REFERENCES users(id),mode TEXT NOT NULL,level INTEGER NOT NULL,score INTEGER NOT NULL,wave INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(user_id,mode,level));
   CREATE TABLE IF NOT EXISTS duels(id TEXT PRIMARY KEY,a TEXT NOT NULL REFERENCES users(id),b TEXT NOT NULL REFERENCES users(id),winner TEXT,counted INTEGER NOT NULL,created INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS ai_usage(day TEXT NOT NULL, scope TEXT NOT NULL, used INTEGER NOT NULL, PRIMARY KEY(day,scope));
   CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
   CREATE INDEX IF NOT EXISTS duel_pair ON duels(a,b,created);
   CREATE INDEX IF NOT EXISTS solo_owner ON solo_runs(user_id,created);`);
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
   this.db.prepare('UPDATE solo_runs SET finished=?,score=?,wave=? WHERE id=?').run(this.now(),score,wave,run.id);
   this.db.prepare(`INSERT INTO solo_best VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,mode,level) DO UPDATE SET score=excluded.score,wave=excluded.wave,updated=excluded.updated WHERE excluded.score>solo_best.score OR (excluded.score=solo_best.score AND excluded.wave>solo_best.wave)`).run(user.id,run.mode,run.level,score,wave,this.now());
   this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
  return {accepted:true,score};
 }
 recordDuel(matchId,users,winner,seconds){
  if(users.length!==2||users.some(u=>!u)||users[0]===users[1]||seconds<30)return {counted:false,reason:'双方登录、不同账号且对局满30秒才计榜'};
  if(winner!==null&&winner!==0&&winner!==1)fail('无效结算');
  const [a,b]=[...users].sort();const start=Math.floor((this.now()+8*3600000)/86400000)*86400000-8*3600000;
  this.db.exec('BEGIN IMMEDIATE');
  try{
   const existing=this.db.prepare('SELECT counted FROM duels WHERE id=?').get(matchId);if(existing){this.db.exec('COMMIT');return {counted:!!existing.counted,duplicate:true};}
   const n=this.db.prepare('SELECT count(*) n FROM duels WHERE a=? AND b=? AND counted=1 AND created>=?').get(a,b,start).n;
   const counted=n<3;this.db.prepare('INSERT INTO duels VALUES(?,?,?,?,?,?)').run(matchId,a,b,winner===null?null:users[winner],counted?1:0,this.now());
   this.db.exec('COMMIT');return {counted,reason:counted?'本局已计入对战榜':'与同一对手每天最多3局计分'};
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 leaderboard(kind,mode='english',level=0,user=null){
  let rows;
  if(kind==='solo'){
   ({mode,level}=this.category(mode,level));rows=this.db.prepare('SELECT u.id,u.name,s.score,s.wave FROM solo_best s JOIN users u ON u.id=s.user_id WHERE mode=? AND level=? ORDER BY score DESC,wave DESC,updated ASC,u.id').all(mode,level);
  }else if(kind==='duel'){
   rows=this.db.prepare(`WITH entries AS (SELECT a id,winner FROM duels WHERE counted=1 UNION ALL SELECT b id,winner FROM duels WHERE counted=1)
    SELECT u.id,u.name,SUM(CASE WHEN winner=id THEN 3 WHEN winner IS NULL THEN 1 ELSE 0 END) points,SUM(CASE WHEN winner=id THEN 1 ELSE 0 END) wins,count(*) played FROM entries e JOIN users u USING(id) GROUP BY u.id ORDER BY points DESC,wins DESC,played ASC,u.id`).all();
  }else fail('未知榜单');
  rows=rows.map((r,i)=>({...r,rank:i+1}));return {kind,mode,level,total:rows.length,rows:rows.slice(0,50),me:user?(rows.find(r=>r.id===user.id)||null):null};
 }
 reserveAI(user,ip,{userLimit=20,ipLimit=20,globalLimit=100}={}){
  const day=new Date(this.now()+8*3600000).toISOString().slice(0,10),scopes=[['all',globalLimit],['user:'+user.id,userLimit],['ip:'+hash(String(ip)),ipLimit]];
  this.db.exec('BEGIN IMMEDIATE');
  try{for(const [scope,limit] of scopes){const row=this.db.prepare('SELECT used FROM ai_usage WHERE day=? AND scope=?').get(day,scope);if((row?.used||0)>=limit)fail(scope==='all'?'今日智能整理总额度已用完，请明天再试':'今日智能整理次数已用完，请明天再试',429);}
   for(const [scope] of scopes)this.db.prepare('INSERT INTO ai_usage VALUES(?,?,1) ON CONFLICT(day,scope) DO UPDATE SET used=used+1').run(day,scope);
   this.db.prepare('DELETE FROM ai_usage WHERE day<?').run(new Date(this.now()-7*86400000).toISOString().slice(0,10));this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 close(){this.db.close();}
}
