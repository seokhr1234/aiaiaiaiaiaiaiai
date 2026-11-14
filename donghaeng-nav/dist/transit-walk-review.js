(function(root){'use strict';
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const same=(a,b)=>point(a)&&point(b)&&a.every((v,i)=>v===b[i]);
const profileKeys=['wheelchair','avoidSteps','avoidSlope','rest','short','restKind','restMinutes','maxSlope','speed'];
const finite=v=>Number.isFinite(v)&&v>=0;
function request(candidate,profile,context){
 if(!point(context?.origin)||!point(context?.destination)||!Number.isFinite(Date.parse(context?.atTime)))throw Error('출발·도착과 조회 시각을 다시 확인해 주세요.');
 return {origin:[...context.origin],destination:[...context.destination],profile:{...profile},atTime:context.atTime,candidate:{id:candidate.id,legs:candidate.legs.map(l=>({id:l.id,mode:l.mode,from:[...l.from],to:[...l.to],providerMinutes:l.providerMinutes}))}};
}
function validate(data,input){
 const invalid=()=>{throw Error('도보 검토 결과를 확인하지 못했어요. 다시 계산해 주세요.')};
 if(data?.schema!=='donghaeng-transit-walk-review-v1'||data.state!=='review_only'||data.candidateId!==input.candidate.id
  ||!same(data.origin,input.origin)||!same(data.destination,input.destination)||data.requestedAtTime!==input.atTime
  ||data.referenceSource!=='client_supplied_provider_reference_points'
  ||['stopMappingVerified','timetableVerified','accessibilityVerified','restVerified','fieldVerified'].some(k=>data[k]!==false)
  ||profileKeys.some(k=>input.profile[k]!==undefined&&data.profile?.[k]!==input.profile[k])
  ||!Array.isArray(data.walkingLegs)||data.walkingLegs.length<2||data.walkingLegs.length>7)invalid();
 const vehicles=input.candidate.legs.filter(l=>l.mode!=='walk');if(data.walkingLegs.length!==vehicles.length+1)invalid();
 let points=0,calculated=0,minutes=0;
 for(const [i,leg] of data.walkingLegs.entries()){
  const from=i?vehicles[i-1].to:input.origin,to=i===vehicles.length?input.destination:vehicles[i].from;
  if(leg.id!=='W'+(i+1)||leg.role!==(i===0?'access':i===vehicles.length?'egress':'transfer')||!same(leg.from,from)||!same(leg.to,to)
   ||leg.endpointMappingVerified!==false||!['reference_route','unresolved'].includes(leg.state)
   ||leg.providerMinutes!=null&&!finite(leg.providerMinutes))invalid();
  if(leg.state==='unresolved'){if(leg.route)invalid();continue}
  // Never accept an outdoor route as a subway/indoor transfer connection.
  if(leg.role==='transfer'&&[vehicles[i-1].mode,vehicles[i].mode].includes('subway'))invalid();
  const r=leg.route;
  if(r?.schema!=='donghaeng-city-walk-v1'||r.state!=='reference_route'||!same(r.origin,from)||!same(r.destination,to)
   ||['fieldVerified','accessibilityVerified','endpointConnectionsVerified','restVerified'].some(k=>r[k]!==false)
   ||profileKeys.some(k=>input.profile[k]!==undefined&&r.profile?.[k]!==input.profile[k])
   ||!finite(r.minutes)||!finite(r.distanceMeters)||r.distanceMeters===0||!finite(r.unknownInclineMeters)||!finite(r.stepsMeters)
   ||!Array.isArray(r.coordinates)||r.coordinates.length<2||r.coordinates.length>4000||!r.coordinates.every(point)
   ||!Array.isArray(r.sourceNodeIds)||r.sourceNodeIds.length!==r.coordinates.length
   ||!Array.isArray(r.sourceSegments)||r.sourceSegments.length!==r.coordinates.length-1
   ||!Array.isArray(r.endpointGaps)||r.endpointGaps.length!==2||r.endpointGaps.some(v=>!finite(v)||v>80)
   ||r.sourceMetadata?.source_crs!=='EPSG:4326'||typeof r.datasetVersion!=='string')invalid();
  points+=r.coordinates.length;calculated++;minutes+=r.minutes;
 }
 const s=data.summary;if(points>12000||s?.total!==data.walkingLegs.length||s.calculated!==calculated||s.unresolved!==s.total-calculated
  ||s.estimatedWalkingMinutes!==(calculated===s.total?minutes:null))invalid();return data;
}
function create({map,input,fitBounds,cached,onResult=()=>{},fetchImpl=root.fetch.bind(root)}){
 const doc=root.document,el=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e};
 const box=el('section',null,'transit-walk-review'),heading=el('h4','도보 구간 참고 계산'),note=el('p','같은 이동 조건으로 등록 도로를 계산합니다. 대중교통을 다시 조회하지 않아요. 실제 출입구·역내 이동과 환승 가능 여부는 미확인입니다.','gap-note');
 const run=el('button','도보 구간 참고 계산','secondary'),cancel=el('button','도보 계산 취소','secondary'),fit=el('button','계산한 도보 구간 보기','secondary');
 for(const b of [run,cancel,fit])b.type='button';cancel.hidden=true;fit.hidden=true;
 const status=el('p','계산 전 · 업체 도보 시간과 실제 등록 도로의 계산은 다를 수 있어요.','gap-note'),details=el('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 box.append(heading,note,run,cancel,fit,status,details);
 const L=root.L,layer=L.layerGroup().addTo(map);let controller=null,destroyed=false,coordinates=[];
 function display(data){
  validate(data,input);layer.clearLayers();details.replaceChildren();coordinates=[];
  status.textContent='등록 도로 계산 '+data.summary.calculated+'/'+data.summary.total+'구간 · 계산 보류 '+data.summary.unresolved+'구간 · 전체 여정 시간은 미확인';
  for(const leg of data.walkingLegs){const item=el('div',null,'transit-walk-leg'),label={access:'출발지 → 첫 승차 참고점',transfer:'환승 참고점 사이',egress:'마지막 하차 참고점 → 목적지'}[leg.role];item.append(el('b',leg.id+' · '+label));
   if(leg.route){const r=leg.route;item.append(el('p',Math.round(r.distanceMeters).toLocaleString()+'m · 등록 도로 약 '+r.minutes+'분'+(leg.providerMinutes==null?' · 업체 도보 시간 미확인':' · 업체 도보 '+leg.providerMinutes+'분')),
    el('p','핀과 등록 도로 사이 약 '+r.endpointGaps.map(Math.round).join('m / ')+'m · 이 접속은 미확인','gap-note'),
    el('p','경사 미등록 '+Math.round(r.unknownInclineMeters).toLocaleString()+'m · 실제 보도·턱·폭·출입구·휴식은 미확인','gap-note'));
    const source=el('details'),summary=el('summary','도보 자료 출처·기준일');source.append(summary,el('p','OpenStreetMap · '+(r.sourceMetadata.license||'ODbL-1.0')+' · 자료 기준 '+(r.sourceMetadata.source_as_of||'미확인')+' · 수집 '+(r.sourceMetadata.collected_date||'미확인')+' · EPSG:4326 · 현장 미검증','gap-note'));item.append(source);
    L.polyline(r.coordinates,{color:'#486e8c',weight:5,opacity:.9,dashArray:'5 7',interactive:false}).addTo(layer);coordinates.push(...r.coordinates);
   }else item.append(el('p',leg.notice||'이 구간의 보행 연결은 미확인입니다.','gap-note'));
   details.append(item);
  }
  if(coordinates.length)details.append(el('p','파란 점선은 등록 도로의 도보 참고 계산입니다. 핀까지의 빈 구간과 버스·지하철 경로선은 추측해 연결하지 않았어요.','gap-note'));
  fit.hidden=!coordinates.length;run.textContent='도보 구간 다시 계산';
 }
 function stop(message){if(controller){controller.abort();controller=null}run.disabled=false;cancel.hidden=true;box.removeAttribute('aria-busy');if(message)status.textContent=message}
 run.onclick=async()=>{stop();const current=new AbortController();controller=current;run.disabled=true;cancel.hidden=false;box.setAttribute('aria-busy','true');status.textContent='등록 도로에서 도보 구간을 계산하고 있어요…';const timer=setTimeout(()=>current.abort(),18000);
  try{const response=await fetchImpl('/api/transit/walk-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:current.signal}),data=await response.json();if(destroyed||controller!==current)return;if(!response.ok)throw Error(data.error||'도보 참고 계산에 실패했어요.');validate(data,input);onResult(data);display(data)}
  catch(e){if(!destroyed&&controller===current)status.textContent=e.name==='AbortError'?'도보 계산을 취소했거나 시간이 초과됐어요.':e.message}
  finally{clearTimeout(timer);if(controller===current)stop()}
 };
 cancel.onclick=()=>stop('도보 참고 계산을 취소했어요.');fit.onclick=()=>{if(coordinates.length)fitBounds(L.latLngBounds(coordinates))};
 if(cached)display(cached);
 return {element:box,destroy(){destroyed=true;stop();layer.remove()}};
}
const api={request,validate,create};if(typeof module!=='undefined')module.exports=api;else root.TransitWalkReview=api;
})(typeof globalThis==='undefined'?this:globalThis);
