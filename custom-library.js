(function(root){
  const KEY='gulu-custom-library-v1';
  const MAX_ENTRIES=2000,MAX_GROUPS=100;
  // Prompts never require typing punctuation: symbols become one normal space.
  // Ellipses and decorative quote/bracket glyphs are not learning content.
  function cleanText(text){return String(text||'').normalize('NFKC').replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/(?:\.{3}|…)/g,'').replace(/[「」『』《》〈〉“”]/g,'').replace(/\s+/g,' ').trim();}
  function code(text,kind){return cleanText(text).replace(/[^A-Za-z0-9]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase();}
  function entry(input,kind){const text=cleanText(input.text),word=code(text,kind);if(/[0-9]/.test(text))throw Error('英文内容不能包含数字，请改为英文单词。');if(text.length>500||!word||word.length>300||!/[A-Z]/.test(word)||!/^[A-Z ]+$/.test(word))throw Error('请保留至少一个英文单词；标点和特殊符号会自动按空格或略过处理。');return {text,word,meaning:String(input.meaning||'').trim().slice(0,500),ipa:String(input.ipa||'').trim().slice(0,150),note:String(input.note||'').slice(0,300),source:String(input.source||'manual').slice(0,40)};}
  function validate(group){try{return !!group&&typeof group.id==='string'&&group.id.length<=100&&typeof group.name==='string'&&group.name.length>0&&group.name.length<=50&&['word','sentence'].includes(group.kind)&&(group.familyId===undefined||(typeof group.familyId==='string'&&group.familyId.length<=100))&&Array.isArray(group.entries)&&group.entries.length>0&&group.entries.length<=MAX_ENTRIES&&group.entries.every(e=>typeof e.text==='string'&&typeof e.meaning==='string'&&typeof e.ipa==='string'&&entry(e,group.kind).word===e.word)&&new Set(group.entries.map(e=>e.word)).size===group.entries.length;}catch{return false;}}
  function parse(text,kind){return String(text).split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map((line,i)=>{
    line=line.replace(/^\d+[.)、]\s*/,'');let parts=line.split(/\t|\s*\|\s*/);
    if(parts.length===1){const at=line.search(/[\u3400-\u9fff]/);parts=at>0?[line.slice(0,at).trim(),line.slice(at)]:[line];}
    let english=parts[0],ipa=parts[2]||'';const match=english.match(/\s+\/([^/]+)\/\s*$/);if(match){ipa=ipa||match[1];english=english.slice(0,match.index);}
    try{return entry({text:english,meaning:parts[1]||'',ipa},kind);}catch(e){throw Error('第'+(i+1)+'行：'+e.message);}
  });}
  function enrich(entries,kind,vocabulary){const lookup=new Map((vocabulary?.entries||[]).map(e=>[e.word,e]));if(kind==='sentence'){lookup.clear();for(const tier of root.GuluDialogues?.tiers||[])for(const record of tier)for(let n=1;n<=3;n++){const lines=record.lines.slice(0,n);lookup.set(code(lines.map(l=>l.text).join(' '),'sentence'),{meaning:lines.map(l=>l.meaning).join(' / '),ipa:''});}}return entries.map(e=>{const found=lookup.get(e.word),fillIPA=kind==='word'&&!/\s/.test(code(e.text,kind));return found?{...e,meaning:e.meaning||found.meaning,ipa:e.ipa||(fillIPA?found.ipa:'')||'',source:(!e.meaning||fillIPA&&!e.ipa)?'local':e.source}:e;});}
  function mergeFields(previous,next){return {...previous,...next,meaning:String(next.meaning||'').trim()||previous?.meaning||'',ipa:String(next.ipa||'').trim()||previous?.ipa||''};}
  function dedupe(entries,kind){const rows=new Map();for(const e of entries){const entryKind=kind==='auto'?e.kind:kind,k=(kind==='auto'?entryKind+':':'')+code(e.text,entryKind),merged=mergeFields(rows.get(k),e);rows.delete(k);rows.set(k,merged);}return [...rows.values()];}
  async function prepare({text='',image=null,images=[],kind,pipeline='staged',existingEntries=[],organize,translate,vocabulary,onProgress=()=>{},active=()=>true}){
    const check=()=>{if(!active())throw Error('录入已取消');};
    check();onProgress('Qwen 正在整理输入内容…');const result=await organize({text,image,images,kind,pipeline});check();
    if(!Array.isArray(result.entries)||!result.entries.length||result.entries.length>300)throw Error('Qwen 未返回1至300条内容，请修改原文后重试。');
    if(kind==='auto'&&result.entries.some(e=>!['word','phrase','sentence'].includes(e.kind)))throw Error('AI未返回完整分类，请重新整理。');
    const normalized=result.entries.map(e=>{const category=kind==='auto'?e.kind:kind,entryKind=category==='sentence'?'sentence':'word';return {...e,kind:entryKind,category,text:String(e.text||'').trim(),meaning:String(e.meaning||'').trim(),ipa:String(e.ipa||'').trim(),word:code(e.text,entryKind)};});
    const existing=new Map(existingEntries.map(e=>[(kind==='auto'?(e.kind||'word')+':':'')+code(e.text,kind==='auto'?e.kind:kind),e]));const unique=dedupe(normalized,kind).map(e=>mergeFields(existing.get((kind==='auto'?e.kind+':':'')+e.word),e));onProgress('正在用标准词库补齐空缺…');
    const entries=pipeline==='one-shot'?unique:(kind==='auto'?unique.map(e=>enrich([e],e.kind,vocabulary)[0]):enrich(unique,kind,vocabulary)),notes=Array.isArray(result.notes)?result.notes.map(String):[];
    if(pipeline==='one-shot')notes.unshift('一步到位：先保留图片／输入中的原始中文和音标，再由 Qwen 仅补缺失字段，请人工确认。');
    if(unique.length<normalized.length)notes.push('已合并'+(normalized.length-unique.length)+'条重复内容，新非空字段覆盖旧字段，空白保留旧值。');
    const missing=entries.filter(e=>e.text&&!e.meaning);
    if(pipeline!=='one-shot'&&missing.length&&translate){
      const batchSize=24;
      for(let start=0;start<missing.length;start+=batchSize){
        check();const batch=missing.slice(start,start+batchSize);onProgress('正在用苹果翻译补齐缺失中文（'+(Math.floor(start/batchSize)+1)+' / '+Math.ceil(missing.length/batchSize)+' 批）…');
        try{const translated=await translate(batch.map(e=>e.text));check();batch.forEach((e,i)=>{if(typeof translated?.[i]==='string'&&translated[i].trim()){e.meaning=translated[i].trim();e.source='translation';}});}catch(error){check();notes.push('苹果翻译第'+(Math.floor(start/batchSize)+1)+'批未完成：'+error.message+'。该批缺失项已留空。');break;}
      }
    }
    check();return {entries,notes};
  }
  function repository(storage){function list(){const raw=storage.getItem(KEY);if(!raw)return [];const items=JSON.parse(raw);if(!Array.isArray(items))throw Error('自定义词库数据异常，原记录未覆盖。');if(items.every(validate))return items;
    // Older builds retained punctuation in the stored lookup key. Rebuild only
    // that derived key when the original English, Chinese and IPA are valid.
    try{const migrated=items.map(group=>{if(!group||!['word','sentence'].includes(group.kind)||!Array.isArray(group.entries))throw Error('invalid');const entries=dedupe(group.entries.map(item=>entry(item,group.kind)),group.kind);return {...group,entries};});if(migrated.some(group=>!validate(group)))throw Error('invalid');storage.setItem(KEY,JSON.stringify(migrated));return migrated;}catch{throw Error('自定义词库数据异常，原记录未覆盖。');}}
    return {list,saveClassified({id,name,entries}){
      const all=list(),rootGroup=id?all.find(g=>g.id===id):null;if(id&&!rootGroup)throw Error('分组已删除，请重新录入');
      if(!Array.isArray(entries)||!entries.length||entries.some(e=>!['word','sentence'].includes(e.kind)))throw Error('请保留至少一条已分类的内容');
      const family=rootGroup?.familyId||rootGroup?.id||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),base=String(name||'').trim().replace(/ · (单词词组|句子)$/,''),saved=[];
      if(!base||base.length>50)throw Error('请填写50字以内的分组名称');
      if(rootGroup)rootGroup.familyId=family;
      const kinds=[...new Set(entries.map(e=>e.kind))];
      for(const kind of kinds){
        const target=rootGroup?.kind===kind?rootGroup:all.find(g=>g.familyId===family&&g.kind===kind);
        const normalized=entries.filter(e=>e.kind===kind).map(e=>entry(e,kind));
        const merged=dedupe([...(target?.entries||[]),...normalized],kind);
        const label=target?.name||(kinds.length===1&&!rootGroup?base:base.slice(0,42)+' · '+(kind==='word'?'单词词组':'句子'));
        const clean={id:target?.id||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:label,kind,familyId:family,entries:merged};
        if(!validate(clean))throw Error('每个分类最多'+MAX_ENTRIES+'条，请检查英文内容。');
        const index=all.findIndex(g=>g.id===clean.id);if(index>=0)all[index]=clean;else all.push(clean);saved.push(clean);
      }
      if(all.length>MAX_GROUPS)throw Error('自动分类后超过'+MAX_GROUPS+'个分类，请分批保存。');
      storage.setItem(KEY,JSON.stringify(all));return saved;
    },save(group){const all=list(),i=all.findIndex(g=>g.id===group.id),existing=new Map((i>=0?all[i].entries:[]).map(e=>[e.word,e]));const rows=dedupe(group.entries.map(e=>entry(e,group.kind)),group.kind).map(e=>mergeFields(existing.get(e.word),e));const clean={id:group.id||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name:String(group.name||'').trim(),kind:group.kind,entries:rows,...(group.familyId?{familyId:group.familyId}:{} )};if(!validate(clean))throw Error('请填写分组名称，并加入1至'+MAX_ENTRIES+'条有效内容。');if(i>=0)all[i]=clean;else{if(all.length>=MAX_GROUPS)throw Error('最多保存'+MAX_GROUPS+'个分类。');all.push(clean);}storage.setItem(KEY,JSON.stringify(all));return clean;},remove(id){storage.setItem(KEY,JSON.stringify(list().filter(g=>g.id!==id)));},importGroups(groups){if(!Array.isArray(groups)||groups.some(g=>!validate(g)))throw Error('分组文件无效');const all=list();if(all.length+groups.length>MAX_GROUPS)throw Error('导入后超过'+MAX_GROUPS+'个分类');const families=new Map();const added=groups.map((g,i)=>{if(g.familyId&&!families.has(g.familyId))families.set(g.familyId,Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));return {...g,id:Date.now().toString(36)+'-'+i+'-'+Math.random().toString(36).slice(2),...(g.familyId?{familyId:families.get(g.familyId)}:{})};});storage.setItem(KEY,JSON.stringify([...all,...added]));}};}
  root.GuluCustomLibrary={cleanText,code,entry,validate,parse,enrich,mergeFields,dedupe,prepare,repository};if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluCustomLibrary;
})(typeof globalThis!=='undefined'?globalThis:this);
