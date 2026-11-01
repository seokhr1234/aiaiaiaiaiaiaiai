const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
let pw;try{pw=require('playwright')}catch{pw=require(path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))}
const root=path.resolve(__dirname,'../..'),out=path.join(root,'donghaeng-nav/docs');
async function main(){
 const {createApp}=await import(require('node:url').pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));
 const app=createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));let browser;
 const errors=[],checks=[],measurements={};
 try{
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  await context.route('https://**',r=>r.abort());
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('http://127.0.0.1:'+app.address().port+'/app/');await p.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
  const cdp=await context.newCDPSession(p);
  async function state(){return p.evaluate(()=>({height:document.querySelector('.sidebar').getBoundingClientRect().height,top:document.querySelector('.sidebar').getBoundingClientRect().top,size:sheetSize,points:sheetGeometry.points,drag:!!sheetDrag,animating:!!sheetFrame,scroll:document.querySelector('.sheet-scroll').scrollTop}))}
  async function settle(){await p.waitForFunction(()=>!sheetFrame&&!sheetDrag);await p.waitForTimeout(30)}
  async function set(size){await p.evaluate(size=>setSheetSize(size,{animate:false}),size);await settle()}
  async function start(x,y){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]})}
  async function move(x,y){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});await p.waitForTimeout(35)}
  async function end(){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})}
  async function handle(){const b=await p.locator('#sheet-toggle').boundingBox();return {x:b.x+b.width/2,y:b.y+30}}
  await set('default');const initial=await state(),pt=await handle();
  await start(pt.x,pt.y);await move(pt.x,pt.y-40);const held1=await state();await move(pt.x,pt.y-100);const held2=await state();
  assert(held1.drag&&held2.drag);assert(Math.abs(held1.height-initial.height-40)<3);assert(Math.abs(held2.height-initial.height-100)<3);
  await p.screenshot({path:path.join(out,'sheet-motion-held.png')});
  await p.waitForTimeout(130);await end();
  const landingStart=await state();await p.waitForTimeout(70);const landingMid=await state();
  assert(landingMid.animating,'snap should still animate rather than jump');assert(Math.abs(landingMid.height-landingStart.height)>1,'snap should move while settling');
  await settle();const landed=await state();assert.equal(landed.size,'default');assert(Math.abs(landed.height-landed.points.default)<1);
  measurements.followFinger=[initial.height,held1.height,held2.height];measurements.snap=[landingStart.height,landingMid.height,landed.height];
  checks.push('held finger moves panel 1:1 before release','slow release chooses nearest snap with visible animation');
  await set('collapsed');const low=await handle();await start(low.x,low.y);
  for(let d=60;d<=360;d+=60)await move(low.x,low.y-d);await p.waitForTimeout(130);await end();await settle();
  assert.equal((await state()).size,'default');
  const mid=await handle();await start(mid.x,mid.y);for(let d=60;d<=240;d+=60)await move(mid.x,mid.y-d);await end();await settle();assert.equal((await state()).size,'expanded');
  const high=await handle();await start(high.x,high.y);for(let d=80;d<=640;d+=80)await move(high.x,high.y+d);await end();await settle();assert.equal((await state()).size,'collapsed');
  checks.push('collapsed, middle and expanded snap points');
  // A short, fast gesture should commit in the gesture direction.
  await set('default');const flick=await handle();await start(flick.x,flick.y);await move(flick.x,flick.y-100);await end();await settle();assert.equal((await state()).size,'expanded');checks.push('upward flick uses recent velocity');
  // Canceled pointer returns to its starting stable snap.
  await set('default');const cancel=await handle();await start(cancel.x,cancel.y);await move(cancel.x,cancel.y-80);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settle();assert.equal((await state()).size,'default');checks.push('touch cancellation restores a stable height');
  // Use text, not a form control: at scrollTop=0 it yields to sheet dragging.
  await set('expanded');await p.locator('.sheet-scroll').evaluate(e=>e.scrollTop=0);
  const text=await p.locator('label[for=condition]').boundingBox();const down={x:text.x+text.width/2,y:text.y+text.height/2};const beforeContent=await state();
  await start(down.x,down.y);await move(down.x,down.y+70);const bodyHeld=await state();assert(bodyHeld.drag,'top-boundary body drag must control sheet');assert(bodyHeld.height<beforeContent.height-60);await end();await settle();
  checks.push('content top boundary pulls the panel down');
  await set('expanded');
  // Give the real content extra scroll range via its existing examples disclosure.
  await p.locator('.examples-disclosure').evaluate(e=>e.open=true);await p.locator('.origin-settings').evaluate(e=>e.open=true);
  await p.locator('.sheet-scroll').evaluate(e=>e.scrollTop=70);const beforeScroll=await state();assert(beforeScroll.scroll>0,'fixture must have real scroll range');
  const sb=await p.locator('.sheet-scroll').boundingBox();await start(sb.x+5,sb.y+90);await move(sb.x+5,sb.y+135);const scrolled=await state();await end();await settle();
  assert(!scrolled.drag,'scrolled content must not start sheet dragging');assert(Math.abs(scrolled.height-beforeScroll.height)<1);checks.push('inner content scroll is not stolen by the sheet');
  await p.locator('#condition').fill('중간에 벤치에서 쉬고 싶어요.');assert.equal(await p.locator('#condition').inputValue(),'중간에 벤치에서 쉬고 싶어요.');checks.push('text field retains input behavior');
  // Mouse dragging and accessibility controls use the same snap logic.
  await set('default');const mouse=await handle(),mouseBefore=await state();await p.mouse.move(mouse.x,mouse.y);await p.mouse.down();await p.mouse.move(mouse.x,mouse.y-90,{steps:8});await p.waitForTimeout(30);assert((await state()).height>mouseBefore.height+85);await p.mouse.up();await settle();
  await set('collapsed');await p.locator('#sheet-toggle').focus();await p.keyboard.press('ArrowUp');await settle();assert.equal((await state()).size,'default');await p.keyboard.press('End');await settle();assert.equal((await state()).size,'expanded');await p.keyboard.press('Home');await settle();assert.equal((await state()).size,'collapsed');
  checks.push('mouse drag, keyboard arrows, Home and End');
  await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>setSheetSize('expanded'));const reduced=await state();assert(!reduced.animating);assert(Math.abs(reduced.height-reduced.points.expanded)<1);checks.push('reduced-motion snaps immediately');
  await p.emulateMedia({reducedMotion:'no-preference'});await set('default');const resize=await handle();await start(resize.x,resize.y);await move(resize.x,resize.y-60);await p.setViewportSize({width:393,height:650});await end();await settle();assert(!(await state()).drag);checks.push('viewport resize safely cancels in-progress drag');
  await p.setViewportSize({width:1440,height:1000});await p.waitForTimeout(100);assert(!await p.locator('body').evaluate(e=>e.classList.contains('sheet-dragging')));assert(await p.locator('#present-mode').isVisible());checks.push('desktop layout remains available');
  assert.deepEqual(errors,[]);const result={pass:true,checks,measurements,browserErrors:errors};fs.writeFileSync(path.join(out,'sheet-motion-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{await browser?.close();app.closeAllConnections();await new Promise(r=>app.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
