const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const pw=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'donghaeng-nav/docs');
async function main(){
 const {createApp}=await import(pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));
 let failure=false;const requests=[],checks=[],errors=[];
 const app=createApp({apiKey:'test-only-not-a-real-key',fetchImpl:async(url,options)=>{
  requests.push(JSON.parse(options.body));
  if(failure)return new Response('{}',{status:429});
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({wheelchair:false,avoidSteps:false,avoidSlope:false,rest:false,restKind:'bench',restMinutes:null,maxSlope:null,short:true,recognized:true})}]}}]}));
 }});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+app.address().port;let browser;
 try{
  for(const route of ['/','/app/','/index.html']){
   const r=await fetch(url+route);assert.equal(r.status,200);assert.match(await r.text(),/<title>동행길<\/title>/);
  }
  const html=fs.readFileSync(path.join(root,'donghaeng-nav/dist/index.html'),'utf8');
  for(const [,asset] of html.matchAll(/(?:src|data-src|href)="([^"#]+\.(?:js|json|geojson|css))"/g)){
   assert.equal((await fetch(url+'/'+asset)).status,200,asset);
   assert.equal((await fetch(url+'/app/'+asset)).status,200,'/app/'+asset);
  }
  for(const route of ['/.env','/donghaeng-nav/.env','/research/test.json','/runtime-integrity.json','/data/precision/unknown.json'])assert.equal((await fetch(url+route)).status,404);
  assert.equal(await (await fetch(url+'/app.js')).text(),await (await fetch(url+'/app/app.js')).text());
  assert.match(await (await fetch(url+'/동행길-최종.html')).text(),/<title>동행길<\/title>/);
  checks.push('Node root/app/index and legacy bundle serve main; all source assets load under root/app; private/unknown paths blocked');
  browser=await pw.chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('https://**',r=>r.abort());
  await context.addInitScript(()=>{
   const watches=new Map();let serial=0;
   window.__gps={watches,emit(lat,lon){for(const {ok} of watches.values())ok({coords:{latitude:lat,longitude:lon,accuracy:5},timestamp:Date.now()})},deny(){for(const {fail} of [...watches.values()])fail({code:1})}};
   Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok,fail){watches.set(++serial,{ok,fail});return serial},clearWatch(id){watches.delete(id)}}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/');await page.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
  const state=await page.evaluate(()=>({precision:precisionController.getData().features.length,buildings:precisionController.getAudit().buildingCount,tracker:typeof GPSTracker.create,policy:NavigationPolicy.goodAccuracy}));
  assert.equal(state.precision,16169);assert(state.buildings>10000);assert.equal(state.tracker,'function');assert.equal(state.policy,35);
  await page.screenshot({path:path.join(out,'main-navigation-desktop.png')});
  checks.push('Default browser entry boots precision 16169 features, combined building audit, GPS tracker and 35m policy');
  await page.locator('#condition').fill('가장 짧은 길로 가고 싶어요.');await page.locator('#find-route').click();
  await page.waitForFunction(()=>routes.length&&!document.querySelector('#find-route').disabled);
  assert.equal(requests.filter(r=>!r.generationConfig.responseJsonSchema.properties.selectedId).length,1);assert.equal(requests[0].contents[0].parts[0].text,'가장 짧은 길로 가고 싶어요.');
  assert.match(await page.locator('#parser-note').innerText(),/Gemini/);
  assert(await page.evaluate(()=>routes.every(r=>r.connectionReview.bodyConflicts.length===0)));
  const ids=await page.evaluate(()=>routes[0].ids.join(','));
  await page.locator('.facility-summary').click();await page.getByRole('button',{name:'전체 끄기',exact:true}).click();
  assert.equal(await page.evaluate(()=>routes[0].ids.join(',')),ids);await page.locator('.facility-summary').click();
  checks.push('Mock Gemini request contains condition only; real runtime routing excludes building overlaps; facility visibility preserves route');
  await page.locator('.navigation-replay').first().click();
  assert.equal(await page.evaluate(()=>navigationSession.snapshot().mode),'replay');
  await page.getByRole('button',{name:'모의 위치 한 칸 진행',exact:true}).click();
  assert(await page.evaluate(()=>navigationSession.snapshot().progress>=0));
  await page.getByRole('button',{name:'안내 종료',exact:true}).click();
  await page.evaluate(()=>{document.querySelector('#locate').click();window.__gps.emit(...DonghaengFinal.STATION)});
  assert.equal(await page.evaluate(()=>locationTracker.snapshot().phase),'tracking');
  await page.evaluate(()=>{map.fire('dragstart')});assert(await page.locator('#gps-tracking-follow').isVisible());
  const center=await page.evaluate(()=>{const c=map.getCenter();return [c.lat,c.lng]});
  await page.evaluate(()=>window.__gps.emit(DonghaengFinal.STATION[0]+.0005,DonghaengFinal.STATION[1]));
  assert.deepEqual(await page.evaluate(()=>{const c=map.getCenter();return [c.lat,c.lng]}),center);
  await page.locator('#gps-tracking-follow').click();assert(await page.evaluate(()=>map.getCenter().distanceTo(gpsMarker.getLatLng())<1));
  await page.locator('#gps-tracking-stop').click();assert.equal(await page.evaluate(()=>window.__gps.watches.size),0);
  await page.evaluate(()=>{document.querySelector('#locate').click();window.__gps.deny()});assert.equal(await page.evaluate(()=>locationTracker.snapshot().phase),'denied');
  checks.push('Replay/stop and simulated independent GPS fixes, drag pauses camera, follow resumes, stop/denial clear watchers');
  failure=true;await page.locator('#condition').fill('짧은 길로 가고 싶어요.');await page.locator('#find-route').click();await page.waitForFunction(()=>routes.length&&!document.querySelector('#find-route').disabled);
  assert.match(await page.locator('#parser-note').innerText(),/기기 내 해석/);
  await page.locator('[data-view="saved"]').click();await page.locator('#about').click();await page.locator('#usage-start').click();
  await page.waitForFunction(()=>document.activeElement.id==='destination-query');assert(await page.locator('#planner').isVisible());
  checks.push('Provider failure keeps honest local routing; guide starts input from saved view');
  await page.setViewportSize({width:393,height:852});await page.waitForTimeout(150);
  await page.locator('#mobile-more').click();await page.locator('#mobile-about').click();assert.equal(await page.locator('#usage-guide details[open]').count(),0);await page.keyboard.press('Escape');
  for(const size of [{width:320,height:568},{width:393,height:852},{width:667,height:375}]){await page.setViewportSize(size);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:393,height:852});await page.locator('#mobile-more').click();await page.locator('#mobile-about').click();await page.locator('#usage-start').click();await page.locator('#destination-query').blur();
  await page.evaluate(()=>{stopLocationTracking();resetTrip();setMobileMode('input');document.activeElement?.blur();document.querySelector('#places').replaceChildren();document.querySelector('#toast').classList.remove('show')});
  await page.waitForFunction(()=>!sheetFrame&&!sheetDrag);
  await page.screenshot({path:path.join(out,'main-navigation-mobile.png')});
  checks.push('Mobile menu/guide and 320px/393px/landscape layouts without horizontal overflow');
  const broken=await context.newPage();broken.on('pageerror',e=>errors.push(e.message));
  await broken.route('**/data/precision/precision-map.geojson',r=>r.fulfill({status:200,contentType:'application/json',body:'invalid JSON'}));
  await broken.goto(url+'/app/');await broken.waitForFunction(()=>document.querySelector('#boot-status').textContent.includes('오류'));
  assert(await broken.locator('#find-route').isDisabled());await broken.close();
  checks.push('Invalid runtime dataset shows boot error and keeps route action disabled');
  const bundled=await context.newPage();bundled.on('pageerror',e=>errors.push(e.message));
  await bundled.goto(url+'/동행길-최종.html');await bundled.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
  assert.equal(await bundled.evaluate(()=>precisionController.getData().features.length),16169);assert.equal(await bundled.evaluate(()=>typeof GPSTracker.create),'function');
  await bundled.close();checks.push('Built standalone boots same precision data and latest GPS module over localhost');
  assert.deepEqual(errors,[]);
  const result={pass:true,checks,browserErrors:errors,realGemini:false,physicalGps:false,physicalPhone:false,nativeFileBrowserVerified:false,externalHttpsBlocked:true};
  fs.writeFileSync(path.join(out,'main-navigation-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();app.closeAllConnections();await new Promise(r=>app.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
