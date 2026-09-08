(function(root){
  function practiceCopy(mode,{correct=0,casts=0,mobile=false}={}){
    const labels={letters:'字母',english:'单词',sentences:'句子',speaking:'口语'};
    const label=labels[mode]||labels.letters;
    const summary=mode==='speaking'?`本局通过英语朗读释放了 ${casts} 次大招。下次继续练习完整表达。`:mode==='sentences'?`本局通过句子输入释放了 ${casts} 次大招。下次继续练习情境对话。`:mode==='english'?`本局通过单词练习释放了 ${casts} 次大招。下次继续积累词汇。`:`本局正确输入了 ${correct} 个字母。下次继续练习按键顺序。`;
    const action=mode==='speaking'?(mobile?'朗读当前显示的句子，按住麦克风说，松开后识别。':'选择一张技能卡，按住麦克风朗读，松开后识别。'):mode==='sentences'?'按提示输入完整句子，记得输入空格。':mode==='english'?'按提示输入单词，完成规定遍数后释放大招。':'按技能提示依次输入字母，完成后释放大招。';
    return {summary,action,again:`再练一局${label} →`,wave:`下一波继续${mode==='speaking'?'朗读英语对话':mode==='sentences'?'输入情境句子':mode==='english'?'练习英语单词':'练习字母组合'}。`};
  }
  root.GuluModeCopy={practiceCopy};if(typeof module!=='undefined'&&module.exports)module.exports=root.GuluModeCopy;
})(typeof globalThis!=='undefined'?globalThis:this);
