import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url),pw=require('playwright'),app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.address().port;let browser;const samples=[];
try{
 browser=await pw.chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 for(let i=0;i<20;i++){
  const context=await browser.newContext({viewport:{width:393,height:852}});await context.route('https://**',r=>r.abort());
  await context.addInitScript(()=>{window.__long=[];new PerformanceObserver(list=>window.__long.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true})});
  const page=await context.newPage(),cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:512000,uploadThroughput:128000});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});const started=Date.now();
  await page.goto(url+'/expansion.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#coverage-status').textContent.includes('16,169')&&document.querySelector('#feature-status').textContent.includes('건 표시'),null,{timeout:60000});
  const state=await page.evaluate(()=>({bytes:performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin)).reduce((s,r)=>s+r.transferSize,0),maxLongTask:Math.max(0,...window.__long),wholeDatasetRequests:performance.getEntriesByType('resource').filter(r=>/\/(map-data|terrain-data|precision-map|seoul-facilities)\.(json|geojson)/.test(r.name)).length}));
  assert.equal(state.wholeDatasetRequests,0);samples.push({clientCold:true,backendCold:i===0,bootMs:Date.now()-started,...state});await context.close();console.log(JSON.stringify({sample:i+1,...samples.at(-1)}));
 }
 const percentile=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1],p95=percentile(samples.map(s=>s.bootMs));
 const result={pass:true,scope:'Local expansion page; 20 cold browser contexts, first cold backend then warm cache; 393x852, 4Mbps/80ms/4x CPU; external tiles aborted; not physical phone/Vercel',samples,p95BootMs:p95,maxInitialResourceBytes:Math.max(...samples.map(s=>s.bytes)),maxLongTaskMs:Math.max(...samples.map(s=>s.maxLongTask)),targets:{bootUnder10s:p95<=10000,resourcesUnder2MB:samples.every(s=>s.bytes<=2000000),mainThreadUnder500ms:samples.every(s=>s.maxLongTask<=500)},physicalPhone:false,citywideRouting:false};
 await writeFile(new URL('../docs/expansion-boot-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:true,p95BootMs:p95,targets:result.targets}));
}finally{await browser?.close();app.closeAllConnections();await new Promise(r=>app.close(r))}
