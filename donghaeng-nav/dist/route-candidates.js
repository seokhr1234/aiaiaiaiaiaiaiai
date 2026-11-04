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
function overlap(a,b){const lengths=new Map();for(const e of a.edges){const k=e.parentKey||e.key;lengths.set(k,(lengths.get(k)||0)+e.d)}let shared=0;for(const e of b.edges){const k=e.parentKey||e.key,n=lengths.get(k)||0,d=Math.min(n,e.d);shared+=d;lengths.set(k,n-d)}return shared/Math.max(a.length,b.length,1)}
async function generate(E,X,graph,origin,destination,p,{signal,maxAttempts=10,maxCandidates=5,timeBudgetMs=3000,onProgress=()=>{}}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const profile=E.wheelchairProfile(p),working={...graph,meta:{...graph.meta,allowAssistancePreview:false}},pool=[],all=[],started=Date.now();let attempts=0;
 const audit=graph.meta?.buildingAudit;
 function acceptable(r){return eligible(E,r,profile,audit,origin,destination);}
 function add(r,label){r={...r,p:{...profile},variantLabel:label};all.push(r);if(!acceptable(r))return;const m=metrics(E,r);r.selectionMetrics=m;if(pool.some(x=>overlap(x,r)>.9))return;pool.push(r)}
 let base;
 try{attempts++;base=X.route(E,working,origin,destination,profile);add(base,'기본 후보')}catch(error){if(error instanceof ReferenceError||error instanceof TypeError)throw error;if(signal?.aborted)throw new DOMException('Aborted','AbortError');return {routes:[],attempts,error:error.message};}
 const penaltyMap=(edges,factor=2.8)=>new Map(edges.map(e=>[e.key,factor]));
 const plans=[['경사 부담 우선',penaltyMap(base.edges.filter(e=>E.screeningGrade(e)>2))],['미확인 구간 최소화',penaltyMap(base.edges.filter(e=>E.slopeOf(e)===null||E.unresolvedSurfaceMeters(e)>0))],... [2.8,8,16].map(factor=>['다른 도로 연결',penaltyMap(base.edges,factor)])];
 const seen=new Set();
 while(attempts<maxAttempts&&Date.now()-started<timeBudgetMs){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const plan=plans.shift();if(!plan)break;const [label,penalty]=plan,token=[...penalty].sort().join('|');if(!penalty.size||seen.has(token))continue;seen.add(token);
  onProgress(attempts);await new Promise(resolve=>setTimeout(resolve,0));if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  attempts++;
  try{const r=X.route(E,working,origin,destination,profile,{penalty});const previous=all.length;add(r,label);if(attempts<maxAttempts&&all.length>previous){const cumulative=new Map(penalty);const factor=Math.max(...penalty.values());r.edges.forEach(e=>cumulative.set(e.key,factor));plans.push(['다른 연결 후보',cumulative]);}}
  catch{/* A constrained alternative may not exist. Never relax the profile. */}
 }
 const score=r=>[profile.wheelchair?r.selectionMetrics.unresolvedMeters:0,r.edges.reduce((total,e)=>total+E.cost(e,profile),0),r.totalLength];
 pool.sort((a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0});
 const dimensions=r=>[r.selectionMetrics.distanceMeters,r.selectionMetrics.maxReferenceSlope??Infinity,r.selectionMetrics.above3Meters,r.selectionMetrics.unknownMeters,r.selectionMetrics.unresolvedMeters,r.selectionMetrics.connectionMeters];
 const frontier=pool.filter(r=>!pool.some(other=>{if(other===r)return false;const a=dimensions(other),b=dimensions(r);return a.every((v,i)=>v<=b[i])&&a.some((v,i)=>v<b[i]);}));
 return {routes:frontier.slice(0,maxCandidates).map((r,i)=>({...r,candidateId:'R'+(i+1)})),attempts};
}
return {generate,metrics,eligible,overlap};
});
