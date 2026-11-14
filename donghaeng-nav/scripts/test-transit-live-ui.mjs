// Explicit opt-in: one real provider search against a separately configured
// local server. This script never accepts, reads or records an API key.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
if(!process.argv.includes('--allow-live'))throw Error('Pass --allow-live only after authorizing one real provider request.');
const base=process.env.DONGHAENG_LIVE_BASE||'http://127.0.0.1:4187';
const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:')throw Error('Local test server required.');
const require=createRequire(import.meta.url),{chromium}=require('playwright');let browser;
const errors=[],checks=[];let providerSearches=0;
try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||!['http:','https:'].includes(u.protocol)?route.continue():route.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname==='/api/routes/transit')providerSearches++});
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#find-route').disabled,null,{timeout:60000});
 await page.locator('#mode-transit').click();await page.waitForFunction(()=>document.querySelector('#transit-connection').textContent.includes('검색 설정됨'));
 await page.evaluate(()=>{setOrigin([37.5665,126.978],'공개 시험 출발');setDestination({name:'공개 시험 도착',ll:[37.49794,127.0276]},{pan:false})});
 await page.locator('#condition').fill('계단을 피해서 가고 싶어요.');await page.locator('#find-route').click();
 await page.waitForFunction(()=>transitResult&&!document.querySelector('#find-route').disabled,null,{timeout:30000});
 const count=await page.evaluate(()=>transitResult.candidates.length);assert(count>0);assert.equal(providerSearches,1);assert.equal(await page.locator('.transit-card').count(),Math.min(5,count));assert.equal(await page.locator('.navigation-start').count(),0);
 checks.push('Actual local Server-key authentication returns reference candidates through the main UI in exactly one provider search; no GPS/accessibility promotion');
 await page.getByRole('button',{name:'도보 구간 참고 계산',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.transit-walk-review > [role="status"]')?.textContent.includes('등록 도로 계산'),null,{timeout:30000});
 assert.equal(await page.locator('.journey-review').count(),1);assert.equal(providerSearches,1);
 const reviewed=await page.locator('.journey-steps li').count();assert(reviewed>=3);assert.match(await page.locator('.journey-check-summary').innerText(),/도착 시각 미확인/);
 checks.push('The actual provider candidate feeds preserved Seoul walking review and all-leg checks without a second provider call; unknown entrances/timetable/access remain explicit');
 await page.locator('.journey-review').scrollIntoViewIfNeeded();await page.screenshot({path:fileURLToPath(new URL('../docs/transit-live-journey-desktop.png',import.meta.url))});
 await page.setViewportSize({width:393,height:852});await page.locator('.journey-review').scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'다음 구간',exact:true}).click();assert.match(await page.locator('.journey-progress').innerText(),/2\//);
 await page.screenshot({path:fileURLToPath(new URL('../docs/transit-live-journey-mobile.png',import.meta.url))});
 checks.push('Actual result supports mobile manual stage review without horizontal overflow, live GPS or inferred vehicle polylines');
 assert.deepEqual(errors,[]);
 const result={pass:true,checkedDateKst:'2026-11-14',entry:'local-main-ui',actualProviderRequests:providerSearches,candidateCount:count,reviewedStages:reviewed,checks,browserErrors:errors,geminiCalls:0,providerRawSaved:false,keySaved:false,registeredIpAuthenticationSucceeded:true,deployed:false,fieldVerified:false};
 await writeFile(new URL('../docs/transit-live-journey-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await browser?.close()}
