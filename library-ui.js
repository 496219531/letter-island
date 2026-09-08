(function(){
  const C=GuluCustomLibrary,repo=C.repository(localStorage),$=s=>document.querySelector(s);
  const source=document.createElement('label');source.className='custom-source';source.textContent='练习题库';
  const select=document.createElement('select');select.id='customGroup';select.setAttribute('aria-label','练习题库');select.onchange=()=>updateTypingControls();source.append(select);
  const manage=document.createElement('button');manage.type='button';manage.textContent='我的词句库 · 添加 / 编辑';manage.onclick=()=>openLibrary();source.append(manage);$('#startButton').before(source);
  const settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.textContent='我的词句库 · 添加 / 编辑';settingsButton.onclick=()=>openLibrary();$('.difficulty-controls').append(settingsButton);
  let savedSnapshot=null;
  function groups(){return repo.list();}
  function refresh(){
    const mode=$('#difficulty').value,kind=mode==='english'?'word':'sentence',value=select.value;source.hidden=!['english','sentences','speaking'].includes(mode);
    select.replaceChildren(new Option('系统标准词句库',''));
    try{for(const group of groups().filter(g=>g.kind===kind))select.add(new Option(group.name+' · '+group.entries.length+'条',group.id));}catch(e){toast(e.message);}
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
  function input(parent,label,value='',tag='input'){const l=document.createElement('label');l.textContent=label;const el=document.createElement(tag);if(tag==='input')el.type='text';el.value=value;l.append(el);parent.append(l);return el;}
  function openLibrary(){
    const {d,body}=modal('我的词句库');
    note(body,'单词组用于单词练习，句子组用于句子和口语。保存后可在主页“练习题库”直接选中。每组最多300条，最多30组。');
    button(body,'＋ 新建分组',()=>editor(null,render));
    const list=document.createElement('div');body.append(list);
    function render(){list.replaceChildren();let rows;try{rows=groups();}catch(e){note(list,e.message);return;}
      if(!rows.length)note(list,'还没有自定义分组，可以先粘贴老师发来的词句。');
      for(const group of rows){const row=document.createElement('section');row.className='library-group';const h=document.createElement('h3');h.textContent=group.name;row.append(h);note(row,(group.kind==='word'?'单词组':'句子组')+' · '+group.entries.length+'条');
        button(row,'编辑',()=>editor(group,render));
        button(row,'选用此组',()=>{if(game.status!=='ready'){returnHome();if(game.status!=='ready')return;}if(group.kind==='word')$('#difficulty').value='english';else if(!['sentences','speaking'].includes($('#difficulty').value))$('#difficulty').value='sentences';refresh();select.value=group.id;updateTypingControls();d.close();});
        const del=button(row,'删除分组',()=>{if(del.dataset.confirm!=='yes'){del.dataset.confirm='yes';del.textContent='再次点击确认删除';return;}try{repo.remove(group.id);render();refresh();}catch(e){note(row,e.message);}});list.append(row);
      }
    }render();
    button(body,'导出全部分组',()=>{
      const json=JSON.stringify({version:1,groups:groups()},null,2);
      if(window.GuluNative?.exportLibrary){GuluNative.exportLibrary(json).catch(e=>toast(e.message));return;}
      const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='我的词句库.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    const file=input(body,'从分组文件导入','','input');file.type='file';file.accept='.json,application/json';file.onchange=async()=>{try{if(file.files[0].size>2000000)throw Error('文件过大');const data=JSON.parse(await file.files[0].text());const items=data.groups;if(!Array.isArray(items)||items.some(g=>!C.validate(g)))throw Error('不是有效的词句库文件');const current=groups();if(current.length+items.length>30)throw Error('导入后超过30组');repo.importGroups(items);render();refresh();}catch(e){note(body,'导入失败：'+e.message);}};
  }
  function editor(group=null,onSave=()=>{},seed=null){
    const {d,body}=modal(group?'编辑分组':'新建分组');const name=input(body,'分组名称',group?.name||'');name.maxLength=50;
    const kind=input(body,'分组类型','','select');kind.add(new Option('单词组','word'));kind.add(new Option('句子组（也用于口语）','sentence'));kind.value=group?.kind||seed?.kind||'word';if(group)kind.disabled=true;
    const raw=input(body,'输入或粘贴内容（一行一条）',group?group.entries.map(e=>[e.text,e.meaning,e.ipa].join(' | ')).join('\n'):seed?.text||'','textarea');raw.rows=7;raw.placeholder='apple | 苹果\nbanana\n或一行一句英文';raw.autocapitalize='none';raw.spellcheck=false;
    note(body,'格式：英文 | 中文 | 音标。中文、音标可留空。可直接在文本框修改、换行拆分或合并，之后预览。本地词库仅补空缺，不覆盖已填写内容。');
    const imageInput=input(body,'从图片导入（Qwen整理后回填文本框）','','input');imageInput.type='file';imageInput.accept='image/*';
    const previewImage=document.createElement('img');previewImage.className='library-image';previewImage.hidden=true;body.append(previewImage);let imageURL=null,imageData=null;
    const status=note(body,'图片只在你点“用Qwen整理图片”后发送到 Qwen，需要联网与API额度；整理结果必须人工确认。');
    imageInput.onchange=async()=>{const f=imageInput.files[0];if(!f)return;if(f.size>8*1024*1024){status.textContent='图片过大，请选8MB以内的图片。';return;}if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(f);previewImage.src=imageURL;previewImage.hidden=false;imageData=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});status.textContent='图片已选择。点击下方按钮由Qwen整理，完成后仍可人工修改。';};
    const analyze=button(body,'用Qwen整理图片',async()=>{
      if(!imageData){status.textContent='请先选择图片。';return;}const selectedImage=imageData;analyze.disabled=true;status.textContent='Qwen正在结合原图整理分栏、词句与释义…';
      try{let result;if(window.GuluNative?.importImage)result=await GuluNative.importImage(imageData,kind.value);else{const r=await fetch('/api/library/import-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:imageData,kind:kind.value})});const json=await r.json();if(!r.ok)throw Error(json.error||'整理失败');result=json;}
        if(!d.isConnected)return;if(imageData!==selectedImage){status.textContent='图片已更换，旧图片的结果未填入，请重新整理。';return;}if(!Array.isArray(result.entries))throw Error('Qwen没有返回可编辑的条目，请重试');
        const lines=result.entries.map(e=>[String(e.text||'').replace(/\n/g,' '),String(e.meaning||'').replace(/\n/g,' '),String(e.ipa||'')].join(' | '));raw.value+=(raw.value.trim()?'\n':'')+lines.join('\n');edits=[];rows.replaceChildren();
        status.textContent='已回填'+lines.length+'条，请对照原图校正。'+(result.notes||[]).join('；')+' '+result.entries.filter(e=>e.uncertain).map(e=>'待确认：'+e.text).join('；');
      }catch(e){status.textContent=e.message;}finally{analyze.disabled=false;}
    });
    if(window.GuluNative?.configureQwen)button(body,'设置Qwen API密钥',()=>GuluNative.configureQwen().then(()=>status.textContent='Qwen密钥已保存到本机钥匙串。').catch(e=>status.textContent=e.message));
    const rows=document.createElement('div');rows.className='library-preview';let edits=[];
    button(body,'预览并用标准词库补全',()=>{try{edits=C.enrich(C.parse(raw.value,kind.value),kind.value,GuluVocabulary);renderRows();status.textContent='共'+edits.length+'条。请检查英文、中文与音标，空白项可以稍后补；重复英文保存时合并，保留第一条。';}catch(e){status.textContent=e.message;}});body.append(rows);
    function renderRows(){rows.replaceChildren();edits.forEach((e,i)=>{const row=document.createElement('section');row.className='library-entry';const en=input(row,'英文',e.text),zh=input(row,'中文',e.meaning),ipa=input(row,'音标（可空）',e.ipa);const origin=note(row,e.source==='local'?'已从标准词库补齐空缺':'人工 / 图片导入内容，待核对');
      en.oninput=()=>{e.text=en.value;origin.textContent='英文已修改，请同时核对中文与音标。';};zh.oninput=()=>{e.meaning=zh.value;e.source='manual';};ipa.oninput=()=>{e.ipa=ipa.value;e.source='manual';};button(row,'删除此条',()=>{edits.splice(i,1);renderRows();});rows.append(row);});}
    if(window.GuluNative?.translateTexts)button(body,'用苹果翻译补缺失中文',async()=>{const missing=edits.filter(e=>!e.meaning.trim());if(!missing.length){status.textContent='请先预览，已有中文不会被覆盖。';return;}status.textContent='正在调用苹果系统翻译…';try{const requested=missing.map(e=>e.text);const translated=await GuluNative.translateTexts(requested);if(!d.isConnected)return;missing.forEach((e,i)=>{if(e.text===requested[i]&&!e.meaning.trim()&&translated[i]){e.meaning=translated[i];e.source='translation';}});renderRows();status.textContent='已补翻译，请人工核对多义词和上下文。音标仍优先采用本地词库。';}catch(e){status.textContent=e.message;}});
    button(body,'确认保存分组',()=>{try{if(!edits.length)throw Error('请先预览内容，再确认保存。');repo.save({id:group?.id,name:name.value,kind:kind.value,entries:edits});onSave();refresh();d.close();}catch(e){status.textContent=e.message;}});
    // Changes to raw input invalidate the preview so old entries cannot be saved accidentally.
    raw.oninput=()=>{edits=[];rows.replaceChildren();};kind.onchange=raw.oninput;
    d.addEventListener('close',()=>{if(imageURL)URL.revokeObjectURL(imageURL);});
  }
  window.GuluLibraryUI={refresh,selected(){if(select.value==='__saved')return savedSnapshot;if(!select.value)return null;const group=groups().find(g=>g.id===select.value);if(!group)throw Error('分组已删除，请重新选择题库');return group;},restoreSelection(group){savedSnapshot=group;refresh();select.value=group?(Array.from(select.options).some(o=>o.value===group.id)?group.id:'__saved'):'';},addSentence(text,meaning){editor(null,()=>{}, {kind:'sentence',text:text.replaceAll(' / ',' ')+' | '+meaning});},open:openLibrary};
  refresh();
})();
