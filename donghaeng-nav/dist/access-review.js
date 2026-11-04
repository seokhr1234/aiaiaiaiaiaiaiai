(function(root){'use strict';
// Reported connectivity is a review hypothesis, never a surveyed lift location.
function graphWithReports(E,graph,reports){
 const nodes=new Map([...graph.nodes].map(([id,n])=>[id,{...n,edges:n.edges.slice()}]));
 for(const r of reports){if(r.status!=='user_reported_both_sides'||r.operatingStatus==='closed')continue;
  for(const [i,pair] of r.approachPairs.entries()){
   const a=nodes.get(pair.ground),b=nodes.get(pair.deck);if(!a||!b)continue;
   const key='reported-access:'+r.id+':'+i,meta={key,id:key,name:'육교 승강기 접근 확인 구간',d:E.distance(a.ll,b.ll),steps:false,bridge:true,layer:'review',highway:'footway',incline:null,terrainSlope:null,slopeScreening:{kind:'structure_unresolved',maxPercent:null},accessReport:r.id,approximateConnection:true,terrainReview:{status:'terrain_inapplicable',reasons:['user_reported_vertical_access_not_surveyed']}};
   a.edges.push({...meta,to:b.id});b.edges.push({...meta,to:a.id});
  }
 }
 return {...graph,nodes,meta:{...graph.meta,allowAssistancePreview:false}};
}
function candidate(E,X,graph,origin,destination,p,reports,ceiling=null){
 if(!p.wheelchair||p.rest||!reports.length)return null;
 const g=graphWithReports(E,graph,reports),limit=ceiling==='diagnostic'?Infinity:Math.min(p.maxSlope??5,5);
 // Keep wheelchair exclusions and screening limits even though this diagnostic
 // uses distance/burden comparison instead of the engine's unknown-first order.
 for(const n of g.nodes.values())n.edges=n.edges.filter(e=>{const t=g.nodes.get(e.to)?.tags||{},grade=E.screeningGrade(e);return !e.steps&&e.wheelchair!=='no'&&t.wheelchair!=='no'&&!(['gate','cycle_barrier','bollard'].includes(t.barrier)&&t.wheelchair!=='yes')&&(!Number.isFinite(grade)||grade<=limit)});
 try{
  const options={...p,wheelchair:false,avoidSteps:true,avoidSlope:true,maxSlope:Number.isFinite(limit)?limit:null,short:false,rest:false};
  const trials=[];
  // The user requested a bridge alternative. Use reported facility topology as
  // the review via-point; approach anchors remain explicitly approximate.
  for(const report of reports){const via=g.nodes.get(report.approachPairs[0]?.deck);if(!via)continue;
   const adapter={...E,route:(split,from,to,q)=>{const a=E.route(split,from,via.ll,q),b=E.route(split,via.ll,to,q),edges=[...a.edges,...b.edges];return {...a,ids:[...a.ids,...b.ids.slice(1)],coords:[...a.coords,...b.coords.slice(1)],edges,to:b.to,length:a.length+b.length,totalLength:a.totalLength+b.totalLength,gaps:[a.gaps[0],b.gaps[1]],messages:[...new Set([...a.messages,...b.messages])],unknown:a.unknown+b.unknown,unresolvedSurfaceMeters:a.unresolvedSurfaceMeters+b.unresolvedSurfaceMeters,knownSlopeMeters:a.knownSlopeMeters+b.knownSlopeMeters,terrainSlopeMeters:a.terrainSlopeMeters+b.terrainSlopeMeters,hintAboveLimitMeters:a.hintAboveLimitMeters+b.hintAboveLimitMeters,riskSegments:[...a.riskSegments,...b.riskSegments],screeningMeters:Object.fromEntries(Object.keys(a.screeningMeters).map(k=>[k,a.screeningMeters[k]+b.screeningMeters[k]])),slopeEvidence:E.slopeSummary(edges),maxEstimatedSlope:Math.max(a.maxEstimatedSlope??0,b.maxEstimatedSlope??0),restStop:null}}};
   try{trials.push(X.route(adapter,g,origin,destination,options))}catch{}
  }
  trials.sort((a,b)=>a.totalLength-b.totalLength);const route=trials[0];if(!route)return null;
  if(new Set(route.edges.filter(e=>e.accessReport).map(e=>e.key)).size<2)return null;
  route.assistancePreview=true;route.accessReview=true;route.assistanceCeiling=null;route.wheelchairPassability='unverified';
  route.messages.unshift('사용자가 양쪽 승강기 존재를 확인한 육교 이용 검토 대안입니다. 점선은 기존 지도 접근 지점을 잇는 연결 가설이며 승강기 문 위치가 아닙니다. 승강기 문·보도 접속·운행·상판 경사 확인 전 GPS 안내는 제한합니다.');
  route.reviewMaxScreening=Math.max(...route.edges.map(E.screeningGrade).filter(Number.isFinite));
  route.reviewAboveLimitMeters=route.edges.filter(e=>E.screeningGrade(e)>Math.min(p.maxSlope??5,5)).reduce((sum,e)=>sum+e.d,0);
  route.messages.push('등록 계단·휠체어 통행 불가 표시는 제외했습니다. 지형 추정 상단 '+route.reviewMaxScreening.toFixed(2)+'%, 참고 상한을 넘는 추정 구간 약 '+Math.round(route.reviewAboveLimitMeters)+'m. 이용 경험 제보와 지형 추정이 다르며, 실측 노면 경사·승강기 운행은 확인되지 않았습니다.');
  return route;
 }catch{return null}
}
const api={graphWithReports,candidate};if(typeof module!=='undefined')module.exports=api;else root.AccessReview=api;
})(typeof globalThis==='undefined'?this:globalThis);
