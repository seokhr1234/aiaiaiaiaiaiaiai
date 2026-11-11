import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createTransitEdgeHandler} from '../services/transit/edge.mjs';
const config={apiKey:'',enabled:true,dailyLimit:3};let calls=0,mode='normal';
const handler=createTransitEdgeHandler({getConfig:()=>config,fetchImpl:async()=>{calls++;return mode==='invalid'?new Response('not json'):mode==='rate'?new Response('{}',{status:429}):new Response(JSON.stringify({result:{path:[{subPath:[{trafficType:3,sectionTime:1},{trafficType:1,sectionTime:5,startX:127.04,startY:37.6,endX:127.05,endY:37.61},{trafficType:3,sectionTime:1}]}]}}))}});
const app=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/index')req.body=await new Promise((resolve,reject)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>resolve(JSON.parse(raw)));req.on('error',reject)});await handler(req,res,url.pathname==='/api/index'?'/api/'+url.searchParams.get('route'):url.pathname)});
await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port,input={origin:[37.6,127.04],destination:[37.61,127.05],profile:{wheelchair:true},atTime:'2026-11-11T01:00:00Z'},checks=[];
const post=(path,body=input,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
try{
 assert.equal((await post('/api/routes/transit')).status,503);assert.equal(calls,0);config.apiKey='test-key-not-a-real-one';
 const response=await post('/api/routes/transit');assert.equal(response.status,200);const data=await response.json();assert.equal(data.state,'review_only');assert.equal(data.candidates[0].profile.wheelchair,true);assert(!JSON.stringify(data).includes(config.apiKey));
 assert.equal((await post('/api/index?route=routes/transit')).status,200);assert.equal(calls,2);
 assert.equal((await post('/api/routes/transit',input,{Origin:'https://unrelated.example'})).status,403);assert.equal(calls,2);
 assert.equal((await post('/api/routes/transit',{...input,profile:{wheelchair:'true'}})).status,400);assert.equal(calls,2);
 mode='invalid';const bad=await post('/api/routes/transit');assert.equal(bad.status,502);assert(!(await bad.text()).includes(config.apiKey));assert.equal((await post('/api/routes/transit')).status,429);assert.equal(calls,3);
 checks.push('Vercel-style direct and rewritten/parsed-body routes use dynamic server env config; missing key never calls provider');
 checks.push('Keys never returned; anonymous mode-independent condition contract, cross-origin/malformed inputs blocked before paid call');
 checks.push('Malformed provider response fails safely and still consumes bounded attempt budget; no unsupported schedule/accessible claim');
 const status=await (await fetch(base+'/api/transit/status')).json();assert.equal(status.budgetScope,'server_instance');
 const result={pass:true,checks,realOdsay:false,deployed:false,actualKeyRequired:'ODSAY_API_KEY',globalBudgetEnforced:false};await writeFile(new URL('../docs/transit-edge-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{app.closeAllConnections();await new Promise(r=>app.close(r))}
