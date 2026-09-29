(function(root){
 const DB='gulu-ocr-tasks-v1';let opening;
 function open(){return opening||=(new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('tasks',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>{opening=null;reject(Error('无法保存OCR任务，请检查本机存储空间'));};}));}
 async function transaction(mode,operation){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('tasks',mode),request=operation(tx.objectStore('tasks'));tx.oncomplete=()=>{if(mode==='readwrite')root.dispatchEvent(new Event('gulu-ocr-tasks'));resolve(request?.result);};tx.onerror=tx.onabort=()=>reject(Error('OCR任务保存失败，请检查本机存储空间'));});}
 const list=()=>transaction('readonly',s=>s.getAll()),get=id=>transaction('readonly',s=>s.get(id)),put=task=>transaction('readwrite',s=>s.put(task)),remove=id=>transaction('readwrite',s=>s.delete(id));
 const active=new Map();
 async function acknowledge(task,request){try{await request('library/ocr/ack',{id:task.id,receipt:task.receipt});}catch(error){if(error.status!==404)throw error;}}
 async function resume(task,request,onProgress=()=>{}){
  if(active.has(task.id))return active.get(task.id);
  const work=(async()=>{
   const persisted=await get(task.id);if(persisted)task=persisted;else await put(task);
   if(task.result){if(!task.acknowledged){await acknowledge(task,request);task.acknowledged=true;await put(task);}return task;}
   let state;
   if(task.images?.length){
    state=await request('library/ocr/create',{id:task.id,name:task.name,total:task.images.length,text:task.text||''});
    if(state.status==='uploading'){
     for(let position=0;position<task.images.length;position++){onProgress({...state,uploaded:position});state=await request('library/ocr/upload',{id:task.id,position,image:task.images[position]});onProgress(state);}
     state=await request('library/ocr/submit',{id:task.id});
    }
    task={...task,images:null,text:'',status:state.status};await put(task);
   }else{
    const response=await request('library/ocr/list',{});state=response.jobs.find(j=>j.id===task.id);if(!state)throw Error('服务器任务已领取或过期，请检查本机已保存的结果');
   }
   onProgress(state);
   if(state.status==='completed'){
    const result=await request('library/ocr/result',{id:task.id});task={...task,result:result.result,receipt:result.receipt,status:'ready'};
    // ACK only after IndexedDB commits: disconnect/retry cannot consume an unpersisted result.
    await put(task);await acknowledge(task,request);task.acknowledged=true;await put(task);
   }else{task.status=state.status;task.completed=state.completed;task.total=state.total;task.error=state.error;await put(task);}
   return task;
  })();active.set(task.id,work);try{return await work;}finally{active.delete(task.id);}
 }
 root.GuluOCRTasks={list,get,put,remove,resume,isActive:id=>active.has(id)};
})(globalThis);
