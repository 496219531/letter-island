const {test}=require('node:test'),assert=require('node:assert/strict');
const {practiceCopy}=require('../mode-copy.js');
test('ending copy distinguishes input from speech without inventing word counts',()=>{
 for(const mode of ['letters','english','sentences','speaking']){
  const copy=practiceCopy(mode,{correct:123,casts:4});
  assert.match(copy.summary,mode==='letters'?/123 个字母/:/4 次大招/);
  if(mode!=='letters')assert.doesNotMatch(copy.summary,/123|掌握|发音|敲对/);
  assert.ok(copy.again.includes({letters:'字母',english:'单词',sentences:'句子',speaking:'口语'}[mode]));
 }
 assert.doesNotMatch(practiceCopy('speaking',{mobile:true}).action,/选择|输入|字母/);
 assert.match(practiceCopy('speaking').action,/选择/);
 assert.match(practiceCopy('sentences').action,/空格/);
 assert.match(practiceCopy('english').action,/遍数/);
});
