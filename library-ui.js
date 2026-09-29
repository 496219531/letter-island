(function(){
  const C=GuluCustomLibrary,repo=C.repository(localStorage),$=s=>document.querySelector(s);
  const source=document.createElement('label');source.className='custom-source';source.textContent='练习题库';
  const select=document.createElement('select');select.id='customGroup';select.setAttribute('aria-label','练习题库');select.onchange=()=>updateTypingControls();source.append(select);
  const manage=document.createElement('button');manage.type='button';manage.textContent='词句库';manage.onclick=()=>openLibrary();source.append(manage);const pending=button(source,'未完成OCR任务',()=>openOCRTasks());pending.className='ocr-pending-entry';pending.hidden=true;async function updatePending(){try{const tasks=await GuluOCRTasks.list();pending.hidden=!tasks.length;pending.textContent='未完成OCR任务（'+tasks.length+'）';}catch{}}window.addEventListener('gulu-ocr-tasks',updatePending);updatePending();$('#startButton').before(source);
  let savedSnapshot=null;
  function groups(){return repo.list();}
  const familyKey=group=>group.familyId||group.id;
  const familyName=group=>group.name.replace(/ · (单词词组|句子)$/,'');
  const hasSpeechSpecial=entry=>/(?:\.{3}|…|[\\/|「」『』《》〈〉])/u.test(String(entry?.text||''));
  const speechReadyGroup=group=>({...group,entries:group.entries.filter(entry=>!hasSpeechSpecial(entry))});
  function families(rows=groups()){const map=new Map();for(const group of rows){const key=familyKey(group),family=map.get(key)||{key,name:familyName(group),groups:[]};family.groups.push(group);map.set(key,family);}return [...map.values()];}
  function refresh(){
    const mode=$('#difficulty').value,kind=mode==='english'?'word':'sentence',value=select.value;const wordMode=['english','sentences','speaking'].includes(mode),webHome=document.body.classList.contains('web-home');source.hidden=!wordMode&&!webHome;select.disabled=webHome&&!wordMode;
    select.replaceChildren(new Option(webHome&&!wordMode?'纯打字无需词库':'系统标准词句库',''));
    try{for(const original of groups().filter(g=>g.kind===kind)){const group=mode==='speaking'?speechReadyGroup(original):original;if(group.entries.length)select.add(new Option(group.name+' · '+group.entries.length+'条',group.id));}}catch(e){toast(e.message);}
    if(savedSnapshot&&savedSnapshot.kind===kind&&!Array.from(select.options).some(o=>o.value===savedSnapshot.id))select.add(new Option(savedSnapshot.name+' · 当前存档内容','__saved'));
    if(Array.from(select.options).some(o=>o.value===value))select.value=value;
  }
  function modal(title){
    const settings=$('#mobileSettingsDialog');if(settings?.open)settings.querySelector('button').click();
    const resume=game.status==='playing';if(resume)game.pause();stopListening();
    const d=document.createElement('dialog');d.className='library-dialog';d.setAttribute('aria-label',title);
    const header=document.createElement('header'),h=document.createElement('h2'),close=document.createElement('button');h.textContent=title;close.textContent='关闭';close.type='button';close.onclick=()=>d.close();header.append(h,close);d.append(header);
    const body=document.createElement('div');body.className='library-body';d.append(body);document.body.append(d);
    const viewport=()=>{const v=window.visualViewport;d.style.height=Math.max(220,(v?.height||innerHeight)-24)+'px';d.style.maxHeight=d.style.height;d.style.top=((v?.offsetTop||0)+12)+'px';d.style.bottom='auto';d.style.margin='0 auto';};viewport();window.visualViewport?.addEventListener('resize',viewport);
    d.addEventListener('close',()=>{stopPreview();window.visualViewport?.removeEventListener('resize',viewport);d.remove();refresh();if(resume&&game.status==='paused')game.resume();updateHud(true);});d.showModal();return {d,body};
  }
  function button(parent,label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b;}
  function note(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
  function info(parent,text){const details=document.createElement('details');details.className='library-info';const summary=document.createElement('summary');summary.textContent='ⓘ';summary.setAttribute('aria-label','查看说明');details.append(summary);note(details,text);parent.append(details);return details;}
  function input(parent,label,value='',tag='input'){const l=document.createElement('label');l.textContent=label;const el=document.createElement(tag);if(tag==='input')el.type='text';el.value=value;l.append(el);parent.append(l);return el;}
  const previewSpeech=GuluSystemSpeech.createLocalSpeech(window.speechSynthesis,window.SpeechSynthesisUtterance);
  function stopPreview(){previewSpeech.cancel();window.GuluNative?.stopLearningSpeech?.().catch(()=>{});}
  function entryContent(row,entry){
    const text=String(entry.text||entry.word||'').trim(),meaning=String(entry.meaning||'').trim();
    const line=document.createElement('div');line.className='library-entry-line';
    const content=document.createElement('div');content.className='library-entry-text';line.append(content);
    for(const [value,tag] of [[text,'strong'],[meaning,'span']]){if(!value)continue;const label=document.createElement(tag);label.textContent=value;content.append(label);}
    if(text||meaning){
      const play=button(line,'🔊',()=>{
        const report=error=>{status.textContent=error==='missing-chinese'?'系统缺少普通话声音，当前只读英文。':'朗读未成功，请检查系统是否已安装对应语言的声音。';};
        status.textContent='';previewSpeech.cancel();
        if(window.GuluNative?.speakLearning){GuluNative.speakLearning(text?{text,meaning,chinese:true,volume:1}:{text:meaning,language:'zh',chinese:false,volume:1}).catch(report);}
        else if(!(text?previewSpeech.enqueueLearning(text,meaning,{chinese:true,volume:1,onError:report}):previewSpeech.speak(meaning,report,'zh')))report();
      });play.setAttribute('aria-label','朗读词句：'+(text||meaning)+'，先英文后中文');play.title='先读英文，再读中文';
    }
    row.append(line);
    if(entry.ipa)note(row,'/'+entry.ipa+'/');
    const status=note(row,'');status.className='library-speech-status';status.setAttribute('role','status');
  }
  function viewStandard(){
    const {body}=modal('系统标准词句库');
    note(body,'系统标准词句库仅供查看和朗读，不能修改或删除。');
    const kind=input(body,'词句类型','','select');kind.add(new Option('单词／词组','word'));kind.add(new Option('句子／口语','sentence'));
    const stage=input(body,'学段','','select'),search=input(body,'搜索英文或中文');
    const count=note(body,''),list=document.createElement('div'),pager=document.createElement('nav');pager.className='library-tabs';pager.setAttribute('aria-label','标准词库分页');body.append(list,pager);
    let page=0;
    function stages(){stage.replaceChildren(new Option('全部学段','all'));const bank=kind.value==='word'?GuluVocabulary:GuluDialogues;bank.stages.forEach((item,i)=>stage.add(new Option(item.name,String(i))));}
    function render(){
      stopPreview();list.replaceChildren();pager.replaceChildren();
      const level=stage.value,query=search.value.trim().toLowerCase();
      const entries=kind.value==='word'?(level==='all'?GuluVocabulary.entries:GuluVocabulary.tiers[Number(level)]):(level==='all'?GuluDialogues.tiers.flat():GuluDialogues.tiers[Number(level)]).flatMap(group=>group.lines);
      const matches=entries.filter(entry=>((entry.text||entry.word||'')+' '+(entry.meaning||'')).toLowerCase().includes(query));
      const pages=Math.max(1,Math.ceil(matches.length/50));page=Math.min(page,pages-1);count.textContent='共 '+matches.length+' 条 · 第 '+(page+1)+' / '+pages+' 页';
      for(const entry of matches.slice(page*50,(page+1)*50)){const row=document.createElement('section');row.className='library-entry';entryContent(row,entry);list.append(row);}
      if(!matches.length)note(list,'没有找到匹配的词句。');
      button(pager,'上一页',()=>{page--;render();body.scrollTop=0;}).disabled=page===0;
      button(pager,'下一页',()=>{page++;render();body.scrollTop=0;}).disabled=page>=pages-1;
    }
    kind.onchange=()=>{page=0;stages();render();};stage.onchange=search.oninput=()=>{page=0;render();};stages();render();
  }
  async function libraryRequest(path,data){
    if(window.GuluNative?.communityRequest){const {status,result}=await GuluNative.communityRequest(path,data);if(status>=400)throw Object.assign(Error(result.error||'词句分享服务暂时不可用。'),{status});return result;}
    const response=await fetch('api/'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(path==='library/ocr/upload'?60000:15000)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'词句分享服务暂时不可用。'),{status:response.status});return result;
  }
  function publishFamily(family){
    const {body}=modal('发布到公共分享榜');
    note(body,'发布后所有人都能查看、下载和用于对战。同一账号再次发布同名词库会覆盖公开版本，保留下载次数。发布者可以撤下；已下载的本机副本需重新下载才会更新。');
    const title=input(body,'资源名称',family.name),status=note(body,'');status.setAttribute('role','status');
    const publish=button(body,'确认公开发布',async()=>{publish.disabled=true;try{const result=await libraryRequest('library/public/publish',{title:title.value,payload:{version:1,groups:family.groups}});repo.setLibrarySource(family.groups.map(g=>g.id),{resourceId:result.id,authorId:result.authorId,author:result.author,title:title.value.trim()});status.textContent=result.updated?'已用最新内容覆盖公开版本，下载次数保留。':'已发布，大家可以在公共分享榜找到这份词句。';}catch(e){status.textContent=e.message;publish.disabled=false;}});
  }
  function downloadPublicLibrary(detail){
    return new Promise(resolve=>{
      const {d,body}=modal('下载到本机');let result=null;
      note(body,'来源用户：'+detail.author);
      const name=input(body,'本地词库名称',detail.title),hint=note(body,''),status=note(body,'');hint.setAttribute('role','status');status.setAttribute('role','status');
      let action='save';
      const save=button(body,'保存到本机',()=>{try{result=repo.importPublic(detail,name.value,action);d.close();}catch(error){status.textContent=error.message;update();}});
      function update(){
        const conflict=repo.publicConflict(detail,name.value);action=conflict.action;
        hint.textContent=action==='overwrite'?'本地已有同名且来源用户相同的词库。可修改上方名称另存；不改名则覆盖，旧版独有的词条和本地修改会被替换。':action==='merge'?'本地已有同名词库，来源用户不同或尚未记录来源。可改名另存；不改名则合并，重复英文使用下载内容中的非空释义和音标。':'将保存为新的本地词库，并保留来源用户名。';
        save.textContent=action==='overwrite'?'覆盖本地版本':action==='merge'?'不改名，合并词库':'保存为新词库';
      }
      name.oninput=()=>{status.textContent='';update();};button(body,'取消下载',()=>d.close());d.addEventListener('close',()=>resolve(result),{once:true});update();
    });
  }
  function showSources(parent,rows){const authors=[...new Set(C.librarySources(...rows).map(source=>source.author))];if(authors.length)note(parent,'来源用户：'+authors.join('、'));}
  function renderPublicLibrary(d,body,onDownload){
    note(body,'下载到本机后即可离线练习；创建对战房间时也可直接选择公共词句。下载次数按账号或访客设备去重，发布者登录后下载自己的资源不计数。');
    const sort=input(body,'排序','','select');sort.add(new Option('下载最多','popular'));sort.add(new Option('最新发布','newest'));
    const kind=input(body,'类型','','select');for(const [value,label] of [['all','全部'],['word','单词／词组'],['sentence','句子／口语']])kind.add(new Option(label,value));
    const status=note(body,''),list=document.createElement('div'),pager=document.createElement('nav');status.setAttribute('role','status');pager.className='library-tabs';body.append(list,pager);let page=0,revision=0;
    async function render(){
      const current=++revision;status.textContent='正在加载…';list.replaceChildren();pager.replaceChildren();
      try{const result=await libraryRequest('library/public/list',{sort:sort.value,kind:kind.value,page});if(current!==revision||!d.isConnected)return;
        status.textContent=result.total?'共 '+result.total+' 份资源 · 第 '+(page+1)+' 页':'还没有公开资源，欢迎分享你的词句库。';
        for(const resource of result.rows){const row=document.createElement('section');row.className='library-group';const h=document.createElement('h3');h.textContent=resource.title;row.append(h);const popularity=note(row,'发布用户：'+resource.author+' · 下载 '+resource.downloads+' 次 · '+'更新于 '+new Date(resource.created).toLocaleString());note(row,resource.groups.map(g=>(g.kind==='word'?'单词／词组':'句子')+' '+g.count+' 条').join(' · '));
          button(row,'查看词句',async()=>{try{const detail=await libraryRequest('library/public/detail',{id:resource.id});const view=modal(detail.title);note(view.body,'发布用户：'+detail.author);for(const group of detail.payload.groups){const section=document.createElement('details');const summary=document.createElement('summary');summary.textContent=group.name+' · '+group.entries.length+' 条';section.append(summary);section.addEventListener('toggle',()=>{if(!section.open||section.dataset.loaded)return;section.dataset.loaded='yes';for(const entry of group.entries){const p=document.createElement('p');p.textContent=entry.text+' · '+entry.meaning;section.append(p);}});view.body.append(section);}}catch(e){status.textContent=e.message;}});
          const download=button(row,'下载到本机练习',async()=>{download.disabled=true;let saved=false;try{
            const detail=await libraryRequest('library/public/detail',{id:resource.id});const imported=await downloadPublicLibrary(detail);if(!imported){download.disabled=false;return;}saved=true;refresh();onDownload();
            let visitor=localStorage.getItem('gulu-public-visitor');if(!visitor){visitor=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');localStorage.setItem('gulu-public-visitor',visitor);}
            const counted=await libraryRequest('library/public/download',{id:resource.id,visitor});popularity.textContent='发布用户：'+resource.author+' · 下载 '+counted.downloads+' 次 · '+'更新于 '+new Date(resource.created).toLocaleString();status.textContent='已保存到本机，在练习题库中选择即可开始。累计下载 '+counted.downloads+' 次。';download.textContent='已下载到本机';
          }catch(e){status.textContent=saved?'已保存到本机，下载次数暂未同步。':e.message;download.disabled=saved;}});
          if(resource.mine){const remove=button(row,'撤下公开资源',async()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='再次点击确认撤下';return;}remove.disabled=true;try{await libraryRequest('library/public/remove',{id:resource.id});await render();}catch(e){status.textContent=e.message;remove.disabled=false;}});}
          list.append(row);
        }
        button(pager,'上一页',()=>{page--;render();}).disabled=page===0;button(pager,'下一页',()=>{page++;render();}).disabled=(page+1)*20>=result.total;
      }catch(e){if(current===revision)status.textContent=e.message;}
    }
    sort.onchange=kind.onchange=()=>{page=0;render();};button(body,'刷新榜单',render);return render;
  }
  function shareFamily(family){
    const {body}=modal('发送本地词句');info(body,'会把当前词库中已确认的英文、中文和音标上传到临时中转，接收方领取后保存到自己的本机。图片不会上传，不会重新图片识别，也不会调用 AI。发送码在24小时内可重复领取，不会成为长期云端词库。');
    const code=input(body,'临时发送码');code.readOnly=true;code.placeholder='生成后复制发送';const status=note(body,'');status.setAttribute('role','status');
    const create=button(body,'上传并生成发送码',async()=>{create.disabled=true;try{const result=await libraryRequest('library/share',{payload:JSON.stringify({version:1,groups:family.groups})});code.value=result.code;status.textContent='本地词句已暂存，有效期至 '+new Date(result.expiresAt).toLocaleString()+'；期间可重复领取。';}catch(error){status.textContent=error.message;}finally{create.disabled=false;}});
    button(body,'复制发送码',async()=>{if(!code.value){status.textContent='请先上传并生成发送码。';return;}try{await navigator.clipboard.writeText(code.value);status.textContent='已复制，可以发送给对方。';}catch{code.focus();code.select();status.textContent='请长按或复制选中的发送码后发送。';}});
  }
  function ocrProgress(task){return task.result||task.status==='ready'?'识别已完成，等待确认保存':task.status==='completed'?'OCR已完成，可领取结果':task.status==='uploading'?'上传中 '+(task.uploaded||0)+'/'+task.total+' 张（提交完成后可离开）':task.status==='queued'?'排队中 · 前面 '+(task.ahead||0)+' 个任务 · 已完成 '+(task.completed||0)+'/'+task.total+' 张':task.status==='failed'?'识别暂停 · 已完成 '+(task.completed||0)+'/'+task.total+' 张 · '+task.error:'OCR识别中 · 已完成 '+(task.completed||0)+'/'+task.total+' 张';}
  function openOCRTasks(onSave=()=>{}){
    const {d,body}=modal('未完成OCR任务');note(body,'图片全部上传并提交后，熄屏不影响服务器排队识别。识别结果存到本机后即从服务器删除；后续补全和人工确认在这里继续。识别完成后24小时未领取，服务器自动删除结果；已存到本机的结果不受影响。未上传完成的任务保留1天。');
    const status=note(body,''),list=document.createElement('div');status.setAttribute('role','status');body.append(list);let busy=false;
    async function render(){if(busy||!d.isConnected||document.hidden)return;busy=true;try{
      const {user}=await libraryRequest('account');if(!user)throw Error('请先加入小院账号，再查看OCR任务');
      const cloud=await libraryRequest('library/ocr/list',{});let local=await GuluOCRTasks.list();
      for(const task of cloud.jobs)if(!local.some(item=>item.id===task.id)){const recovered={...task,groupId:null};await GuluOCRTasks.put(recovered);local.push(recovered);}
      const tasks=local.filter(task=>task.owner===user.id);list.replaceChildren();status.textContent=tasks.length?'共 '+tasks.length+' 个待处理任务':'没有未完成的OCR任务。';
      for(const task of tasks){const row=document.createElement('section');row.className='library-group';const title=document.createElement('h3');title.textContent=task.name;row.append(title);const cloudTask=cloud.jobs.find(item=>item.id===task.id),current=task.result?task:cloudTask||task;note(row,ocrProgress(current));
        const action=button(row,task.result?'继续补全并确认':current.status==='failed'?'重试未完成图片':current.status==='uploading'?'继续上传':'检查进度／领取结果',async()=>{action.disabled=true;try{
          if(current.status==='failed')await libraryRequest('library/ocr/retry',{id:task.id});
          const ready=await GuluOCRTasks.resume(task,libraryRequest,state=>status.textContent=ocrProgress(state));
          if(ready.result){const group=groups().find(g=>g.id===ready.groupId)||null;editor(group,onSave,{ocrTask:ready});}await render();
        }catch(error){status.textContent=error.message;}finally{action.disabled=false;}});
        const del=button(row,'删除任务',async()=>{if(GuluOCRTasks.isActive(task.id)){status.textContent='正在保存任务，请稍后再删除';return;}if(del.dataset.confirm!=='yes'){del.dataset.confirm='yes';del.textContent='再次点击确认删除';return;}del.disabled=true;try{if(!task.acknowledged){try{await libraryRequest('library/ocr/remove',{id:task.id});}catch(error){if(error.status!==404&&!task.result)throw error;}}await GuluOCRTasks.remove(task.id);await render();}catch(error){status.textContent=error.message;del.disabled=false;}});list.append(row);
        if(cloudTask?.status==='completed'&&!task.result){await GuluOCRTasks.resume(task,libraryRequest);}
      }
    }catch(error){status.textContent=error.message;}finally{busy=false;}}
    button(body,'刷新任务',render);const timer=setInterval(render,4000),resume=()=>render();document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);d.addEventListener('close',()=>{clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);});render();
  }
  function openLibrary(){
    const {d,body:container}=modal('词句库');
    const tabs=document.createElement('nav');tabs.className='library-tabs library-main-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','词句库分类');container.before(tabs);
    const body=document.createElement('section'),publicBody=document.createElement('section');container.append(body,publicBody);
    let loadPublic=null;
    const panels=[body,publicBody],tabButtons=[];
    function activate(index){
      stopPreview();container.scrollTop=0;
      panels.forEach((panel,i)=>{panel.hidden=i!==index;tabButtons[i].classList.toggle('active',i===index);tabButtons[i].setAttribute('aria-selected',String(i===index));tabButtons[i].tabIndex=i===index?0:-1;});
      if(index===0)render();
      else{if(!loadPublic)loadPublic=renderPublicLibrary(d,publicBody,render);loadPublic();}
    }
    for(const [index,label] of ['我的词句库','公共分享榜'].entries()){
      const tab=button(tabs,label,()=>activate(index));tab.id='library-main-tab-'+index;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','library-main-panel-'+index);tabButtons.push(tab);
      panels[index].id='library-main-panel-'+index;panels[index].setAttribute('role','tabpanel');panels[index].setAttribute('aria-labelledby',tab.id);
      tab.onkeydown=event=>{const next=event.key==='Home'?0:event.key==='End'?1:['ArrowLeft','ArrowRight'].includes(event.key)?1-index:null;if(next!==null){event.preventDefault();activate(next);tabButtons[next].focus();}};
    }
    button(body,'未完成OCR任务',()=>openOCRTasks(render));button(body,'查看系统标准词句库（只读）',viewStandard);
    info(body,'每个词库统一维护单词、词组和句子；开始练习时会按当前练习方式自动筛选。保存后可在主页“练习题库”直接选中。每个分类最多2000条，最多100个分类。');
    const add=button(body,'＋ 录入词句／图片',()=>editor(null,render));add.className='library-add';
    const pipelineLabel=document.createElement('label');pipelineLabel.className='library-pipeline';pipelineLabel.textContent='整理方式';const pipeline=document.createElement('select');pipeline.id='libraryPipeline';pipeline.add(new Option('分步补全（推荐：Qwen→词库→苹果翻译）','staged'));pipeline.add(new Option('一步到位（实验阶段）','one-shot'));try{pipeline.value=localStorage.getItem('gulu-library-pipeline')==='one-shot'?'one-shot':'staged';}catch{}pipeline.onchange=()=>{try{localStorage.setItem('gulu-library-pipeline',pipeline.value);}catch{}};pipelineLabel.append(pipeline);body.append(pipelineLabel);info(body,'分步补全会由 Qwen 先整理分类，再用标准词库和苹果翻译补空缺；一步到位仍在实验阶段，结果可能不完整。两种方式都会进入人工确认。智能整理由小院统一提供，无需填写 API Key；使用前请先加入小院账号。每个账号每天可整理20次。');
    const list=document.createElement('div');body.append(list);
    function render(){list.replaceChildren();let rows;try{rows=groups();}catch(e){note(list,e.message);return;}
      if(!rows.length)note(list,'还没有自定义分组，可以先粘贴老师发来的词句。');
      for(const family of families(rows)){const row=document.createElement('section');row.className='library-group';const h=document.createElement('h3');h.textContent=family.name;row.append(h);showSources(row,family.groups);const words=family.groups.find(group=>group.kind==='word')?.entries.length||0,sentences=family.groups.find(group=>group.kind==='sentence')?.entries.length||0;note(row,'单词／词组 '+words+' 条 · 句子／口语 '+sentences+' 条');
        const actions=document.createElement('div');actions.className='library-group-actions';row.append(actions);button(actions,'查看词句',()=>viewFamily(family.key,render));const more=document.createElement('details');more.className='library-more';const summary=document.createElement('summary');summary.textContent='•••';summary.setAttribute('aria-label','更多词库操作');more.append(summary);button(more,'发送给他人',()=>shareFamily(family));button(more,'发布到公共分享榜',()=>publishFamily(family));const del=button(more,'删除词库',()=>{if(del.dataset.confirm!=='yes'){del.dataset.confirm='yes';del.textContent='再次点击确认删除';return;}try{for(const group of family.groups)repo.remove(group.id);render();refresh();}catch(e){note(row,e.message);}});actions.append(more);list.append(row);
      }
    }render();
    const exportButton=button(body,'导出全部分组',()=>{
      const json=JSON.stringify({version:1,groups:groups()},null,2);
      if(window.GuluNative?.exportLibrary){GuluNative.exportLibrary(json).catch(e=>toast(e.message));return;}
      const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='我的词句库.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });exportButton.className='library-utility-button';
    const file=input(body,'恢复词句库备份','','input');file.parentElement.className='library-utility-field';file.type='file';file.accept='.json,application/json';file.onchange=async()=>{try{if(file.files[0].size>8000000)throw Error('文件过大');const data=JSON.parse(await file.files[0].text());const items=data.groups;if(!Array.isArray(items)||items.some(g=>!C.validate(g)))throw Error('不是有效的词句库文件');const current=groups();if(current.length+items.length>100)throw Error('导入后超过100个分类');repo.importGroups(items);render();refresh();}catch(e){note(body,'导入失败：'+e.message);}};
    const shareCode=input(body,'领取临时发送码');shareCode.parentElement.className='library-utility-field';shareCode.autocapitalize='none';shareCode.spellcheck=false;const receiveStatus=note(body,'领取后立即保存到本机。');receiveStatus.setAttribute('role','status');const receive=button(body,'领取并保存',async()=>{receive.disabled=true;try{const result=await libraryRequest('library/share/claim',{code:shareCode.value}),data=JSON.parse(result.payload),items=data.groups;if(!Array.isArray(items)||!items.length||items.some(group=>!C.validate(group)))throw Error('分享内容无效，未写入本机。');if(groups().length+items.length>100)throw Error('导入后超过100个分类，请先整理已有词句库。');repo.importGroups(items);shareCode.value='';receiveStatus.textContent='已保存到本机词句库。';render();refresh();}catch(error){receiveStatus.textContent=error.message;}finally{receive.disabled=false;}});receive.className='library-utility-button';
    const disclosure=(label,nodes)=>{const section=document.createElement('details');section.className='library-tool-row';const summary=document.createElement('summary');summary.textContent=label;section.append(summary);for(const node of nodes)section.append(node);body.append(section);return section;};
    const sharing=disclosure('分享词库',[]);
    sharing.addEventListener('toggle',()=>{if(!sharing.open)return;sharing.querySelectorAll('button,p').forEach(node=>node.remove());const current=families();for(const family of current)button(sharing,family.name,()=>shareFamily(family));if(!current.length)note(sharing,'先录入词句，再分享给朋友。');});
    body.append(exportButton);
    disclosure('恢复词句库备份',[file.parentElement]);
    disclosure('领取临时发送码',[shareCode.parentElement,receiveStatus,receive]);

    const pipelineHelp=pipelineLabel.nextElementSibling;if(pipelineHelp?.classList.contains('library-info'))pipelineLabel.append(pipelineHelp);
    activate(0);
  }
  function viewFamily(id,onSave){
    const {d,body}=modal('查看词句');
    let entryType='all',searchText='';
    function render(preserveScroll=false){
      const scrollTop=preserveScroll?body.scrollTop:0;
      const related=groups().filter(group=>familyKey(group)===id);if(!related.length){d.close();return;}const title=familyName(related[0]);
      body.replaceChildren();d.querySelector('h2').textContent=title;showSources(body,related);
      const words=related.find(group=>group.kind==='word')?.entries.length||0,sentences=related.find(group=>group.kind==='sentence')?.entries.length||0;note(body,'单词／词组 '+words+' 条 · 句子／口语 '+sentences+' 条');
      button(body,'修改词库名称',()=>{const box=document.createElement('section');body.prepend(box);const field=input(box,'词库名称',title);button(box,'保存名称',()=>{try{const current=groups().filter(group=>familyKey(group)===id);for(const group of current)repo.save({...group,name:current.length>1?field.value+' · '+(group.kind==='word'?'单词词组':'句子'):field.value});render();onSave();}catch(error){note(box,error.message);}});button(box,'取消',()=>box.remove());});
      button(body,'＋ 录入新词句 / 图片',()=>editor(related[0],()=>{render();onSave();}));
      const tabs=document.createElement('nav');tabs.className='library-tabs';tabs.setAttribute('aria-label','筛选词句类型');
      for(const [kind,label] of [['all','全部'],['word','单词／词组'],['sentence','句子／口语']]){const tab=button(tabs,label,()=>{entryType=kind;render(true);});tab.classList.toggle('active',entryType===kind);tab.setAttribute('aria-pressed',String(entryType===kind));}body.append(tabs);
      const filter=input(body,'搜索英文或中文',searchText),list=document.createElement('div');body.append(list);
      function rows(){list.replaceChildren();const query=filter.value.trim().toLowerCase(),items=related.flatMap(group=>group.entries.map(entry=>({group,entry}))).filter(({group,entry})=>(entryType==='all'||group.kind===entryType)&&(entry.text+' '+entry.meaning).toLowerCase().includes(query));for(const {group,entry:e} of items){
        const row=document.createElement('section');row.className='library-entry';entryContent(row,e);note(row,group.kind==='word'?'单词／词组':'句子／口语');
        button(row,'修改此条',()=>{row.replaceChildren();const type=input(row,'练习类型','','select');type.add(new Option('单词／词组','word'));type.add(new Option('句子／口语','sentence'));type.value=group.kind;const en=input(row,'英文',e.text),zh=input(row,'中文（可空）',e.meaning),ipa=input(row,'音标（可空）',e.ipa),status=note(row,'空白保留已有值；改变类型会移动到同一词库的对应分类。');button(row,'保存修改',()=>{try{repo.moveEntry({sourceId:group.id,sourceWord:e.word,input:{text:en.value,meaning:zh.value,ipa:ipa.value},kind:type.value});render(true);onSave();}catch(error){status.textContent=error.message;}});button(row,'取消',rows);});
        const remove=button(row,'删除此条',()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='再次点击确认删除';return;}try{const latest=groups().find(item=>item.id===group.id),entries=latest.entries.filter(old=>old.word!==e.word);if(entries.length)repo.save({...latest,entries});else repo.remove(group.id);render(true);onSave();}catch(error){note(row,error.message);}});list.append(row);
      }}filter.oninput=()=>{searchText=filter.value;rows();};rows();
      if(preserveScroll)requestAnimationFrame(()=>body.scrollTop=Math.min(scrollTop,Math.max(0,body.scrollHeight-body.clientHeight)));
    }render();
  }
  function editor(group=null,onSave=()=>{},seed=null){
    const {d,body}=modal('录入词句'),form=document.createElement('div');body.append(form);
    const name=input(form,'分组名称',seed?.ocrTask?.name||group?.name||'');name.maxLength=50;
    info(form,'AI会自动区分单词、词组和完整句子，无需选择类型。混合内容会自动分开保存，已有词句不会丢失。');
    const raw=input(form,'输入或粘贴内容',seed?.text||'','textarea');raw.rows=7;raw.maxLength=30000;raw.placeholder='直接粘贴词语、句子或老师发来的内容，也可以选择图片';raw.autocapitalize='none';raw.spellcheck=false;
    const imageInput=document.createElement('input');imageInput.type='file';imageInput.accept='image/png,image/jpeg,image/webp';imageInput.multiple=true;imageInput.hidden=true;form.append(imageInput);const chooseImages=button(form,'选择图片（0/9）',()=>pickImages());const imageList=document.createElement('div');form.append(imageList);
    const previewImage=document.createElement('img');previewImage.className='library-image';previewImage.hidden=true;form.append(previewImage);
    info(form,'图片先逐张排队OCR，只读取原文；结果取回后再用标准词库和苹果翻译补空缺，最后逐条人工确认。纯文字仍按所选整理方式处理。文字和所选图片会发送给Qwen；英文为主键；新非空中文、音标分别覆盖旧值，空白保留旧值。');
    const status=note(form,'词组不查找或补全音标。中文或音标缺失不影响练习，不显示或朗读缺失内容。');status.setAttribute('role','status');
    const submitted=document.createElement('section');submitted.className='ocr-submitted';submitted.hidden=true;const submittedTitle=document.createElement('strong'),submittedText=note(submitted,''),exitOCR=button(submitted,'退出页面，稍后查看进度',()=>d.close());submitted.append(submittedTitle);form.append(submitted);
    let imageURL=null,imageData=[],imageLoading=false,revision=0,ocrTask=seed?.ocrTask||null;
    function showSubmitted(task){
      if(!task||!['queued','processing'].includes(task.status))return;
      submitted.hidden=false;submittedTitle.textContent='OCR任务已提交';
      submittedText.textContent='可以退出页面。识别会继续排队进行，稍后从“未完成OCR任务”查看已完成张数和领取结果。';
      exitOCR.disabled=false;
    }
    const submit=button(form,'保存',async()=>{
      if(imageLoading)return;if(!name.value.trim()){status.textContent='请先填写分组名称。';name.focus();return;}if(!ocrTask&&!raw.value.trim()&&!imageData.length){status.textContent='请输入内容或选择图片。';return;}
      const token=++revision,active=()=>d.isConnected&&token===revision,pipeline=(()=>{try{return localStorage.getItem('gulu-library-pipeline')==='one-shot'?'one-shot':'staged';}catch{return 'staged';}})(),payload={text:raw.value,images:imageData,kind:'auto',pipeline};
      const controls=[...form.querySelectorAll('input,textarea,select,button')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
      try{
        if(imageData.length&&!ocrTask){
          const {user}=await libraryRequest('account');if(!user)throw Error('请先加入小院账号');
          ocrTask={id:Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''),owner:user.id,name:name.value.trim(),groupId:group?.id||null,images:[...imageData],text:raw.value,total:imageData.length,status:'uploading',created:Date.now()};await GuluOCRTasks.put(ocrTask);
        }
        if(ocrTask&&!ocrTask.result){
          ocrTask=await GuluOCRTasks.resume(ocrTask,libraryRequest,state=>{if(active())status.textContent=ocrProgress(state);});
          if(!ocrTask.result){if(active()){status.textContent=ocrProgress(ocrTask);showSubmitted(ocrTask);submit.textContent='检查进度／领取结果';}return;}
        }
        const organize=async data=>{
          if(ocrTask?.result)return ocrTask.result;
          if(window.GuluNative?.communityRequest){const {status,result}=await GuluNative.communityRequest('library/organize',data);if(status>=400)throw Error(result.error||'整理失败');return result;}
          const response=await fetch('api/library/organize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(125000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Qwen整理失败');return result;
        };
        const result=await C.prepare({...payload,...(ocrTask?{pipeline:'staged',maxEntries:3000}:{}),existingEntries:group?groups().filter(g=>g.id===group.id||g.familyId===(group.familyId||group.id)).flatMap(g=>g.entries.map(e=>({...e,kind:g.kind}))):[],organize,translate:(ocrTask||pipeline==='staged')&&window.GuluNative?.translateTexts?texts=>GuluNative.translateTexts(texts,progress=>{if(active())status.textContent='苹果翻译：本批已完成 '+progress.completed+' / '+progress.total+' 条…';}):null,vocabulary:GuluVocabulary,onProgress:text=>{if(active())status.textContent=text;},active});
        if(active())review(result);
      }catch(error){if(active())status.textContent=error.message+' 原始内容已保留，请重试。';}
      finally{if(active()){controls.forEach((el,i)=>el.disabled=disabled[i]);refreshImages();}}
    });
    function refreshImages(){
      imageList.replaceChildren();chooseImages.textContent='选择图片（'+imageData.length+'/9）';chooseImages.disabled=imageLoading||imageData.length>=9||!!ocrTask;
      imageData.forEach((data,index)=>{const line=document.createElement('p');line.textContent='图片 '+(index+1);const remove=button(line,'移除',()=>{imageData.splice(index,1);refreshImages();});remove.disabled=!!ocrTask;imageList.append(line);});
      previewImage.hidden=!imageData.length;if(imageData.length)previewImage.src=imageData[0];
    }
    async function acceptImages(data){const remaining=9-imageData.length,accepted=data.slice(0,remaining);if(accepted.some(image=>image.length>12000000)||[...imageData,...accepted].reduce((sum,image)=>sum+image.length,0)>48000000)throw Error('图片总大小不能超过36MB，单张不能超过8MB');imageData.push(...accepted);status.textContent=data.length>remaining?'最多9张，超出的图片未加入。':'已选择 '+imageData.length+' 张图片；提交后逐张OCR识别。';refreshImages();}
    async function pickImages(){
      if(imageData.length>=9||imageLoading||ocrTask)return;
      if(!window.GuluNative?.pickLibraryImages){imageInput.click();return;}
      imageLoading=true;chooseImages.disabled=true;submit.disabled=true;
      try{const result=await GuluNative.pickLibraryImages(9-imageData.length);if(d.isConnected)await acceptImages(result.images||[]);}catch(error){status.textContent=error.message;}finally{imageLoading=false;submit.disabled=false;refreshImages();}
    }
    imageInput.onchange=async()=>{
      if(imageLoading||ocrTask)return;const files=[...imageInput.files],remaining=9-imageData.length;imageInput.value='';if(!files.length)return;
      imageLoading=true;submit.disabled=true;chooseImages.disabled=true;
      try{const chosen=files.slice(0,remaining);if(chosen.some(file=>file.size>8*1024*1024))throw Error('单张图片不能超过8MB');const data=[];for(const file of chosen)data.push(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);}));if(d.isConnected){await acceptImages(data);if(files.length>remaining)status.textContent='最多9张，超出的图片未加入。';}}
      catch(error){status.textContent=error.message;}finally{imageLoading=false;submit.disabled=false;refreshImages();}
    };
    function review(result){
      reviewing=true;form.hidden=true;d.querySelector('h2').textContent='确认本次录入';d.setAttribute('aria-label','确认本次录入');d.querySelector('header button').hidden=true;
      const page=document.createElement('div');page.className='library-review';body.append(page);let entries=result.entries;
      info(page,'请逐条检查并修改英文、中文和音标。新条目的中文或音标可留空；已有条目的空白字段保留原值。确认保存前不会写入词句库。');
      if(result.notes.length)note(page,result.notes.join('；'));
      const summary=note(page,''),tabs=document.createElement('nav');tabs.className='library-tabs';tabs.setAttribute('aria-label','确认词句类型');page.append(tabs);const rows=document.createElement('div');rows.className='library-preview';page.append(rows);const error=note(page,'');error.setAttribute('role','status');reviewError=error;let reviewType=entries.some(e=>e.kind==='word')?'word':'sentence';
      function render(preserveScroll=false){const scrollTop=preserveScroll?body.scrollTop:0;rows.replaceChildren();tabs.replaceChildren();summary.textContent='AI已分好：单词／词组 '+entries.filter(e=>e.kind==='word').length+' 条，句子／口语 '+entries.filter(e=>e.kind==='sentence').length+' 条';for(const [kind,label] of [['word','单词／词组'],['sentence','句子／口语']]){const tab=button(tabs,label+' '+entries.filter(e=>e.kind===kind).length,()=>{reviewType=kind;render(true);});tab.classList.toggle('active',reviewType===kind);tab.setAttribute('aria-pressed',String(reviewType===kind));}let shown=0;entries.forEach((e,i)=>{if(e.kind!==reviewType)return;shown++;const row=document.createElement('section');row.className='library-entry';note(row,'第 '+(i+1)+' 条'+(e.uncertain?' · 原文不确定，请核对':''));const type=input(row,'练习类型','','select');type.add(new Option('单词','word'));type.add(new Option('词组','phrase'));type.add(new Option('句子／口语','sentence'));type.value=e.kind==='sentence'?'sentence':e.category==='phrase'?'phrase':'word';const en=input(row,'英文',e.text),zh=input(row,'中文（可空）',e.meaning),ipa=input(row,'音标（可空）',e.ipa);en.autocapitalize='none';en.spellcheck=false;type.onchange=()=>{e.category=type.value;e.kind=type.value==='sentence'?'sentence':'word';render(true);};en.oninput=()=>{e.text=en.value;};zh.oninput=()=>{e.meaning=zh.value;};ipa.oninput=()=>{e.ipa=ipa.value;};button(row,'删除此条',()=>{entries.splice(i,1);render(true);});rows.append(row);});if(!shown)note(rows,'这一类还没有内容。');if(preserveScroll)requestAnimationFrame(()=>body.scrollTop=Math.min(scrollTop,Math.max(0,body.scrollHeight-body.clientHeight)));}
      render();
      const actions=document.createElement('div');actions.className='library-review-actions';page.append(actions);
      const cancel=button(actions,ocrTask?'稍后确认（保留任务）':'取消录入',()=>{if(ocrTask){d.close();return;}if(cancel.dataset.confirm!=='yes'){cancel.dataset.confirm='yes';cancel.textContent='再次点击确认取消';error.textContent='取消后本次 AI 整理结果不会保存。';return;}d.close();});
      let locallySaved=false;const confirm=button(actions,'确认保存',async()=>{confirm.disabled=true;try{const checked=entries.map((e,i)=>{try{return {...C.entry(e,e.kind),kind:e.kind};}catch(problem){throw Error('第'+(i+1)+'条：'+problem.message);}});if(!locallySaved){repo.saveClassified({id:group?.id,name:name.value,entries:checked});locallySaved=true;}if(ocrTask)await GuluOCRTasks.remove(ocrTask.id);onSave();refresh();d.close();}catch(problem){error.textContent=(locallySaved?'词库已保存，任务提示清理失败：':'')+problem.message;confirm.disabled=false;}});
      rows.querySelector('input')?.focus({preventScroll:true});
    }
    let reviewing=false,reviewError=null;const poll=setInterval(()=>{if(ocrTask&&!ocrTask.result&&!reviewing&&!submit.disabled&&!document.hidden)submit.click();},4000);d.addEventListener('close',()=>clearInterval(poll));if(ocrTask){raw.disabled=true;chooseImages.disabled=true;submit.textContent='继续补全并确认';queueMicrotask(()=>submit.click());}
    d.addEventListener('cancel',event=>{if(!reviewing)return;event.preventDefault();if(reviewError)reviewError.textContent='请在页面底部选择“确认保存”或“取消录入”。';});
    d.addEventListener('close',()=>{revision++;if(imageURL)URL.revokeObjectURL(imageURL);});
  }
  window.GuluLibraryUI={refresh,selected(){if(select.value==='__saved')return savedSnapshot;if(!select.value)return null;const group=groups().find(g=>g.id===select.value);if(!group)throw Error('分组已删除，请重新选择题库');const selected=$('#difficulty').value==='speaking'?speechReadyGroup(group):group;if(!selected.entries.length)throw Error('这个词库的句子含有特殊符号，已在口语模式中跳过，请选择其他词库。');return selected;},restoreSelection(group){savedSnapshot=group;refresh();select.value=group?(Array.from(select.options).some(o=>o.value===group.id)?group.id:'__saved'):'';},addSentence(text,meaning){editor(null,()=>{}, {kind:'sentence',text:text.replaceAll(' / ',' ')+' | '+meaning});},open:openLibrary};
  refresh();
})();
