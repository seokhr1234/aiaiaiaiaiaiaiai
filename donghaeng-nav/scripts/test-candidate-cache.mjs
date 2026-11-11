import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {promisify} from 'node:util';
import {loadSnapshot,makeGraph,E,F} from '../services/expansion/snapshot.mjs';
const require=createRequire(new URL('../dist/route-candidates.js',import.meta.url)),Current=require('./route-candidates.js'),Endpoint=require('./endpoint-routing.js');
const baseline='5d28dcc8875e08770fd9dba8b0780557b5f11f29';
const {stdout:code}=await promisify(execFile)('git',['show',baseline+':donghaeng-nav/dist/route-candidates.js'],{encoding:'utf8'});
const context={module:{exports:{}},require,setTimeout,clearTimeout,Date,DOMException};
vm.runInNewContext(code,context);const Previous=context.module.exports;
const snapshot=await loadSnapshot(),graph=makeGraph(snapshot);
const samples=JSON.parse(await readFile(new URL('../docs/walk-api-local-performance.json',import.meta.url))),raw=snapshot.data['bundled-map-data'].elements;
const byId=new Map(raw.filter(e=>e.type==='node').map(n=>[n.id,[n.lat,n.lon]]));
const fingerprint=()=>createHash('sha256').update(JSON.stringify([...graph.nodes])).digest('hex');
const before=fingerprint(),checks=[];
function signatures(result){return JSON.parse(JSON.stringify({routes:result.routes.map(r=>({candidateId:r.candidateId,ids:r.ids,keys:r.edges.map(e=>[e.id,e.key,e.parentKey||null]),selectionMetrics:r.selectionMetrics,restStop:r.restStop||null,endpointProjection:r.endpointProjection,assistancePreview:!!r.assistancePreview})),attempts:result.attempts,diagnostics:result.diagnostics,error:result.error||null}))}
// No wall-clock cutoff during equivalence: faster code may legitimately find
// more alternatives within the production time budget.
for(const row of samples.serialSamples.slice(0,12)){
 const [origin,destination]=row.nodeIds.map(id=>byId.get(id));assert(F.inCoverage(origin)&&F.inCoverage(destination));
 const profile={...E.parseState(samples.profiles[row.profileCase]),atTime:'2026-11-11T10:00:00+09:00'};
 const options={maxAttempts:3,timeBudgetMs:60000};
 const previous=await Previous.generate(E,Endpoint,graph,origin,destination,profile,options),current=await Current.generate(E,Endpoint,graph,origin,destination,profile,options);
 assert.deepEqual(signatures(current),signatures(previous));
 for(const route of current.routes){assert(!route.assistancePreview);assert(Current.eligible(E,route,profile,graph.meta.buildingAudit,origin,destination))}
}
assert.equal(fingerprint(),before);checks.push('Twelve fixed real-graph pairs across four profiles match the previous candidate IDs, edges, metrics, rest/endpoints and diagnostics under equal attempt budgets');
// Exercise callers that allow risk previews: candidate generation must still
// force them off and must not mutate the caller policy.
const sample=samples.serialSamples.find(s=>s.profileCase===3),[origin,destination]=sample.nodeIds.map(id=>byId.get(id));
const relaxed={...graph,meta:{...graph.meta,allowAssistancePreview:true}},profile=E.parseState(samples.profiles[3]);
const result=await Current.generate(E,Endpoint,relaxed,origin,destination,profile,{maxAttempts:2,timeBudgetMs:60000});assert.equal(relaxed.meta.allowAssistancePreview,true);assert(result.routes.every(r=>!r.assistancePreview&&Current.eligible(E,r,profile,graph.meta.buildingAudit,origin,destination)));assert.equal(fingerprint(),before);
checks.push('Input graph nodes/edge metadata remain byte-identical; callers allowing previews are still isolated and no assistance candidate becomes eligible');
const report={pass:true,baselineCommit:baseline,checks,fieldVerified:false,actualProviderCalls:0};await writeFile(new URL('../docs/candidate-cache-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
