const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright')}catch{pw=require(path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const root=path.resolve(__dirname,'../..'),out=path.join(root,'donghaeng-nav/docs/mobile-ux-concept');
async function main(){
 const {createApp}=await import(pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));
 let mode='ok',requests=[];
 const app=createApp({apiKey:'test-only-not-a-real-key',fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body);requests.push(body);
  if(mode==='failure')return new Response('{}',{status:429});
  const short=body.contents[0].parts[0].text.includes('짧은');
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({wheelchair:false,avoidSteps:!short,avoidSlope:!short,rest:!short,restKind:'bench',restMinutes:null,maxSlope:null,short,recognized:true})}]}}]}));
 }});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 let browser;const errors=[],checks=[];
 try{
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await context.route('https://**',r=>r.abort());
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+app.address().port+'/app/');
  await p.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
  async function screenshot(name){await p.screenshot({path:path.join(out,name+'.png')})}
  async function noOverflow(){assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert(await p.locator('.mobile-tabs').isVisible())}
  async function sheetSettled(){await p.waitForFunction(()=>!sheetFrame&&!sheetDrag)}
  async function route(){await p.locator('#find-route').click();await p.waitForFunction(()=>document.body.dataset.mobileMode==='results'&&routes.length&&!document.querySelector('#find-route').disabled)}
  assert.equal(await p.locator('body').getAttribute('data-mobile-mode'),'input');
  await noOverflow();assert(await p.locator('#find-route').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));
  const station=await p.evaluate(()=>{const p=map.latLngToContainerPoint(origin);const sheet=document.querySelector('.sidebar').getBoundingClientRect(),r=map.getContainer().getBoundingClientRect();return p.y+r.top<sheet.top});assert(station,'initial origin must be above sheet');
  await screenshot('implemented-input');checks.push('input with visible CTA and origin above sheet');
  await p.locator('#sheet-toggle').click();await sheetSettled();assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'collapsed');
  const mb=await p.locator('#live-map').boundingBox();const before=await p.evaluate(()=>map.getCenter().lng);
  const cdp=await context.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mb.x+mb.width*.48,y:mb.y+mb.height*.42}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mb.x+mb.width*.48+10*i,y:mb.y+mb.height*.42+3*i}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
  assert.notEqual(await p.evaluate(()=>map.getCenter().lng),before,'touch dragging must move the map');
  assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'collapsed');
  await p.locator('#sheet-toggle').click();await sheetSettled();
  const handle=await p.locator('#sheet-toggle').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:handle.x+100,y:handle.y+25}]});
  for(let d=40;d<=240;d+=40)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:handle.x+100,y:handle.y+25-d}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sheetSettled();assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'expanded');checks.push('touch map pan and separate sheet-handle swipe');
  await p.locator('#destination-query').fill('꿈그림');await p.locator('#places button').first().click();
  await p.locator('#condition').fill('무릎이 아파서 중간에 벤치에 앉아 쉬고 싶어요.');
  assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'expanded');
  await route();assert.equal(requests.length,1);assert.deepEqual(Object.keys(requests[0].contents[0]),['role','parts']);
  assert(await p.locator('#mobile-route-status').isVisible());assert.match(await p.locator('#mobile-route-status').innerText(),/AI 해석|미확인/);
  assert.equal(await p.locator('#route-evidence').getAttribute('open'),null);await p.locator('#route-evidence > summary').click();assert(await p.locator('#plan-reason').isVisible());await p.locator('#route-evidence > summary').click();
  await p.locator('.sheet-scroll').evaluate(e=>e.scrollTop=0);await screenshot('implemented-results');checks.push('search, one automatic AI call, results and on-demand evidence');
  await p.locator('.route-go').click();assert.equal(await p.locator('body').getAttribute('data-mobile-mode'),'order');
  assert.match(await p.locator('.order-mode').innerText(),/수동/);await p.locator('#order-next').click();assert.equal(await p.evaluate(()=>activeStage),1);
  await screenshot('implemented-order');await p.locator('#mobile-overview').click();
  await p.locator('#mobile-save').click();await p.locator('[data-mobile-tab="saved"]').click();assert(await p.locator('.saved-item').count()>0);
  await p.locator('.saved-item button').first().click();await p.waitForFunction(()=>document.body.dataset.mobileMode==='results'&&!document.querySelector('#find-route').disabled);
  checks.push('manual order, save and reopen from mobile tab');
  await p.locator('[data-mobile-tab="report"]').click();await p.locator('#report-place').fill('테스트 장소');await p.locator('#report-text').fill('모바일 제보 저장 동작 확인');await p.locator('#report-form button[type=submit]').click();assert.match(await p.locator('#report-history').innerText(),/테스트 장소/);await p.locator('#report-dialog .close').click();
  await p.locator('.facility-summary').click();assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'collapsed');
  const ids=await p.evaluate(()=>routes[0].ids.join(','));await p.getByRole('button',{name:'전체 끄기',exact:true}).click();assert.equal(await p.evaluate(()=>routes[0].ids.join(',')),ids);
  await p.locator('.facility-summary').click();checks.push('report storage, facility controls, visibility independent of route');
  await p.locator('[data-mobile-tab="route"]').click();await p.locator('#mobile-edit').click();
  await p.locator('#destination-query').fill('없는장소xyz');await p.locator('#places .empty-note').waitFor();await p.locator('#find-route').click();assert.match(await p.locator('#toast').innerText(),/목적지/);
  await p.locator('#destination-query').fill('꿈그림');await p.locator('#places button').first().click();
  await p.locator('.origin-settings summary').click();await p.locator('#pick-origin').click();assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'collapsed');assert(await p.locator('#map-instruction').isVisible());
  // A real map click at a projected, covered location exercises pin selection.
  const point=await p.evaluate(()=>{const pt=map.latLngToContainerPoint([37.6019,127.041]);const r=map.getContainer().getBoundingClientRect();return {x:pt.x+r.left,y:pt.y+r.top}});
  await p.mouse.click(point.x,point.y);assert.match(await p.locator('#origin-name').innerText(),/지도에서/);assert.equal(await p.locator('body').getAttribute('data-sheet-size'),'default');
  checks.push('empty search and map-based origin selection');
  mode='failure';await p.locator('#condition').fill('가장 짧은 길로 가고 싶어요.');await route();assert.match(await p.locator('#mobile-route-status').innerText(),/기기 내 해석/);checks.push('provider failure keeps routing with honest local status');
  for(const size of [{width:320,height:568},{width:430,height:932},{width:667,height:375}]){
   await p.setViewportSize(size);await p.waitForTimeout(150);await noOverflow();await p.locator('#sheet-toggle').click();await p.locator('#sheet-toggle').click();assert(await p.locator('#sheet-toggle').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}));
  }checks.push('320px, large phone and landscape layouts');
  // Browser viewport keyboard events are not synthesized by Playwright; exercise
  // the actual visualViewport listener using a controlled viewport geometry.
  await p.setViewportSize({width:393,height:852});await p.locator('#mobile-edit').click();await p.locator('#condition').focus();
  await p.evaluate(()=>{window.__realVV=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:480,offsetTop:0}});window.__realVV.dispatchEvent(new Event('resize'))});
  assert(await p.locator('body').evaluate(e=>e.classList.contains('keyboard-open')));assert(await p.locator('.mobile-tabs').isHidden());
  const geometry=await p.locator('.sidebar').boundingBox();assert(geometry.y+geometry.height<=482);
  await p.evaluate(()=>{Object.defineProperty(window,'visualViewport',{configurable:true,value:window.__realVV});document.activeElement.blur();syncMobileViewport()});
  checks.push('keyboard viewport branch (simulated geometry, not a real OS keyboard)');
  await p.setViewportSize({width:1440,height:1000});await p.waitForTimeout(150);assert(await p.locator('#condition').isVisible());assert(await p.locator('#present-mode').isVisible());checks.push('desktop resize restores planner');
  const file=await context.newPage();file.on('pageerror',e=>errors.push(e.message));await file.setViewportSize({width:393,height:852});await file.goto(pathToFileURL(path.join(root,'동행길-최종.html')).href);await file.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});await file.locator('#condition').fill('가장 짧은 길로 가고 싶어요.');await file.locator('#find-route').click();await file.waitForFunction(()=>routes.length>0&&document.body.dataset.mobileMode==='results');assert.match(await file.locator('#mobile-route-status').innerText(),/기기 내/);checks.push('bundled HTML offline mobile flow');
  assert.deepEqual(errors,[]);const result={pass:true,realGeminiCall:false,checks,browserErrors:errors};fs.writeFileSync(path.join(root,'donghaeng-nav/docs/mobile-app-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();app.closeAllConnections();await new Promise(r=>app.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
