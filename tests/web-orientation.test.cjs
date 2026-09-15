const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(width=390,height=844,preferred=null,phone=true){
  const values=new Map(preferred?[['gulu-web-screen-direction',preferred]]:[]),css=new Map();
  const body={dataset:{},style:{setProperty:(k,v)=>css.set(k,v)}};
  const context={innerWidth:width,innerHeight:height,GuluMobile:{active:phone},isSecureContext:false,
    localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},
    document:{body,querySelector:()=>null,addEventListener(){}},
    addEventListener(){},dispatchEvent(){},Event:class{},
    screen:{orientation:{lock(){throw Error('Browser orientation API must not be used');}}}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../web-runtime.js'),'utf8'),context);
  context.GuluWebOrientation.setSettingsPortrait(false);
  return {api:context.GuluWebOrientation,body,css,values};
}
test('a locked portrait browser defaults to a real landscape game surface',async()=>{
  const s=setup();assert.equal(await s.api.getScreenDirection(),'landscape');
  assert.equal(s.body.dataset.webRotation,'90');assert.equal(s.css.get('--web-width'),'844px');assert.equal(s.css.get('--web-height'),'390px');
  await s.api.setScreenDirection('portrait');assert.equal(s.body.dataset.webRotation,'0');
  assert.equal(s.values.get('gulu-web-screen-direction'),'portrait');assert.equal(s.css.get('--web-height'),'844px');
  await s.api.setScreenDirection('landscape');assert.equal(s.body.dataset.webRotation,'90');
});
test('physical landscape does not double-rotate; explicit portrait is remembered',async()=>{
  assert.equal(setup(844,390).body.dataset.webRotation,'0');
  const s=setup(844,390,'portrait');assert.equal(await s.api.getScreenDirection(),'portrait');
  assert.equal(s.body.dataset.webRotation,'-90');assert.equal(s.css.get('--web-width'),'390px');
  assert.equal(setup(390,844,'portrait').body.dataset.webRotation,'0');
});
test('aim mapping follows both rotation directions and unrotated desktop',()=>{
  const element={getBoundingClientRect:()=>({left:10,top:20,right:210,bottom:420,width:200,height:400})};
  let p=setup().api.point({clientX:140,clientY:180},element);assert.equal(p.x,.4);assert.equal(p.y,.35);
  p=setup(844,390,'portrait').api.point({clientX:140,clientY:180},element);assert.equal(p.x,.6);assert.equal(p.y,.65);
  const desktop=setup(1280,800,null,false);p=desktop.api.point({clientX:140,clientY:180},element);
  assert.equal(p.x,.65);assert.equal(p.y,.4);assert.equal(desktop.css.size,0);
});
test('settings temporarily force portrait without overwriting the game direction',async()=>{
 const s=setup(390,844,'landscape');await s.api.setSettingsPortrait(true);
 assert.equal(s.body.dataset.webDirection,'portrait');assert.equal(s.body.dataset.webRotation,'0');assert.equal(s.api.landscape.matches,false);assert.equal(await s.api.getScreenDirection(),'landscape');assert.equal(s.values.get('gulu-web-screen-direction'),'landscape');
 await s.api.setSettingsPortrait(false);assert.equal(s.body.dataset.webDirection,'landscape');assert.equal(s.body.dataset.webRotation,'90');
});
test('direction preference edits during settings apply only after closing settings',async()=>{
 const s=setup(390,844,'portrait');await s.api.setSettingsPortrait(true);await s.api.setScreenDirection('landscape');assert.equal(s.body.dataset.webDirection,'portrait');await s.api.setSettingsPortrait(false);assert.equal(s.body.dataset.webDirection,'landscape');
});
