(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(root);else root.RouteCandidates=factory(root)})(globalThis,function(root){
'use strict';
const round=n=>Math.round(n*10)/10;
const Connections=typeof module==='object'&&module.exports?require('./precision-connections.js'):null;
function metrics(E,r){
 const total=r.totalLength??r.length,finite=r.edges.map(E.screeningGrade).filter(Number.isFinite);
 const sum=fn=>round(r.edges.reduce((s,e)=>s+(fn(e)?e.d:0),0));
 return {distanceMeters:round(total),minutes:Math.max(1,Math.ceil(total/(r.p?.speed||65))),maxReferenceSlope:finite.length?round(Math.max(...finite)):null,above3Meters:sum(e=>E.screeningGrade(e)>3),unknownMeters:sum(e=>E.slopeOf(e)===null),unresolvedMeters:round(r.edges.reduce((s,e)=>s+E.unresolvedSurfaceMeters(e),0)),stairsMeters:sum(e=>e.steps),roughMeters:sum(e=>e.rough),connectionMeters:round((r.gaps||[0,0]).reduce((a,b)=>a+b,0)+(r.restStop?2*r.restStop.gap:0)),restFulfilled:!!r.restStop,fieldVerified:false};
}
function eligible(E,r,p,audit,origin,destination){
 if(r.assistancePreview||r.accessReview||!r.edges?.length)return false;
 const profile=E.wheelchairProfile(p),limit=profile.maxSlope;
 if(r.edges.some(e=>(profile.avoidSteps||profile.wheelchair)&&e.steps||profile.wheelchair&&e.wheelchair==='no'||limit!=null&&E.screeningGrade(e)!=null&&E.screeningGrade(e)>limit))return false;
 if(profile.rest&&(!r.restStop||profile.restKind==='bench'&&r.restStop.kind==='shelter'||profile.restKind==='shelter'&&r.restStop.kind!=='shelter'))return false;
 if(audit){const review=(Connections||root.PrecisionConnections).routeReview(audit,r,origin,destination);if(review?.needsGeometryReview)return false;}
 return true;
}
function overlap(a,b){const lengths=new Map();for(const e of a.edges){const k=e.parentKey||e.key;lengths.set(k,(lengths.get(k)||0)+e.d)}let shared=0;for(const e of b.edges){const k=e.parentKey||e.key,n=lengths.get(k)||0,d=Math.min(n,e.d);shared+=d;lengths.set(k,n-d)}return shared/Math.max(Math.min(a.length,b.length),1)}
const dimensions=r=>{const m=r.selectionMetrics;return [m.distanceMeters,m.maxReferenceSlope??Infinity,m.above3Meters,m.unknownMeters,m.unresolvedMeters,m.stairsMeters,m.roughMeters,m.connectionMeters]};
function dominates(a,b){const x=dimensions(a),y=dimensions(b);return x.every((v,i)=>v<=y[i])&&x.some((v,i)=>v<y[i])}
// Sample the route by distance rather than by the number of tiny OSM segments.
function sections(r,count=5){const groups=Array.from({length:count},()=>[]);let distance=0;for(const e of r.edges){groups[Math.min(count-1,Math.floor((distance+e.d/2)/Math.max(r.length,1)*count))].push(e);distance+=e.d}return groups.filter(g=>g.length)}
function branchKeys(graph,r){
 const endpoints=new Set([r.edges[0]?.key,r.edges.at(-1)?.key]),items=[];let distance=0;
 r.edges.forEach((e,i)=>{distance+=e.d;const key=e.parentKey||e.key;const branching=[r.ids[i],r.ids[i+1]].some(id=>new Set((graph.nodes.get(id)?.edges||[]).map(x=>x.to)).size>2);if(!endpoints.has(key)&&branching&&!items.some(x=>x.key===key))items.push({key,position:(distance-e.d/2)/Math.max(r.length,1)})});
 const selected=[];for(const target of [.5,.25,.75,.1,.9,.4,.6]){const item=items.filter(x=>!selected.includes(x.key)).sort((a,b)=>Math.abs(a.position-target)-Math.abs(b.position-target))[0];if(item)selected.push(item.key)}return selected;
}
async function generate(E,X,graph,origin,destination,p,{signal,maxAttempts=24,maxCandidates=5,timeBudgetMs=4000,onProgress=()=>{}}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 // Server snapshots already prohibit assistance previews. Preserve their graph
 // identity so the building audit can reuse its cached filtered geometry.
 const profile=E.wheelchairProfile(p),working=graph.meta?.allowAssistancePreview===false?graph:{...graph,meta:{...graph.meta,allowAssistancePreview:false}},pool=[],started=Date.now();let attempts=0;
 const diagnostics={successful:0,ineligible:0,duplicates:0,noPath:0,distinct:0,excessiveDetours:0,stopReason:null};
 function add(r,label){
  diagnostics.successful++;r={...r,p:{...profile},variantLabel:label};
  if(!eligible(E,r,profile,graph.meta?.buildingAudit,origin,destination)){diagnostics.ineligible++;return false}
  r.selectionMetrics=metrics(E,r);
  if(pool.some(x=>overlap(x,r)>.9)){diagnostics.duplicates++;return false}pool.push(r);return true;
 }
 const unexpected=error=>error instanceof ReferenceError||error instanceof TypeError;
 let base;
 try{attempts++;base=X.route(E,working,origin,destination,profile);add(base,'기본 후보')}catch(error){if(unexpected(error))throw error;if(signal?.aborted)throw new DOMException('Aborted','AbortError');diagnostics.noPath++;diagnostics.stopReason='no-connected-route';return {routes:[],attempts,error:error.message,diagnostics};}
 const penaltyMap=(edges,factor=2.8)=>new Map(edges.map(e=>[e.parentKey||e.key,factor]));
 const cuts=branchKeys(graph,base).map(key=>({label:'다른 갈림길',excludedKeys:new Set([key])}));
 const targeted=sections(base).map(edges=>({label:'다른 구간 연결',penalty:penaltyMap(edges,16)}));
 const plans=[
  {label:'경사 부담 우선',penalty:penaltyMap(base.edges.filter(e=>E.screeningGrade(e)>2))},
  {label:'미확인 구간 최소화',penalty:penaltyMap(base.edges.filter(e=>E.slopeOf(e)===null||E.unresolvedSurfaceMeters(e)>0))},
  ...cuts.slice(0,3),...targeted,
  ...[2.8,8,16].map(factor=>({label:'다른 도로 연결',penalty:penaltyMap(base.edges,factor)})),...cuts.slice(3)
 ];
 const seen=new Set();
 while(plans.length&&attempts<maxAttempts&&Date.now()-started<timeBudgetMs&&pool.length<8){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const plan=plans.shift(),{label,penalty,excludedKeys}=plan;
  const token=excludedKeys?'exclude:'+[...excludedKeys].sort().join('|'):'penalty:'+JSON.stringify([...penalty].sort());
  if(!(excludedKeys?.size||penalty?.size)||seen.has(token))continue;seen.add(token);
  onProgress(attempts);await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(Date.now()-started>=timeBudgetMs)break;
  attempts++;
  try{
   const r=X.route(E,working,origin,destination,profile,{penalty,excludedKeys});
   if(add(r,label)){
    // An alternative can expose a branch absent from the initial route.
    for(const key of branchKeys(graph,r).slice(0,2))plans.push({label:'다른 갈림길',excludedKeys:new Set([key])});
    if(penalty){const cumulative=new Map(penalty);r.edges.forEach(e=>cumulative.set(e.parentKey||e.key,8));plans.push({label:'다른 연결 후보',penalty:cumulative})}
   }
  }catch(error){if(unexpected(error))throw error;diagnostics.noPath++;}
 }
 const score=r=>[profile.wheelchair?r.selectionMetrics.unresolvedMeters:0,r.edges.reduce((total,e)=>total+E.cost(e,profile),0),r.totalLength];
 const compare=(a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0};pool.sort(compare);
 // Keep geographically different backups even if all measured figures are a
 // little worse. Missing curb/access evidence is not captured by those figures.
 // Remove only substantially longer alternatives with no measured benefit.
 const useful=pool.filter(r=>!pool.some(other=>other!==r&&r.selectionMetrics.distanceMeters>other.selectionMetrics.distanceMeters*1.5+100&&dominates(other,r)));
 diagnostics.distinct=pool.length;diagnostics.excessiveDetours=pool.length-useful.length;
 diagnostics.stopReason=pool.length>=8?'candidate-pool':Date.now()-started>=timeBudgetMs?'time-budget':attempts>=maxAttempts?'attempt-limit':'plans-exhausted';
 const frontier=useful.filter(r=>!useful.some(other=>other!==r&&dominates(other,r)));
 const backups=useful.filter(r=>!frontier.includes(r));
 const chosen=[...frontier,...backups].slice(0,Math.max(1,Math.min(5,maxCandidates))).sort(compare);
 return {routes:chosen.map((r,i)=>({...r,candidateId:'R'+(i+1)})),attempts,diagnostics};
}
return {generate,metrics,eligible,overlap};
});
