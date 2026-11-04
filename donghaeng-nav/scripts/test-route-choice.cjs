const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const E=require('../dist/engine'),X=require('../dist/endpoint-routing'),C=require('../dist/route-candidates'),R=require('../dist/route-choice'),AI=require('../dist/condition-ai');
const root=path.resolve(__dirname,'../..');
function fixture(){return E.createGraph({elements:[...[[1,37.6,127.04],[2,37.6,127.045],[3,37.6001,127.0425],[4,37.6015,127.0425],[5,37.5975,127.0425]].map(([id,lat,lon])=>({type:'node',id,lat,lon})),...[[3,'4.5%'],[4,'3%'],[5,'1%']].map(([n,incline],i)=>({type:'way',id:100+i,nodes:[1,n,2],tags:{highway:'footway',incline}}))]})}
function decision(input,id=input.candidates[1].id){return {selectedId:id,summary:'후보의 경사와 미확인 구간을 비교해 선택했습니다.',advantages:['참고 경사와 거리를 함께 비교했습니다.'],tradeoffs:['최단 거리보다 길 수 있습니다.'],cautions:['노면 실측과 현재 통행 여부는 확인되지 않았습니다.'],comparisons:input.candidates.map(c=>({id:c.id,comment:c.id===id?'이번 요청에 맞춰 선택한 후보입니다.':'거리와 경사 차이가 있는 다른 후보입니다.'}))}}
async function main(){
 const checks=[],g=fixture(),from=[37.6,127.04],to=[37.6,127.045],p=E.wheelchairProfile(E.parseState('휠체어로 경사를 피하고 싶어요.'));
 g.meta.buildingAudit=require('../dist/precision-connections').create({features:[]});
 const before=JSON.stringify([...g.nodes]),generated=await C.generate(E,X,g,from,to,p,{timeBudgetMs:10000});
 assert(generated.routes.length>=3&&generated.routes.length<=5);assert(generated.attempts<=24);assert.equal(JSON.stringify([...g.nodes]),before);
 const costs=generated.routes.map(r=>r.edges.reduce((sum,e)=>sum+E.cost(e,p),0));assert.deepEqual(costs,[...costs].sort((a,b)=>a-b));assert(E.cost({d:100,incline:null},p)>=1000);
 for(const r of generated.routes){assert(C.eligible(E,r,p));assert(r.edges.every(e=>!e.steps&&E.screeningGrade(e)<=5));assert(!r.assistancePreview)}
 checks.push('Distinct constrained alternatives on three-branch graph; 24 attempt bound, unchanged input graph and wheelchair exclusions');
 // Three separate roads with the same slope: strict Pareto pruning used to
 // discard the longer two, leaving Gemini nothing to compare.
 const dominated=fixture();for(const node of dominated.nodes.values())for(const edge of node.edges)edge.incline=2;
 const alternatives=await C.generate(E,X,dominated,from,to,p);
 assert.equal(alternatives.routes.length,3);assert(alternatives.routes.every(r=>r.selectionMetrics.maxReferenceSlope===2));
 for(const [i,a] of alternatives.routes.entries())for(const b of alternatives.routes.slice(i+1))assert(C.overlap(a,b)<=.9);
 const only=alternatives.routes[0],loop={...only,edges:[...only.edges,...only.edges],length:only.length*2};assert.equal(C.overlap(only,loop),1);
 const snapshot=JSON.stringify([...dominated.nodes]),blockedKey=only.edges[0].key;
 const diverted=X.route(E,dominated,from,to,p,{excludedKeys:new Set([blockedKey])});assert(!diverted.edges.some(e=>(e.parentKey||e.key)===blockedKey));assert.equal(JSON.stringify([...dominated.nodes]),snapshot);
 const limited=await C.generate(E,X,dominated,from,to,p,{maxAttempts:1});assert.equal(limited.attempts,1);assert.equal(limited.routes.length,1);assert.equal(limited.diagnostics.stopReason,'attempt-limit');
 const timed=await C.generate(E,X,dominated,from,to,p,{timeBudgetMs:0});assert.equal(timed.attempts,1);assert.equal(timed.diagnostics.stopReason,'time-budget');
 checks.push('Geographically different slightly dominated alternatives retained; nested-loop duplicates rejected; exclusions preserve endpoints/input graph; attempt/time limits reported');
 const constrained=fixture();for(const node of constrained.nodes.values())for(const edge of node.edges){edge.incline=edge.id===100?2:7;if(edge.id===102)edge.steps=true}
 const safe=X.route(E,constrained,from,to,p),blocked=new Set(safe.edges.map(e=>e.key));assert.throws(()=>X.route(E,constrained,from,to,p,{excludedKeys:blocked}));
 const during=new AbortController();await assert.rejects(()=>C.generate(E,X,dominated,from,to,p,{signal:during.signal,onProgress:()=>during.abort()}),{name:'AbortError'});
 checks.push('Excluding the only admissible branch cannot substitute steep/stair routes; cancellation between searches discards the run');
 const restricted=await C.generate(E,X,g,from,to,{...p,maxSlope:.5});assert.equal(restricted.routes.length,0);
 const one=await C.generate(E,X,E.createGraph({elements:[{type:'node',id:1,lat:37.6,lon:127.04},{type:'node',id:2,lat:37.6,lon:127.045},{type:'way',id:10,nodes:[1,2],tags:{highway:'footway',incline:'1%'}}]}),from,to,p);assert.equal(one.routes.length,1);assert(one.diagnostics.duplicates>0);
 const abort=new AbortController();abort.abort();await assert.rejects(()=>C.generate(E,X,g,from,to,p,{signal:abort.signal}),{name:'AbortError'});
 checks.push('No constrained path stays empty; duplicate single path stays one; generation cancellation');
 const input=R.input('휠체어로 경사를 피해 주세요.',p,generated.routes),reply=decision(input);assert.equal(R.validateDecision(reply,input.candidates).selectedId,reply.selectedId);
 assert.throws(()=>R.validateDecision(decision(input,'R9'),input.candidates));assert.throws(()=>R.validateDecision({...reply,comparisons:[reply.comparisons[0],reply.comparisons[0]]},input.candidates));
 for(const change of [x=>x.candidates[0].latitude=37.6,x=>x.candidates[0].stairsMeters=1,x=>x.candidates[0].maxReferenceSlope=8,x=>x.profile.maxSlope=9]){const x=structuredClone(input);change(x);assert.throws(()=>R.validateInput(x))}
 assert.equal(AI.merge(E.parseState('휠체어로 경사 3% 이하로 가고 싶어요.'),{wheelchair:false,avoidSteps:false,avoidSlope:false,rest:false,short:true,recognized:true,restMinutes:null,restKind:'any',maxSlope:null}).wheelchair,true);
 assert.equal(AI.merge(E.parseState('휠체어로 경사 3% 이하로 가고 싶어요.'),{wheelchair:false,avoidSteps:false,avoidSlope:false,rest:false,short:true,recognized:true,restMinutes:null,restKind:'any',maxSlope:null}).maxSlope,3);
 checks.push('Strict anonymous metric schema, unknown/duplicate IDs and constraint bypass rejected; explicit wheelchair and numeric limits preserved');
 const vm=require('node:vm'),context=vm.createContext({location:{protocol:'file:'},RouteChoice:R,ConditionRequest:require('../dist/condition-request'),ConditionAI:AI});
 vm.runInContext(fs.readFileSync(path.join(root,'donghaeng-nav/dist/portable-ai.js'),'utf8'),context);
 context.PortableAI.configure('test-only-not-a-real-gemini-key');
 const portable=await context.PortableAI.selectRoute(input,{fetchImpl:async(_url,options)=>{assert.deepEqual(JSON.parse(JSON.parse(options.body).contents[0].parts[0].text),input);return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(reply)}]}}]}))}});assert.equal(portable.selectedId,reply.selectedId);
 let finish;const pending=context.PortableAI.selectRoute(input,{fetchImpl:()=>new Promise(resolve=>finish=resolve)});context.PortableAI.clear();finish(new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(reply)}]}}]})));await assert.rejects(()=>pending);
 checks.push('Portable file-mode comparison uses anonymous contract and rejects responses after key change (isolated JS, not native file browser)');
 const {createApp}=await import(pathToFileURL(path.join(root,'donghaeng-nav/server.mjs')));let mode='ok',calls=0;const key='mock-not-a-real-key';
 const app=createApp({apiKey:key,timeoutMs:20,fetchImpl:async(_url,options)=>{calls++;const request=JSON.parse(options.body),sent=JSON.parse(request.contents[0].parts[0].text);assert.deepEqual(sent,input);assert(request.generationConfig.responseJsonSchema.properties.selectedId.enum.includes(reply.selectedId));
  if(mode==='timeout')return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout')),{once:true}));
  if(mode==='rate')return new Response('{}',{status:429});return new Response(JSON.stringify({candidates:[{content:{parts:[{thought:true,text:'not for display'},{text:JSON.stringify(mode==='bad'?decision(input,'R9'):reply)}]}}]}));}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+app.address().port;
 const post=(body,headers={})=>fetch(url+'/api/select-route',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  let response=await post(input);assert.equal(response.status,200);assert.equal((await response.json()).decision.selectedId,reply.selectedId);
  const start=calls;assert.equal((await post({...input,coordinates:[1,2]})).status,400);assert.equal((await post(input,{Origin:'https://unrelated.invalid'})).status,403);assert.equal(calls,start);
  mode='bad';response=await post(input);assert.equal(response.status,502);assert(!(await response.text()).includes(key));
  mode='rate';assert.equal((await post(input)).status,429);mode='timeout';assert.equal((await post(input)).status,502);
  checks.push('Local route selection API: structured reply, hidden thoughts discarded, privacy/origin rejection, invalid response, quota and timeout');
 }finally{app.closeAllConnections();await new Promise(r=>app.close(r))}
 const result={pass:true,checks,realGemini:false,fieldVerified:false};fs.writeFileSync(path.join(root,'donghaeng-nav/docs/route-choice-core-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
