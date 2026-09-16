(function(){
  const C=GuluCustomLibrary,repo=C.repository(localStorage),$=s=>document.querySelector(s);
  const source=document.createElement('label');source.className='custom-source';source.textContent='练习题库';
  const select=document.createElement('select');select.id='customGroup';select.setAttribute('aria-label','练习题库');select.onchange=()=>updateTypingControls();source.append(select);
  const manage=document.createElement('button');manage.type='button';manage.textContent='我的词句库 · 添加 / 编辑';manage.onclick=()=>openLibrary();source.append(manage);$('#startButton').before(source);
  let savedSnapshot=null;
  function groups(){return repo.list();}
  const familyKey=group=>group.familyId||group.id;
  const familyName=group=>group.name.replace(/ · (单词词组|句子)$/,'');
  const hasSpeechSpecial=entry=>/(?:\.{3}|…|[\\/|「」『』《》〈〉])/u.test(String(entry?.text||''));
  const speechReadyGroup=group=>({...group,entries:group.entries.filter(entry=>!hasSpeechSpecial(entry))});
  function families(rows=groups()){const map=new Map();for(const group of rows){const key=familyKey(group),family=map.get(key)||{key,name:familyName(group),groups:[]};family.groups.push(group);map.set(key,family);}return [...map.values()];}
  function refresh(){
    const mode=$('#difficulty').value,kind=mode==='english'?'word':'sentence',value=select.value;source.hidden=!['english','sentences','speaking'].includes(mode);
    select.replaceChildren(new Option('系统标准词句库',''));
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
    d.addEventListener('close',()=>{window.visualViewport?.removeEventListener('resize',viewport);d.remove();refresh();if(resume&&game.status==='paused')game.resume();updateHud(true);});d.showModal();return {d,body};
  }
  function button(parent,label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b;}
  function note(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);return p;}
  function info(parent,text){const details=document.createElement('details');details.className='library-info';const summary=document.createElement('summary');summary.textContent='ⓘ';summary.setAttribute('aria-label','查看说明');details.append(summary);note(details,text);parent.append(details);return details;}
  function input(parent,label,value='',tag='input'){const l=document.createElement('label');l.textContent=label;const el=document.createElement(tag);if(tag==='input')el.type='text';el.value=value;l.append(el);parent.append(l);return el;}
  async function libraryRequest(path,data){
    if(window.GuluNative?.communityRequest){const {status,result}=await GuluNative.communityRequest(path,data);if(status>=400)throw Error(result.error||'临时分享服务暂时不可用。');return result;}
    const response=await fetch('api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)}),result=await response.json();if(!response.ok)throw Error(result.error||'临时分享服务暂时不可用。');return result;
  }
  function shareFamily(family){
    const {body}=modal('发送本地词句');info(body,'会把当前词库中已确认的英文、中文和音标上传到临时中转，接收方领取后保存到自己的本机。图片不会上传，不会重新图片识别，也不会调用 AI。发送码在24小时内可重复领取，不会成为长期云端词库。');
    const code=input(body,'临时发送码');code.readOnly=true;code.placeholder='生成后复制发送';const status=note(body,'');status.setAttribute('role','status');
    const create=button(body,'上传并生成发送码',async()=>{create.disabled=true;try{const result=await libraryRequest('library/share',{payload:JSON.stringify({version:1,groups:family.groups})});code.value=result.code;status.textContent='本地词句已暂存，有效期至 '+new Date(result.expiresAt).toLocaleString()+'；期间可重复领取。';}catch(error){status.textContent=error.message;}finally{create.disabled=false;}});
    button(body,'复制发送码',async()=>{if(!code.value){status.textContent='请先上传并生成发送码。';return;}try{await navigator.clipboard.writeText(code.value);status.textContent='已复制，可以发送给对方。';}catch{code.focus();code.select();status.textContent='请长按或复制选中的发送码后发送。';}});
  }
  function openLibrary(){
    const {d,body}=modal('我的词句库');
    info(body,'每个词库统一维护单词、词组和句子；开始练习时会按当前练习方式自动筛选。保存后可在主页“练习题库”直接选中。每个分类最多2000条，最多100个分类。');
    const add=button(body,'＋ 录入词句／图片',()=>editor(null,render));add.className='library-add';
    const pipelineLabel=document.createElement('label');pipelineLabel.className='library-pipeline';pipelineLabel.textContent='整理方式';const pipeline=document.createElement('select');pipeline.id='libraryPipeline';pipeline.add(new Option('分步补全（推荐：Qwen→词库→苹果翻译）','staged'));pipeline.add(new Option('一步到位（实验阶段）','one-shot'));try{pipeline.value=localStorage.getItem('gulu-library-pipeline')==='one-shot'?'one-shot':'staged';}catch{}pipeline.onchange=()=>{try{localStorage.setItem('gulu-library-pipeline',pipeline.value);}catch{}};pipelineLabel.append(pipeline);body.append(pipelineLabel);info(body,'分步补全会由 Qwen 先整理分类，再用标准词库和苹果翻译补空缺；一步到位仍在实验阶段，结果可能不完整。两种方式都会进入人工确认。智能整理由小院统一提供，无需填写 API Key；使用前请先加入小院账号。每个账号每天可整理20次。');
    const list=document.createElement('div');body.append(list);
    function render(){list.replaceChildren();let rows;try{rows=groups();}catch(e){note(list,e.message);return;}
      if(!rows.length)note(list,'还没有自定义分组，可以先粘贴老师发来的词句。');
      for(const family of families(rows)){const row=document.createElement('section');row.className='library-group';const h=document.createElement('h3');h.textContent=family.name;row.append(h);const words=family.groups.find(group=>group.kind==='word')?.entries.length||0,sentences=family.groups.find(group=>group.kind==='sentence')?.entries.length||0;note(row,'单词／词组 '+words+' 条 · 句子／口语 '+sentences+' 条');
        const actions=document.createElement('div');actions.className='library-group-actions';row.append(actions);button(actions,'查看词句',()=>viewFamily(family.key,render));const more=document.createElement('details');more.className='library-more';const summary=document.createElement('summary');summary.textContent='•••';summary.setAttribute('aria-label','更多词库操作');more.append(summary);button(more,'发送给他人',()=>shareFamily(family));const del=button(more,'删除词库',()=>{if(del.dataset.confirm!=='yes'){del.dataset.confirm='yes';del.textContent='再次点击确认删除';return;}try{for(const group of family.groups)repo.remove(group.id);render();refresh();}catch(e){note(row,e.message);}});actions.append(more);list.append(row);
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
    const help=body.querySelector('.library-info');if(help)d.querySelector('header').insertBefore(help,d.querySelector('header button'));
    const pipelineHelp=pipelineLabel.nextElementSibling;if(pipelineHelp?.classList.contains('library-info'))pipelineLabel.append(pipelineHelp);

  }
  function viewFamily(id,onSave){
    const {d,body}=modal('查看词句');
    let entryType='all',searchText='';
    function render(preserveScroll=false){
      const scrollTop=preserveScroll?body.scrollTop:0;
      const related=groups().filter(group=>familyKey(group)===id);if(!related.length){d.close();return;}const title=familyName(related[0]);
      body.replaceChildren();d.querySelector('h2').textContent=title;
      const words=related.find(group=>group.kind==='word')?.entries.length||0,sentences=related.find(group=>group.kind==='sentence')?.entries.length||0;note(body,'单词／词组 '+words+' 条 · 句子／口语 '+sentences+' 条');
      button(body,'修改词库名称',()=>{const box=document.createElement('section');body.prepend(box);const field=input(box,'词库名称',title);button(box,'保存名称',()=>{try{const current=groups().filter(group=>familyKey(group)===id);for(const group of current)repo.save({...group,name:current.length>1?field.value+' · '+(group.kind==='word'?'单词词组':'句子'):field.value});render();onSave();}catch(error){note(box,error.message);}});button(box,'取消',()=>box.remove());});
      button(body,'＋ 录入新词句 / 图片',()=>editor(related[0],()=>{render();onSave();}));
      const tabs=document.createElement('nav');tabs.className='library-tabs';tabs.setAttribute('aria-label','筛选词句类型');
      for(const [kind,label] of [['all','全部'],['word','单词／词组'],['sentence','句子／口语']]){const tab=button(tabs,label,()=>{entryType=kind;render(true);});tab.classList.toggle('active',entryType===kind);tab.setAttribute('aria-pressed',String(entryType===kind));}body.append(tabs);
      const filter=input(body,'搜索英文或中文',searchText),list=document.createElement('div');body.append(list);
      function rows(){list.replaceChildren();const query=filter.value.trim().toLowerCase(),items=related.flatMap(group=>group.entries.map(entry=>({group,entry}))).filter(({group,entry})=>(entryType==='all'||group.kind===entryType)&&(entry.text+' '+entry.meaning).toLowerCase().includes(query));for(const {group,entry:e} of items){
        const row=document.createElement('section');row.className='library-entry';const entryTitle=document.createElement('strong');entryTitle.textContent=e.text;row.append(entryTitle);note(row,group.kind==='word'?'单词／词组':'句子／口语');if(e.meaning)note(row,e.meaning);if(e.ipa)note(row,'/'+e.ipa+'/');
        button(row,'修改此条',()=>{row.replaceChildren();const type=input(row,'练习类型','','select');type.add(new Option('单词／词组','word'));type.add(new Option('句子／口语','sentence'));type.value=group.kind;const en=input(row,'英文',e.text),zh=input(row,'中文（可空）',e.meaning),ipa=input(row,'音标（可空）',e.ipa),status=note(row,'空白保留已有值；改变类型会移动到同一词库的对应分类。');button(row,'保存修改',()=>{try{repo.moveEntry({sourceId:group.id,sourceWord:e.word,input:{text:en.value,meaning:zh.value,ipa:ipa.value},kind:type.value});render(true);onSave();}catch(error){status.textContent=error.message;}});button(row,'取消',rows);});
        const remove=button(row,'删除此条',()=>{if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='再次点击确认删除';return;}try{const latest=groups().find(item=>item.id===group.id),entries=latest.entries.filter(old=>old.word!==e.word);if(entries.length)repo.save({...latest,entries});else repo.remove(group.id);render(true);onSave();}catch(error){note(row,error.message);}});list.append(row);
      }}filter.oninput=()=>{searchText=filter.value;rows();};rows();
      if(preserveScroll)requestAnimationFrame(()=>body.scrollTop=Math.min(scrollTop,Math.max(0,body.scrollHeight-body.clientHeight)));
    }render();
  }
  function editor(group=null,onSave=()=>{},seed=null){
    const {d,body}=modal('录入词句'),form=document.createElement('div');body.append(form);
    const name=input(form,'分组名称',group?.name||'');name.maxLength=50;
    info(form,'AI会自动区分单词、词组和完整句子，无需选择类型。混合内容会自动分开保存，已有词句不会丢失。');
    const raw=input(form,'输入或粘贴内容',seed?.text||'','textarea');raw.rows=7;raw.maxLength=30000;raw.placeholder='直接粘贴词语、句子或老师发来的内容，也可以选择图片';raw.autocapitalize='none';raw.spellcheck=false;
    const imageInput=input(form,'或选择图片（最多4张，AI自动分类）','','input');imageInput.type='file';imageInput.accept='image/*';imageInput.multiple=true;
    const previewImage=document.createElement('img');previewImage.className='library-image';previewImage.hidden=true;form.append(previewImage);
    info(form,'点击保存后：按所选方式由 Qwen 先读取原始中文／音标，再补缺失字段，最后逐条人工确认。文字和所选图片会发送给Qwen；英文为主键；新非空中文、音标分别覆盖旧值，空白保留旧值。');
    const status=note(form,'词组不查找或补全音标。中文或音标缺失不影响练习，不显示或朗读缺失内容。');status.setAttribute('role','status');
    let imageURL=null,imageData=[],imageLoading=false,revision=0;
    const submit=button(form,'保存',async()=>{
      if(imageLoading)return;if(!name.value.trim()){status.textContent='请先填写分组名称。';name.focus();return;}if(!raw.value.trim()&&!imageData.length){status.textContent='请输入内容或选择图片。';return;}
      const token=++revision,active=()=>d.isConnected&&token===revision,pipeline=(()=>{try{return localStorage.getItem('gulu-library-pipeline')==='one-shot'?'one-shot':'staged';}catch{return 'staged';}})(),payload={text:raw.value,images:imageData,kind:'auto',pipeline};
      const controls=[...form.querySelectorAll('input,textarea,select,button')],disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
      try{
        const organize=async data=>{
          if(window.GuluNative?.communityRequest){const {status,result}=await GuluNative.communityRequest('library/organize',data);if(status>=400)throw Error(result.error||'整理失败');return result;}
          const response=await fetch('api/library/organize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(125000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Qwen整理失败');return result;
        };
        const result=await C.prepare({...payload,existingEntries:group?groups().filter(g=>g.id===group.id||g.familyId===(group.familyId||group.id)).flatMap(g=>g.entries.map(e=>({...e,kind:g.kind}))):[],organize,translate:pipeline==='staged'&&window.GuluNative?.translateTexts?texts=>GuluNative.translateTexts(texts,progress=>{if(active())status.textContent='苹果翻译：本批已完成 '+progress.completed+' / '+progress.total+' 条…';}):null,vocabulary:GuluVocabulary,onProgress:text=>{if(active())status.textContent=text;},active});
        if(active())review(result);
      }catch(error){if(active())status.textContent=error.message+' 原始内容已保留，请重试。';}
      finally{if(active())controls.forEach((el,i)=>el.disabled=disabled[i]);}
    });
    imageInput.onchange=async()=>{
      const token=++revision;imageLoading=false;submit.disabled=false;imageData=[];previewImage.hidden=true;if(imageURL){URL.revokeObjectURL(imageURL);imageURL=null;}
      const files=[...imageInput.files];if(!files.length)return;if(files.length>4){status.textContent='一次最多选择4张图片。';imageInput.value='';return;}if(files.some(file=>file.size>8*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>36*1024*1024){status.textContent='图片总大小不能超过36MB，单张不能超过8MB。';imageInput.value='';return;}
      imageLoading=true;submit.disabled=true;
      try{const data=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);})));if(token!==revision||!d.isConnected)return;imageData=data;imageURL=URL.createObjectURL(files[0]);previewImage.src=imageURL;previewImage.hidden=false;status.textContent='已选择 '+files.length+' 张图片，点击保存统一整理。';}
      catch(error){status.textContent=error.message;}finally{if(token===revision){imageLoading=false;submit.disabled=false;}}
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
      const cancel=button(actions,'取消录入',()=>{if(cancel.dataset.confirm!=='yes'){cancel.dataset.confirm='yes';cancel.textContent='再次点击确认取消';error.textContent='取消后本次 AI 整理结果不会保存。';return;}d.close();});
      button(actions,'确认保存',()=>{try{const checked=entries.map((e,i)=>{try{return {...C.entry(e,e.kind),kind:e.kind};}catch(problem){throw Error('第'+(i+1)+'条：'+problem.message);}});repo.saveClassified({id:group?.id,name:name.value,entries:checked});onSave();refresh();d.close();}catch(problem){error.textContent=problem.message;}});
      rows.querySelector('input')?.focus({preventScroll:true});
    }
    let reviewing=false,reviewError=null;
    d.addEventListener('cancel',event=>{if(!reviewing)return;event.preventDefault();if(reviewError)reviewError.textContent='请在页面底部选择“确认保存”或“取消录入”。';});
    d.addEventListener('close',()=>{revision++;if(imageURL)URL.revokeObjectURL(imageURL);});
  }
  window.GuluLibraryUI={refresh,selected(){if(select.value==='__saved')return savedSnapshot;if(!select.value)return null;const group=groups().find(g=>g.id===select.value);if(!group)throw Error('分组已删除，请重新选择题库');const selected=$('#difficulty').value==='speaking'?speechReadyGroup(group):group;if(!selected.entries.length)throw Error('这个词库的句子含有特殊符号，已在口语模式中跳过，请选择其他词库。');return selected;},restoreSelection(group){savedSnapshot=group;refresh();select.value=group?(Array.from(select.options).some(o=>o.value===group.id)?group.id:'__saved'):'';},addSentence(text,meaning){editor(null,()=>{}, {kind:'sentence',text:text.replaceAll(' / ',' ')+' | '+meaning});},open:openLibrary};
  refresh();
})();
