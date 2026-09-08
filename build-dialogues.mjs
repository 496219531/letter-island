import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const stages=[
 {name:'小学基础',reference:'小学英语基础表达参考',goals:'问候、介绍、请求、描述身边事物',source:'compulsory-2022'},
 {name:'小学应用',reference:'小学英语情境应用参考',goals:'生活安排、校园沟通、简单经历和建议',source:'compulsory-2022'},
 {name:'初中生活',reference:'上海五四学制初中生活主题参考',goals:'出行办事、描述经历、说明原因、澄清信息',source:'compulsory-2022'},
 {name:'初中协作',reference:'上海五四学制初中综合交流参考',goals:'合作分工、协商、反馈、调查与文化交流',source:'compulsory-2022'},
 {name:'高中交流',reference:'高中课标交流与思维要求参考',goals:'表达观点、分析证据、说明局限、比较和评价',source:'senior-2025'}
];
const sources=[
 {id:'compulsory-2022',title:'上海市教委公布的义务教育英语课程标准（2022年版）',url:'https://edu.sh.gov.cn/mbjy_fgwx_qt/20220720/02b90de93ebd49099e43063f7a6e2630.html',scope:'主题、语言知识、语言技能与交际要求'},
 {id:'senior-2025',title:'普通高中英语课程标准（2017年版2025年修订）',url:'https://dfl.aku.edu.cn/info/1565/10089.htm',scope:'主题语境、理解与表达、观点和推理'},
 {id:'shanghai-54',title:'上海市英语教育教学研究基地：五四制英语教材说明',url:'https://screle.shisu.edu.cn/ea/de/c16360a191198/page.htm',scope:'上海初中六至九年级与国家标准的衔接'}
];
const tiers=stages.map(()=>[]),seen=new Set();let level=-1;
const source=await readFile(new URL('./data/dialogues.tsv',import.meta.url),'utf8');
for(const row of source.split(/\r?\n/)){
 if(!row.trim())continue;if(row.startsWith('#')){level=Number(row.slice(1));assert.ok(level>=0&&level<5);continue;}
 const columns=row.split('|');assert.equal(columns.length,6,row);const [scene,goal,grammar,...pairs]=columns;
 const lines=pairs.map(pair=>{
  const [phrase,meaning,...extra]=pair.split('~');assert.equal(extra.length,0);assert.ok(meaning&&/[\u4e00-\u9fff]/.test(meaning));assert.match(phrase,/^[A-Za-z ]+$/);
  const word=phrase.toUpperCase().trim().replace(/\s+/g,' ');assert.ok(!seen.has(word),'Repeated line: '+phrase);seen.add(word);
  const question=/^(Who|What|Where|When|Why|How|Which|Whose|Is|Are|Am|Was|Were|Do|Does|Did|Can|Could|May|Would|Will|Should|Have|Has)\b/.test(phrase);
  return {text:phrase+(question?'?':'.'),meaning,word};
 });
 assert.ok(lines.map(l=>l.word).join(' ').length<=300,scene);
 tiers[level].push({id:`dialogue-${level}-${String(tiers[level].length+1).padStart(3,'0')}`,scene,goal,grammar,reference:stages[level].reference,source:stages[level].source,speakers:['A','B','A'],lines});
}
for(let i=0;i<5;i++){assert.equal(tiers[i].length,60);assert.ok(new Set(tiers[i].map(r=>r.lines[0].word[0])).size>=6);Object.assign(stages[i],{level:i,groups:tiers[i].length,sentences:tiers[i].length*3});}
const payload={version:2,authorship:'原创完整情境对话；学段和语法标签为编写参考，不是官方逐句审定或教材原句',stages,sources,tiers,groupCount:tiers.flat().length,uniqueSentences:seen.size};
const text=`/* Generated from data/dialogues.tsv by build-dialogues.mjs. */\n(function(root){\n'use strict';\nconst bank=${JSON.stringify(payload,null,2)};\nroot.GuluDialogues=bank;\nif(typeof module!=='undefined'&&module.exports)module.exports=bank;\n})(typeof globalThis!=='undefined'?globalThis:this);\n`;
await writeFile(new URL('./dialogues.js',import.meta.url),text);
console.log(`Built ${payload.groupCount} dialogues / ${payload.uniqueSentences} unique sentences`);
