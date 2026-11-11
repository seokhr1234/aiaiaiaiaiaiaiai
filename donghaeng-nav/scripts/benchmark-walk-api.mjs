// Technical local-worker benchmark. Public graph samples, no user GPS/provider calls.
import assert from 'node:assert/strict';
import {access,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createApp} from '../server.mjs';
import {loadSnapshot,makeGraph,E,F} from '../services/expansion/snapshot.mjs';
const snapshot=await loadSnapshot(),graph=makeGraph(snapshot);
const reportName=process.argv[2]||'walk-api-local-performance';assert(/^[a-z0-9-]+$/.test(reportName),'Use a report basename');
const outputUrl=new URL('../docs/'+reportName+'.json',import.meta.url);
try{await access(outputUrl);throw Error('Preserve the previous measurement; choose a new report basename')}catch(error){if(error.code!=='ENOENT')throw error}
const nodes=[...graph.nodes.values()].filter(n=>graph.main.has(n.id)&&F.inCoverage(n.ll)).sort((a,b)=>a.id-b.id);
let seed=20261111;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32};
const texts=['가장 짧은 거리로 가고 싶어요.','계단을 피하고 싶어요.','중간에 벤치에 앉아서 쉬고 싶어요.','휠체어를 이용해요. 계단은 이용할 수 없어요.'];
const samples=[],seen=new Set();
for(let attempts=0;samples.length<100&&attempts<100000;attempts++){
 const a=nodes[Math.floor(random()*nodes.length)],b=nodes[Math.floor(random()*nodes.length)],gap=E.distance(a.ll,b.ll),key=a.id+':'+b.id;
 if(gap<150||gap>1500||seen.has(key))continue;seen.add(key);
 samples.push({id:samples.length+1,nodeIds:[a.id,b.id],straightLineMeters:Math.round(gap),profileCase:samples.length%4,
  input:{origin:a.ll,destination:b.ll,atTime:'2026-11-11T10:00:00+09:00',profile:E.parseState(texts[samples.length%4])}});
}
assert.equal(samples.length,100);
const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null;
async function request(sample){
 const t=performance.now(),response=await fetch(base+'/api/routes/walk',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample.input)}),value=await response.json();
 const milliseconds=Math.round(performance.now()-t);
 if(response.ok){assert.equal(value.datasetVersion,snapshot.datasetVersion);assert.equal(value.fieldVerified,false);assert(['technical_preview','no_eligible_candidate'].includes(value.state))}
 return {id:sample.id,nodeIds:sample.nodeIds,profileCase:sample.profileCase,straightLineMeters:sample.straightLineMeters,milliseconds,status:response.status,state:value.state||value.code,candidateCount:value.routes?.length||0};
}
try{
 const serial=[];
 for(const sample of samples){serial.push(await request(sample));if(serial.length%10===0)console.log(JSON.stringify({completed:serial.length,of:100,eligible:serial.filter(r=>r.candidateCount>0).length}))}
 const concurrent=await Promise.all(samples.slice(0,10).map(request));
 const eligible=serial.filter(r=>r.status===200&&r.candidateCount>0),noCandidate=serial.filter(r=>r.status===200&&!r.candidateCount);
 const report={pass:serial.length===100&&concurrent.every(r=>[200,429,504].includes(r.status)),reviewedDateKst:'2026-11-11',
  scope:'Existing Wolgok technical preview only; fixed synthetic public graph-node pairs, not Seoul-wide routes or physical passage',
  seed:20261111,profiles:texts,datasetVersion:snapshot.datasetVersion,graphVersion:snapshot.graphHash,protectedRuntimeCode:snapshot.lock.protected_code,
  environment:{node:process.version,server:'loopback Node HTTP; one routing worker; queue capacity 4',parentSnapshot:'loaded to construct fixtures',firstWorkerRequest:'cold worker snapshot; included as serial sample 1',providerCalls:0},
  serial:{requests:100,eligible:eligible.length,noEligibleCandidate:noCandidate.length,errors:serial.filter(r=>r.status!==200).length,
   coldWorkerMs:serial[0].milliseconds,eligibleP50Ms:percentile(eligible.map(r=>r.milliseconds),.5),eligibleP95Ms:percentile(eligible.map(r=>r.milliseconds),.95),eligibleMaxMs:eligible.length?Math.max(...eligible.map(r=>r.milliseconds)):null,
   perProfile:texts.map((text,i)=>({text,requests:serial.filter(r=>r.profileCase===i).length,eligible:eligible.filter(r=>r.profileCase===i).length,noEligibleCandidate:noCandidate.filter(r=>r.profileCase===i).length}))},
  concurrency10:{requests:10,statusCounts:concurrent.reduce((counts,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{}),eligible:concurrent.filter(r=>r.candidateCount>0).length,processedP95Ms:percentile(concurrent.filter(r=>r.status===200).map(r=>r.milliseconds),.95),queueLimitIsNotTenRequestSlo:true},
  serialSamples:serial,concurrentSamples:concurrent,citywideSloVerified:false,productionPerformance:false,physicalPhone:false,fieldVerified:false,actualOdsay:false};
 await writeFile(outputUrl,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 assert(report.pass);console.log(JSON.stringify({pass:report.pass,serial:report.serial,concurrency10:report.concurrency10},null,2));
}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
