// Warm-graph attribution on fixed public test points; no provider/GPS calls.
import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createRequire} from 'node:module';
import {loadSnapshot,makeGraph,E} from '../services/expansion/snapshot.mjs';
const require=createRequire(import.meta.url),X=require('../dist/endpoint-routing.js'),C=require('../dist/route-candidates.js');
const reportName=process.argv[2]||'walk-profile-2026-11-13';assert(/^[a-z0-9-]+$/.test(reportName));
const outputUrl=new URL('../docs/'+reportName+'.json',import.meta.url);
try{await access(outputUrl);throw Error('Preserve the previous profile; choose a new report name')}catch(e){if(e.code!=='ENOENT')throw e}
const snapshot=await loadSnapshot(),graph=makeGraph(snapshot),baseline=JSON.parse(await readFile(new URL('../docs/walk-api-local-performance.json',import.meta.url)));
const coordinates=new Map(snapshot.data['bundled-map-data'].elements.filter(n=>n.type==='node').map(n=>[n.id,[n.lat,n.lon]]));
const audit=graph.meta.buildingAudit;let active=null;
graph.meta.buildingAudit={...audit,filterGraph(...args){const t=performance.now();try{return audit.filterGraph(...args)}finally{if(active)active.filterMs+=performance.now()-t}},assess(...args){const t=performance.now();try{return audit.assess(...args)}finally{if(active)active.publicGeometryMs+=performance.now()-t}}};
const engine={...E,nearest(...args){const t=performance.now();try{return E.nearest(...args)}finally{if(active){active.preparationNearestMs+=performance.now()-t;active.preparationNearestCalls++}}},route(...args){const t=performance.now();try{return E.route(...args)}finally{if(active){active.engineMs+=performance.now()-t;active.engineCalls++}}}};
const endpoints={...X,route(...args){const t=performance.now();try{return X.route(...args)}finally{if(active){active.endpointRouteMs+=performance.now()-t;active.endpointRouteCalls++}}}};
const samples=[];
for(const s of baseline.serialSamples.slice(0,12)){
 const [origin,destination]=s.nodeIds.map(id=>coordinates.get(id)),profile={...E.parseState(baseline.profiles[s.profileCase]),atTime:'2026-11-11T10:00:00+09:00'};
 // Warm geometry once, then time two standalone projection scans. This is a
 // direct probe, not an attribution of every private projection in route().
 try{X.nearestSegment(graph,origin,profile);X.nearestSegment(graph,destination,profile)}catch{}
 const projectionAt=performance.now();let projectionState='ok';try{X.nearestSegment(graph,origin,profile);X.nearestSegment(graph,destination,profile)}catch{projectionState='unavailable'}const directProjectionMs=performance.now()-projectionAt;
 active={filterMs:0,publicGeometryMs:0,preparationNearestMs:0,preparationNearestCalls:0,engineMs:0,engineCalls:0,endpointRouteMs:0,endpointRouteCalls:0};const at=performance.now();
 const result=await C.generate(engine,endpoints,graph,origin,destination,profile),elapsed=performance.now()-at,stats=active;active=null;
 assert(result.routes.every(r=>C.eligible(E,r,profile,graph.meta.buildingAudit,origin,destination)));
 const rounded=Object.fromEntries(Object.entries(stats).map(([key,value])=>[key,key.endsWith('Ms')?Math.round(value):value]));
 samples.push({id:s.id,publicNodeIds:s.nodeIds,profileCase:s.profileCase,generatorMs:Math.round(elapsed),directTwoProjectionProbeMs:Math.round(directProjectionMs),projectionState,...rounded,endpointPreparationAndOtherOverheadMs:Math.round(stats.endpointRouteMs-stats.engineMs),candidateCount:result.routes.length,attempts:result.attempts,stopReason:result.diagnostics.stopReason});
 console.log(JSON.stringify(samples.at(-1)));
}
const totals=Object.fromEntries(['generatorMs','engineMs','endpointRouteMs','endpointPreparationAndOtherOverheadMs','preparationNearestMs','preparationNearestCalls','filterMs','publicGeometryMs'].map(key=>[key,samples.reduce((sum,row)=>sum+row[key],0)]));
const report={pass:true,reviewedDateKst:'2026-11-13',scope:'Warm local common engine on twelve fixed public graph pairs/four profiles; nested scopes overlap; standalone projection probe is not a trace of all route-internal projections',datasetVersion:snapshot.datasetVersion,protectedRuntimeCode:snapshot.lock.protected_code,totals,samples,providerCalls:0,fieldVerified:false,productionPerformance:false,citywideRouting:false};
await writeFile(outputUrl,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({pass:true,totals},null,2));
