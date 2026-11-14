import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),bundle=process.argv.includes('--bundle'),checks=[],errors=[];let calls=0;
const server=createApp({transitConfig:{apiKey:'synthetic-only',enabled:true,fetchImpl:async()=>{calls++;throw Error('No provider expected')}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:393,height:852}});await context.route('**/*',r=>{const u=new URL(r.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)?r.continue():r.abort()});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+(bundle?'/동행길-최종.html':'/'));await page.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
 assert.equal(await page.locator('.leaflet-top.leaflet-left > .leaflet-control').count(),1);assert.equal(await page.locator('.map-layers-control').count(),1);await page.locator('#origin-query').fill('서울');const before=await page.evaluate(()=>({condition:document.querySelector('#condition').value,nodes:graph.nodes.size,edges:[...graph.nodes.values()].reduce((s,n)=>s+n.edges.length,0),facility:facilityController.getSnapshot()}));
 await page.locator('.map-layers-control > summary').click();await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>tripQuestions.snapshot().collapsed),true);assert(await page.locator('.facility-body').isVisible());checks.push('One top-left control retains original facility controls and folds the companion without losing answers');
 await page.getByRole('tab',{name:'경사',exact:true}).click();
 const toggle = page.getByLabel('급경사 표시', {exact:true});
 assert(await toggle.isVisible());
 assert.equal(await page.evaluate(()=>mapLayers.snapshot().loaded), false);
 if (!bundle) {
  await page.route('**/steep-roads.json.gz', route=>route.fulfill({status:503}));
  await toggle.check();
  const retry = page.getByRole('button',{name:'다시 불러오기',exact:true});
  await retry.waitFor({state:'visible'});
  await page.unroute('**/steep-roads.json.gz');
  await retry.click();
 } else {
  await toggle.check();
 }
 await page.waitForFunction(()=>mapLayers.snapshot().loaded);
 assert.equal(await page.evaluate(()=>mapLayers.snapshot().count), 79682);
 assert.equal(await page.evaluate(()=>mapLayers.snapshot().visible), 0);
 assert.match(await page.locator('.map-slope-status').innerText(), /확대/);
 await page.evaluate(()=>{map.setView([37.595,127.04],16)});
 assert((await page.evaluate(()=>mapLayers.snapshot().visible)) > 0);
 const style = await page.evaluate(()=>{
  let line;
  map.eachLayer(layer=>{if(layer instanceof L.Polyline && layer.options.pane==='slope-review')line=layer});
  return {color:line.options.color, interactive:line.options.interactive, segments:line.getLatLngs().length};
 });
 assert.equal(style.color, '#cd3e3e');
 assert.equal(style.interactive, false);
 assert(style.segments > 0);
 await toggle.uncheck();
 assert.equal(await page.evaluate(()=>mapLayers.snapshot().visible),0);
 await toggle.check();
 assert((await page.evaluate(()=>mapLayers.snapshot().visible)) > 0);
 await page.evaluate(()=>{map.setView([38,126.5],16)});
 assert.equal(await page.evaluate(()=>mapLayers.snapshot().visible),0);
 assert.match(await page.locator('.map-slope-status').innerText(), /없어요/);
 checks.push('Lazy steep-road data shows only noninteractive red lines at street zoom; hide, re-enable, and empty viewport work');
 const after=await page.evaluate(()=>({condition:document.querySelector('#condition').value,nodes:graph.nodes.size,edges:[...graph.nodes.values()].reduce((s,n)=>s+n.edges.length,0),facility:facilityController.getSnapshot()}));assert.deepEqual(after,before);assert.equal(await page.locator('#origin-query').inputValue(),'서울');checks.push('Display changes leave original graph, conditions, origin query and facility state unchanged');
 await page.getByRole('tab',{name:'지도 자료',exact:true}).click();await page.waitForTimeout(150);assert(await page.locator('.precision-control>div').isVisible());assert.equal(await page.locator('.map-layers-control').getAttribute('open'),'');await page.getByRole('tab',{name:'시설',exact:true}).click();await page.waitForTimeout(150);assert(await page.locator('.facility-body').isVisible());await page.getByRole('tab',{name:'경사',exact:true}).click();await page.evaluate(()=>{map.setView([37.595,127.04],16)});
 for(const [label,viewport]of [['mobile',{width:393,height:852}],['desktop',{width:1440,height:1000}],['small',{width:320,height:568}],['landscape',{width:667,height:375}]]){await page.setViewportSize(viewport);await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const rect=await page.locator('.map-layers-control').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=viewport.width);if(!bundle&&['mobile','desktop'].includes(label))await page.screenshot({path:fileURLToPath(new URL('../docs/steep-roads-'+label+'.png',import.meta.url))})}
 await page.locator('.map-layers-control > summary').click();await page.locator('.question-character').click();assert.equal(await page.locator('#origin-query').inputValue(),'서울');assert(await page.locator('#origin-query').isVisible());assert.equal(calls,0);assert.deepEqual(errors,[]);checks.push('Original map info, tab navigation, 320px/mobile/desktop/landscape layout, companion reopening and input preservation pass');
 const result={pass:true,entry:bundle?'single-html':'main-source',checks,browserErrors:errors,actualProviderCalls:0};await writeFile(new URL('../docs/steep-roads-'+(bundle?'bundle-':'')+'ui-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
