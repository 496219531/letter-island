(function(root){
  const KEY='gulu-speech-review-v1';
  const words=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9' ]/g,' ').trim().split(/\s+/).filter(Boolean);
  function compare(expected,heard){
    const a=words(expected),b=words(heard),d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
    for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
    for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    const result=[];let i=a.length,j=b.length;
    while(i||j){if(i&&j&&d[i][j]===d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)){result.push({type:a[i-1]===b[j-1]?'same':'changed',expected:a[--i],heard:b[--j]});}else if(i&&d[i][j]===d[i-1][j]+1)result.push({type:'missing',expected:a[--i],heard:''});else result.push({type:'extra',expected:'',heard:b[--j]});}
    return result.reverse();
  }
  function repository(storage){
    function list(){const raw=storage.getItem(KEY);if(!raw)return [];const data=JSON.parse(raw);if(!Array.isArray(data))throw new Error('复盘记录格式异常，未覆盖原记录。');return data;}
    return {list,add(record){const records=list();if(records.length>=100)throw new Error('已保存100条，请先删除不需要的复盘记录。');storage.setItem(KEY,JSON.stringify([record,...records]));},remove(id){storage.setItem(KEY,JSON.stringify(list().filter(r=>r.id!==id)));}};
  }
  root.GuluSpeechReview={compare,repository};if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluSpeechReview;
})(typeof globalThis!=='undefined'?globalThis:this);
