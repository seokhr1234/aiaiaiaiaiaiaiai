const fs=require('node:fs'),path=require('node:path'),pw=require('playwright');
const out=__dirname,url='http://127.0.0.1:4173';
const report={baseline:'079c4467786a9e9dd546f434e215904e40ebad50',scope:'Real local Node server; Gemini key missing; OSM tiles aborted deterministically; simulated GPS only',cases:[]};
const save=()=>fs.writeFileSync(path.join(out,process.argv.includes('--slow')?'slow-mobile-results.json':'browser-results.json'),JSON.stringify(report,null,2));
(async()=>{const browser=await pw.chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
async function fresh({viewport={width:1440,height:1000},storage={},slow=false}={}){
 const context=await browser.newContext({viewport});await context.route('https://**',r=>r.abort());
 await context.addInitScript(({storage})=>{for(const [k,v] of Object.entries(storage))localStorage.setItem(k,v);window.__long=[];try{new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(x=>({start:x.startTime,duration:x.duration})))).observe({type:'longtask',buffered:true})}catch{}}
 ,{storage});
 const p=await context.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 if(slow){const cdp=await context.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:512000,uploadThroughput:128000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});}
 const started=Date.now();await p.goto(url,{waitUntil:'domcontentloaded',timeout:300000});
 await p.waitForFunction(()=>document.querySelector('#find-route')&&!document.querySelector('#find-route').disabled,null,{timeout:300000});
 p.bootMs=Date.now()-started;return {context,p};
}
async function run(name,fn){try{const result=await fn();report.cases.push({name,...result});console.log(name,JSON.stringify(result));}catch(e){report.cases.push({name,auditError:e.message});console.log(name,'AUDIT ERROR',e.message)}save();}
try{
 if(process.argv.includes('--slow')){
  console.log('Starting 4 Mbps / 4x CPU mobile cold load');
  await run('slow-mobile-cold-boot',async()=>{const {context,p}=await fresh({viewport:{width:393,height:852},slow:true});const metrics=await p.evaluate(()=>({bytes:performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)&&r.name.includes('.json')||r.name.includes('.geojson')).reduce((n,r)=>n+r.transferSize,0),longTasks:window.__long.length,maxLongTask:Math.max(0,...window.__long.map(t=>t.duration)),heap:performance.memory?.usedJSHeapSize,status:document.querySelector('#boot-status').textContent}));const r={bootMs:p.bootMs,...metrics,errors:p.errors};await p.screenshot({path:path.join(out,'slow-mobile-boot.png')});await context.close();return r});
  return;
 }
 const {context,p}=await fresh();
 await run('desktop-boot',async()=>({bootMs:p.bootMs,metrics:await p.evaluate(()=>({resources:performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).map(r=>({path:new URL(r.name).pathname,bytes:r.transferSize,duration:r.duration})),longTasks:window.__long.length,maxLongTask:Math.max(0,...window.__long.map(t=>t.duration)),heap:performance.memory?.usedJSHeapSize})),errors:p.errors}));
 await run('route-and-save-mobile',async()=>{
  await p.locator('[data-destination="library"]').click();await p.locator('#condition').fill('가장 짧은 길로 가고 싶어요.');const start=Date.now();await p.locator('#find-route').click();await p.waitForFunction(()=>routes.length&&!document.querySelector('#find-route').disabled,null,{timeout:90000});
  const route=await p.evaluate(()=>({count:routes.length,selected,source:routeSelection.source,rest:routes[selected].restStop?.name,summary:document.querySelector('#search-status').textContent,parser:document.querySelector('#parser-note').textContent}));
  await p.locator('#save-route').evaluate(b=>b.click());
  await p.setViewportSize({width:393,height:852});await p.locator('[data-mobile-tab="saved"]').click();const stored=await p.locator('#saved-list').innerText();await p.locator('#saved-list button').first().click();await p.waitForFunction(()=>routes.length&&!document.querySelector('#find-route').disabled,null,{timeout:90000});
  const state=await p.evaluate(()=>({mode:mobileMode,plannerHidden:document.querySelector('#planner').hidden,savedHidden:document.querySelector('#saved-view').hidden}));await p.screenshot({path:path.join(out,'mobile-saved-reopen.png')});return {elapsedMs:Date.now()-start,route,stored,state,errors:p.errors};
 });
 await run('small-screen-facility-popup',async()=>{
  await p.setViewportSize({width:320,height:568});await p.evaluate(()=>facilityController.focusFeature('seoul:cooling:80f8394aa06897d9'));await p.waitForTimeout(600);
  const rects=await p.evaluate(()=>{const r=e=>{const x=e.getBoundingClientRect();return {left:x.left,top:x.top,right:x.right,bottom:x.bottom,width:x.width,height:x.height}};return {popup:r(document.querySelector('.leaflet-popup')),warning:r(document.querySelector('.facility-evidence-warning')),sheet:r(document.querySelector('.sidebar')),map:r(document.querySelector('#live-map')),overflow:document.documentElement.scrollWidth>innerWidth}});
  await p.screenshot({path:path.join(out,'small-screen-popup.png')});return {rects,errors:p.errors};
 });
 await context.close();
 for(const fixture of [{name:'saved-object',key:'donghaeng.school.routes',value:'{}',action:'saved'},{name:'saved-null-entry',key:'donghaeng.school.routes',value:'[null]',action:'saved'},{name:'saved-legacy-entry',key:'donghaeng.school.routes',value:'[{"id":1,"name":"old route"}]',action:'saved'},{name:'reports-object',key:'donghaeng.school.reports',value:'{}',action:'report'}]){
  await run(fixture.name,async()=>{const {context,p}=await fresh({storage:{[fixture.key]:fixture.value}});if(fixture.action==='saved')await p.locator('[data-view="saved"]').click();else await p.locator('#report-open').click();await p.waitForTimeout(100);const result={errors:p.errors,content:await p.locator(fixture.action==='saved'?'#saved-list':'#report-history').innerText()};await context.close();return result;});
 }
}finally{await browser.close();save();}})().catch(e=>{console.error(e);process.exitCode=1});
