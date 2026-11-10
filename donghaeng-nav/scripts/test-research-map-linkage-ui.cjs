const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),pw=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'donghaeng-nav/docs');
(async()=>{
 const {createApp}=await import(pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));
 const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port,checks=[],errors=[];let browser;
 try{
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:393,height:852}});await context.route('https://**',r=>r.abort());
  for(const entry of ['/','/동행길-최종.html']){
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+encodeURI(entry));await page.waitForFunction(()=>typeof facilityController!=='undefined'&&facilityController?.getFeatures().length===17485,null,{timeout:60000});
   await page.evaluate(()=>facilityController.focusFeature('seoul:cooling:80f8394aa06897d9'));
   const popup=page.locator('.facility-popup');await popup.waitFor({state:'visible'});
   await page.waitForFunction(()=>typeof sheetFrame==='undefined'||!sheetFrame);
   assert.match(await popup.innerText(),/공식 자료 수집일[\s\S]*2026-11-05/);
   assert.match(await popup.innerText(),/2026년 시설 등록 · 갱신 2026-11-05/);
   assert.match(await popup.innerText(),/현장 미확인/);assert.match(await popup.innerText(),/12:00~13:00 미운영/);
   assert.match(await popup.locator('.facility-evidence-warning').innerText(),/자동 휴식 후보에서는 제외/);
   const link=popup.getByRole('link',{name:/추가 공식 근거/});assert.match(await link.getAttribute('href'),/nttNo=9581034/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(entry==='/')await page.screenshot({path:path.join(out,'research-map-linkage-mobile.png')});
   await page.setViewportSize({width:1440,height:1000});
   await page.evaluate(()=>facilityController.focusFeature('seoul:cooling:6fcea078832f652a'));
   await page.waitForFunction(()=>document.querySelectorAll('.facility-popup').length===1&&document.querySelector('.facility-popup h3')?.textContent.includes('보문느티나무'));
   assert.equal(await popup.locator('.facility-evidence-warning').count(),0);assert.match(await popup.innerText(),/공지와 서울시 등록의 운영 안내 일치/);
   if(entry==='/')await page.screenshot({path:path.join(out,'research-map-linkage-desktop.png')});
   await page.evaluate(()=>{facilityController.setAll(false);facilityController.setAll(true)});
   assert.equal(await page.evaluate(()=>facilityController.getFeatures().length),17485);
   checks.push(entry+': mobile/desktop recheck dates, conflicting hours/hold warning, source links, unchanged counts and toggles');await page.close();
  }
  for(const fixture of ['empty','invalid']){
   const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/data/accessibility/seoul/seoul-facilities.geojson',r=>r.fulfill({status:200,contentType:'application/json',body:fixture==='empty'?JSON.stringify({type:'FeatureCollection',features:[]}):'invalid JSON'}));
   await p.goto(url+'/');
   if(fixture==='empty')await p.waitForFunction(()=>document.querySelector('.facility-control')?.dataset.loadState==='empty',null,{timeout:60000});else{await p.waitForFunction(()=>document.querySelector('#boot-status').textContent.includes('오류'));assert(await p.locator('#find-route').isDisabled());}
   assert.equal(await p.locator('.facility-evidence-warning').count(),0);checks.push(fixture+': no false confirmation; existing empty/error state');await p.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'research-map-linkage-ui-results.json'),JSON.stringify({pass:true,checks,browserErrors:errors,fieldVerified:false,actualGpsTested:false},null,2)+'\n');console.log(checks.join('\n'));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
