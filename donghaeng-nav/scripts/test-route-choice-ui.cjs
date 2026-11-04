const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),pw=require('playwright');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'donghaeng-nav/docs');
async function main(){
 const {createApp}=await import(pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));let selections=0,mode='normal',release;
 const requests=[],checks=[],errors=[];
 const app=createApp({apiKey:'test-only-not-a-real-key',fetchImpl:async(_url,options)=>{
  const request=JSON.parse(options.body),raw=request.contents[0].parts[0].text;let input;try{input=JSON.parse(raw)}catch{}
  let result;
  if(input?.candidates){selections++;requests.push(input);assert(Object.keys(input).every(k=>['condition','profile','candidates'].includes(k)));assert(input.candidates.every(c=>!('coordinates' in c)&&!('name' in c)));
   if(mode==='slow')await new Promise(r=>release=r);
   const id=mode==='bad'?'R9':input.candidates[1].id;
   result={selectedId:id,summary:'경사와 미확인 구간을 비교해 두 번째 후보를 선택했습니다.',advantages:['참고 경사와 거리의 차이를 함께 비교했습니다.'],tradeoffs:['최단 거리보다 길 수 있습니다.'],cautions:['보도 실측·시설 상태는 확인되지 않았습니다.'],comparisons:input.candidates.map(c=>({id:c.id,comment:c.id===id?'이번 요청에서 선택한 후보입니다.':'거리와 참고 경사가 다른 후보입니다.'}))};
  }else result={wheelchair:true,avoidSteps:true,avoidSlope:true,rest:false,restKind:'any',restMinutes:null,maxSlope:null,short:false,recognized:true};
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}));
 }});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.address().port;let browser;
 try{
  browser=await pw.chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route('https://**',r=>r.abort());
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url+(process.env.ROUTE_CHOICE_BUNDLE?'/동행길-최종.html':'/'));await p.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
  await p.evaluate(()=>{
   const data={elements:[...[[1,37.6,127.04],[2,37.6,127.045],[3,37.6001,127.0425],[4,37.6015,127.0425],[5,37.5975,127.0425]].map(([id,lat,lon])=>({type:'node',id,lat,lon})),...[[3,'4.5%'],[4,'3%'],[5,'1%']].map(([n,incline],i)=>({type:'way',id:100+i,nodes:[1,n,2],tags:{highway:'footway',incline}}))]};graph=NavEngine.createGraph(data);graph.meta.allowAssistancePreview=true;
   const audit=PrecisionConnections.create({features:[]});precisionController={ready:Promise.resolve(),getAudit:()=>audit,reviewRoute:(r,a,b)=>PrecisionConnections.routeReview(audit,r,a,b)};
   setOrigin([37.6,127.04],'테스트 출발점');setDestination({ll:[37.6,127.045],name:'테스트 목적지'});
  });
  async function search(text){await p.locator('#condition').fill(text);await p.locator('#find-route').click();await p.waitForFunction(()=>!document.querySelector('#find-route').disabled&&!selectionRequest,null,{timeout:60000});}
  await search('휠체어로 경사를 피해 주세요.');assert.equal(selections,1);assert(await p.evaluate(()=>routes.length>=3));assert.equal(await p.evaluate(()=>routeSelection.source),'Gemini');assert.equal(await p.evaluate(()=>routes[selected].candidateId),'R2');
  await p.locator('.route-reason-button').click();assert.match(await p.locator('#route-reason-content').innerText(),/두 번째 후보/);await p.locator('.choice-comparison summary').click();assert.equal(await p.locator('.choice-comparison tr').count(),4);
  await p.locator('#route-reason-dialog').screenshot({path:path.join(out,'route-choice-reason-desktop.png')});await p.locator('#route-reason-dialog .close').click();await p.locator('.route-reason-button').click();assert.equal(selections,1);await p.locator('#route-reason-dialog .close').click();
  checks.push('Three distinct constrained candidates; Gemini R2 applied; original explanation and comparison shown with no request on repeated clicks');
  await p.locator('.route-card').first().locator(':scope > button').click();await p.locator('.route-reason-button').click();assert.match(await p.locator('#route-reason-title').innerText(),/직접 선택/);assert.match(await p.locator('#route-reason-content').innerText(),/원래 추천은 경로 2/);await p.locator('#route-reason-dialog .close').click();
  checks.push('Manual route selection does not inherit the AI-selected route explanation');
  await p.setViewportSize({width:393,height:852});await p.locator('.route-reason-button').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#route-reason-dialog').screenshot({path:path.join(out,'route-choice-reason-mobile.png')});await p.keyboard.press('Escape');
  await p.setViewportSize({width:1440,height:1000});mode='bad';await search('휠체어로 오르막을 피해 주세요.');assert.equal(await p.evaluate(()=>routeSelection.source),'algorithm');await p.locator('.route-reason-button').click();assert.match(await p.locator('#route-reason-title').innerText(),/알고리즘/);await p.locator('#route-reason-dialog .close').click();
  checks.push('Mobile reason dialog and invalid AI route ID use honest algorithm fallback');
  mode='slow';await p.locator('#condition').fill('휠체어로 경사를 꼭 피해 주세요.');await p.locator('#find-route').click();await p.waitForFunction(()=>document.querySelector('#search-status').textContent.includes('Gemini가'));
  while(!release)await new Promise(r=>setTimeout(r,10));await p.locator('#condition').fill('상태가 바뀌었어요.');release();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>routeSelection),null);assert.equal(await p.evaluate(()=>routes.length),0);
  checks.push('Editing during comparison aborts selection and discards a late decision/explanation');
  mode='slow';release=undefined;await p.locator('#condition').fill('휠체어로 완만한 길을 원해요.');await p.locator('#find-route').click();await p.waitForFunction(()=>document.querySelector('#search-status').textContent.includes('Gemini가'));while(!release)await new Promise(r=>setTimeout(r,10));await p.evaluate(()=>{selectionRequest.abort()});await p.waitForFunction(()=>!document.querySelector('#find-route').disabled);assert.equal(await p.evaluate(()=>routeSelection.source),'algorithm');assert.match(await p.locator('#search-status').textContent(),/시간이 초과/);release();
  checks.push('Comparison deadline/abort branch retains a valid algorithm result without losing candidates');
  mode='normal';const count=selections;await search('휠체어로 경사 0.5% 이하로 가고 싶어요.');assert.equal(selections,count);assert.equal(await p.evaluate(()=>routeSelection.source),'unavailable');assert.equal(await p.locator('.navigation-start').count(),0);await p.evaluate(()=>{startNavigation(false)});assert.equal(await p.evaluate(()=>navigationSession),null);
  checks.push('No eligible candidates are never sent to AI; review alternative cannot start live GPS');
  assert.deepEqual(errors,[]);const result={pass:true,checks,browserErrors:errors,syntheticRouteFixture:true,realGemini:false,physicalGps:false};fs.writeFileSync(path.join(out,'route-choice-ui-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
 }finally{release?.();await browser?.close();app.closeAllConnections();await new Promise(r=>app.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
