import {randomBytes} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const imageOK=value=>typeof value==='string'&&value.length<=12000000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
export class OCRQueue{
 constructor(store,organize,{key=()=>process.env.QWEN_API_KEY||process.env.DASHSCOPE_API_KEY}={}){
  this.store=store;this.db=store.db;this.organize=organize;this.key=key;this.stopped=false;this.running=false;
  this.db.exec(`CREATE TABLE IF NOT EXISTS ocr_jobs(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,text TEXT NOT NULL,total INTEGER NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,queued INTEGER,error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,receipt TEXT NOT NULL,completed_at INTEGER);
   CREATE TABLE IF NOT EXISTS ocr_pages(job TEXT NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,position INTEGER NOT NULL,image TEXT,result TEXT,PRIMARY KEY(job,position));
   CREATE TABLE IF NOT EXISTS ocr_receipts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS ocr_queue_order ON ocr_jobs(status,queued);`);
  if(!this.db.prepare('PRAGMA table_info(ocr_jobs)').all().some(column=>column.name==='completed_at'))this.db.exec('ALTER TABLE ocr_jobs ADD COLUMN completed_at INTEGER');
  this.db.prepare("UPDATE ocr_jobs SET completed_at=created WHERE status='completed' AND completed_at IS NULL").run();
  this.db.prepare("UPDATE ocr_jobs SET status='queued' WHERE status='processing'").run();
  this.cleanup();this.timer=setInterval(()=>this.cleanup(),60000);this.timer.unref();this.wake();
 }
 cleanup(){if(this.stopped)return;const now=this.store.now();this.db.prepare("DELETE FROM ocr_jobs WHERE status='completed' AND completed_at<=?").run(now-86400000);this.db.prepare("DELETE FROM ocr_jobs WHERE status NOT IN ('processing','completed') AND created<?").run(now-7*86400000);this.db.prepare("DELETE FROM ocr_jobs WHERE status='uploading' AND created<?").run(now-86400000);this.db.prepare('DELETE FROM ocr_receipts WHERE created<?').run(now-7*86400000);}
 owned(user,id){this.cleanup();const job=this.db.prepare('SELECT * FROM ocr_jobs WHERE id=? AND owner=?').get(String(id||''),user.id);if(!job)fail('OCR任务不存在、已领取或已过期',404);return job;}
 summary(job){const stats=this.db.prepare('SELECT count(*) uploaded,COALESCE(sum(result IS NOT NULL),0) completed FROM ocr_pages WHERE job=? AND position>=0').get(job.id);const ahead=job.status==='queued'?this.db.prepare("SELECT count(*) n FROM ocr_jobs WHERE status='processing' OR (status='queued' AND (queued<? OR (queued=? AND id<?)))").get(job.queued,job.queued,job.id).n:0;return {id:job.id,owner:job.owner,name:job.name,total:job.total,status:job.status,created:job.created,expiresAt:job.status==='completed'?job.completed_at+86400000:null,error:job.error,...stats,ahead};}
 create(user,{id,name,text='',total}){
  this.cleanup();if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id)||typeof name!=='string'||!name.trim()||name.trim().length>50||typeof text!=='string'||text.length>30000||!Number.isInteger(total)||total<1||total>9)fail('OCR任务需包含1～9张图片和有效词库名称');
  const existing=this.db.prepare('SELECT * FROM ocr_jobs WHERE id=?').get(id);if(existing){if(existing.owner!==user.id||(existing.status==='uploading'&&existing.text!==text)||existing.total!==total||existing.name!==name.trim())fail('任务标识已使用',409);return this.summary(existing);}
  if(this.db.prepare('SELECT id FROM ocr_receipts WHERE id=?').get(id))fail('任务已领取，请创建新任务',409);
  if(!this.key())fail('智能整理服务暂未就绪，请稍后再试',503);
  if(this.db.prepare('SELECT count(*) n FROM ocr_jobs WHERE owner=?').get(user.id).n>=3)fail('请先领取或删除已有任务，每个账号最多保留3个OCR任务',429);
  if(this.db.prepare('SELECT count(*) n FROM ocr_jobs').get().n>=20)fail('OCR任务队列已满，请稍后再试',429);
  this.db.prepare("INSERT INTO ocr_jobs(id,owner,name,text,total,status,created,receipt) VALUES(?,?,?,?,?,'uploading',?,?)").run(id,user.id,name.trim(),text,total,this.store.now(),randomBytes(18).toString('hex'));
  return this.summary(this.owned(user,id));
 }
 upload(user,{id,position,image}){
  const job=this.owned(user,id);if(job.status!=='uploading')return this.summary(job);
  if(!Number.isInteger(position)||position<0||position>=job.total||!imageOK(image))fail('请选择8MB以内的JPEG、PNG或WebP图片');
  const previous=this.db.prepare('SELECT image FROM ocr_pages WHERE job=? AND position=?').get(id,position);
  if(previous){if(previous.image!==image)fail('同一张图片不可替换，请新建任务',409);return this.summary(job);}
  const bytes=this.db.prepare('SELECT COALESCE(sum(length(image)),0) n FROM ocr_pages WHERE job=?').get(id).n;
  if(bytes+image.length>48000000)fail('9张图片的总大小不能超过36MB');
  this.db.prepare('INSERT INTO ocr_pages(job,position,image) VALUES(?,?,?)').run(id,position,image);return this.summary(job);
 }
 enqueueTime(){return Math.max(this.store.now(),(this.db.prepare('SELECT max(queued) value FROM ocr_jobs').get().value||0)+1);}
 submit(user,{id},ip){
  const job=this.owned(user,id);if(job.status!=='uploading')return this.summary(job);
  if(this.summary(job).uploaded!==job.total)fail('图片尚未上传完，请继续上传');
  this.store.reserveAI(user,ip);
  if(job.text.trim())this.db.prepare('INSERT INTO ocr_pages(job,position) VALUES(?,-1)').run(id);
  this.db.prepare("UPDATE ocr_jobs SET status='queued',queued=? WHERE id=?").run(this.enqueueTime(),id);const result=this.summary(this.owned(user,id));this.wake();return result;
 }
 list(user){this.cleanup();return {jobs:this.db.prepare('SELECT * FROM ocr_jobs WHERE owner=? ORDER BY created DESC').all(user.id).map(job=>this.summary(job))};}
 result(user,{id}){const job=this.owned(user,id);if(job.status!=='completed')fail('OCR尚未完成',409);const pages=this.db.prepare('SELECT result FROM ocr_pages WHERE job=? ORDER BY position').all(id).map(p=>JSON.parse(p.result));return {...this.summary(job),receipt:job.receipt,result:{entries:pages.flatMap(p=>p.entries),notes:pages.flatMap(p=>p.notes||[])}};}
 ack(user,{id,receipt}){
  const previous=this.db.prepare('SELECT owner FROM ocr_receipts WHERE id=?').get(String(id||''));if(previous){if(previous.owner!==user.id)fail('任务不存在',404);return {ok:true};}
  const job=this.owned(user,id);if(job.status!=='completed'||receipt!==job.receipt)fail('请先接收并保存识别结果',409);
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO ocr_receipts VALUES(?,?,?)').run(id,user.id,this.store.now());this.db.prepare('DELETE FROM ocr_jobs WHERE id=?').run(id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return {ok:true};
 }
 retry(user,{id}){const job=this.owned(user,id);if(job.status!=='failed')return this.summary(job);if(job.attempts>=3)fail('重试次数已用完，请检查图片后重新提交');this.db.prepare("UPDATE ocr_jobs SET status='queued',error='',queued=? WHERE id=?").run(this.enqueueTime(),id);const result=this.summary(this.owned(user,id));this.wake();return result;}
 remove(user,{id}){this.owned(user,id);if(this.currentJob===id)this.controller?.abort();this.db.prepare('DELETE FROM ocr_jobs WHERE id=?').run(id);return {ok:true};}
 wake(){if(this.stopped||this.running)return;this.running=true;this.work().catch(()=>{}).finally(()=>{this.running=false;if(!this.stopped&&this.db.prepare("SELECT id FROM ocr_jobs WHERE status='queued' LIMIT 1").get())this.wake();});}
 async work(){
  while(!this.stopped){
   const job=this.db.prepare("SELECT * FROM ocr_jobs WHERE status='queued' ORDER BY queued,id LIMIT 1").get();if(!job)return;
   this.db.prepare("UPDATE ocr_jobs SET status='processing',attempts=attempts+1 WHERE id=?").run(job.id);
   try{
    const pages=this.db.prepare('SELECT position FROM ocr_pages WHERE job=? AND result IS NULL ORDER BY position').all(job.id);
    for(const {position} of pages){
     if(this.stopped)return;
     const page=this.db.prepare('SELECT image FROM ocr_pages WHERE job=? AND position=?').get(job.id,position);if(!page)break;
     this.currentJob=job.id;this.controller=new AbortController();
     const result=await this.organize({text:position===-1?job.text:'',images:position===-1?[]:[page.image],kind:'auto',pipeline:'staged'},{key:this.key(),signal:this.controller.signal});
     if(this.stopped)return;
     if(!result||!Array.isArray(result.entries)||result.entries.length>300||result.entries.some(e=>!e||typeof e.text!=='string'||e.text.length>500||!['word','phrase','sentence'].includes(e.kind)))throw Error('Invalid OCR output');
     const clean={entries:result.entries.map(e=>({text:e.text,kind:e.kind,meaning:String(e.meaning||'').slice(0,500),ipa:String(e.ipa||'').slice(0,150),uncertain:!!e.uncertain})),notes:(Array.isArray(result.notes)?result.notes:[]).slice(0,30).map(note=>String(note).slice(0,500))};
     this.db.prepare('UPDATE ocr_pages SET result=?,image=NULL WHERE job=? AND position=?').run(JSON.stringify(clean),job.id,position);
    }
    if(!this.stopped)this.db.prepare("UPDATE ocr_jobs SET status='completed',text='',completed_at=? WHERE id=?").run(this.store.now(),job.id);
   }catch(error){if(this.stopped)return;this.db.prepare("UPDATE ocr_jobs SET status='failed',error='本张图片识别失败，已完成部分保留，可重试继续。' WHERE id=?").run(job.id);}
  }
 }
 close(){this.stopped=true;clearInterval(this.timer);this.controller?.abort();}
}
