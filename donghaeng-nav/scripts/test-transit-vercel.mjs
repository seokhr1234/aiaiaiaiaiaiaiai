import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {writeFile} from 'node:fs/promises';
const nativeFetch=globalThis.fetch,keys=['ODSAY_API_KEY','DONGHAENG_TRANSIT_ENABLED','ODSAY_DAILY_LIMIT','DONGHAENG_BACKEND_URL'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let calls=0;
globalThis.fetch=async(url)=>{assert.equal(new URL(url).hostname,'api.odsay.com');calls++;return new Response(JSON.stringify({result:{path:[{subPath:[{trafficType:3,sectionTime:1},{trafficType:2,sectionTime:4,startX:127.04,startY:37.6,endX:127.05,endY:37.61},{trafficType:3,sectionTime:1}]}]}}))};
const {default:handler}=await import('../../api/index.mjs');globalThis.fetch=nativeFetch;
const app=createServer((req,res)=>{if(req.url.startsWith('/api/index')){let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{req.body=JSON.parse(raw);handler(req,res)})}else handler(req,res)});
await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port,input={origin:[37.6,127.04],destination:[37.61,127.05],profile:{wheelchair:true},atTime:'2026-11-11T01:00:00Z'};
const post=path=>nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
try{
 for(const key of keys)delete process.env[key];
 assert.equal((await (await nativeFetch(base+'/api/transit/status')).json()).state,'not_configured');
 const coverage=await (await nativeFetch(base+'/api/coverage')).json();assert.equal(coverage.walking.serviceAvailable,false);assert.equal(coverage.precision.features,16169);
 assert.equal((await post('/api/routes/transit')).status,503);assert.equal(calls,0);
 process.env.ODSAY_API_KEY='test-only-vercel-key';
 for(const path of ['/api/routes/transit','/api/index?route=routes/transit']){const reply=await post(path);assert.equal(reply.status,200);const text=await reply.text();assert(text.includes('review_only'));assert(!text.includes(process.env.ODSAY_API_KEY))}
 assert.equal(calls,2);assert.equal((await (await nativeFetch(base+'/api/transit/status')).json()).state,'reference_candidates_only');
 process.env.DONGHAENG_TRANSIT_ENABLED='false';assert.equal((await post('/api/routes/transit')).status,503);assert.equal(calls,2);
 const result={pass:true,checks:['Actual api/index entry uses ODSAY_API_KEY without a walking backend','Original and rewritten/parsed-body transit requests return reference-only candidates','Missing key and explicit disable never call provider; no key in response','Static coverage fallback distinguishes known source extent from unavailable backend'],realOdsay:false,deployed:false};await writeFile(new URL('../docs/transit-vercel-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{globalThis.fetch=nativeFetch;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}app.closeAllConnections();await new Promise(r=>app.close(r))}
