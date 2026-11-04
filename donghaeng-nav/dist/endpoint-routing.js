(function(root){'use strict';
const P=typeof module!=='undefined'?require('./navigation-plan.js'):root.NavigationPlan;
function forbidden(node,profile){const t=node.tags||{};return ['no','private'].includes(t.access)||['wall','fence','stile','turnstile'].includes(t.barrier)||profile.wheelchair&&(t.wheelchair==='no'||['gate','cycle_barrier','bollard'].includes(t.barrier)&&t.wheelchair!=='yes')}
function nearestSegment(graph,ll,profile={}){
 if(graph.meta?.buildingAudit)graph=graph.meta.buildingAudit.filterGraph(graph);
 const seen=new Set(),candidates=[];
 for(const node of graph.nodes.values())for(const edge of node.edges){if(seen.has(edge.key)||!graph.main.has(node.id))continue;seen.add(edge.key);const end=graph.nodes.get(edge.to);if(!end||!graph.main.has(end.id)||forbidden(node,profile)||forbidden(end,profile))continue;
  if(profile.avoidSteps&&edge.steps||profile.wheelchair&&(edge.steps||edge.wheelchair==='no'))continue;
  // A 2D request cannot choose a bridge, tunnel or indoor level automatically.
  if(edge.bridge||edge.tunnel||String(edge.layer??'0')!=='0'||edge.indoor&&edge.indoor!=='no'||edge.level&&!['0','0;0'].includes(String(edge.level))||edge.location&&!['surface','outdoor','overground'].includes(edge.location))continue;
  candidates.push({node,end,edge,...P.project(ll,node.ll,end.ll)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);const best=candidates[0];
 if(!best||best.distance>180)throw Error('출발·도착 근처의 지상 도로 연결을 찾지 못했어요. 지도에서 위치를 확인해 주세요.');
 const ambiguous=candidates.find(c=>c.edge.id!==best.edge.id&&c.distance-best.distance<3&&P.distance(c.ll,best.ll)>4);
 if(ambiguous)throw Error('가까운 평행 도로의 연결을 확정하기 어려워요. 지도에서 보행 위치를 더 정확히 지정해 주세요.');
 return best;
}
function arrivalNear(graph,ll){const s=nearestSegment(graph,ll);return {ll:s.ll,referenceGap:s.distance,wayId:s.edge.id,roadName:s.edge.name,fieldVerified:false,notice:'등록 도로 선분 위 도착 기준점 · 실제 보도·출입구 미확인'}}
function route(E,graph,origin,destination,profile,{penalty,excludedKeys}={}){
 if(graph.meta?.buildingAudit)graph=graph.meta.buildingAudit.filterGraph(graph);
 const first=nearestSegment(graph,origin,profile),last=nearestSegment(graph,destination,profile),nodes=new Map(graph.nodes),main=new Set(graph.main),groups=new Map();let serial=0;
 for(const s of [first,last]){s.id='endpoint-projection-'+(++serial);while(nodes.has(s.id))s.id+='-';nodes.set(s.id,{id:s.id,ll:s.ll,tags:{},edges:[]});main.add(s.id);if(!groups.has(s.edge.key))groups.set(s.edge.key,[]);groups.get(s.edge.key).push(s)}
 const writable=new Set();function edit(id){if(!writable.has(id)){const n=nodes.get(id);nodes.set(id,{...n,edges:n.edges.slice()});writable.add(id)}return nodes.get(id)}
 for(const group of groups.values()){
  const base=group[0],forward=base.edge,reverse=base.end.edges.find(e=>e.to===base.node.id&&e.key===forward.key);if(!reverse)throw Error('도로 연결 방향을 확인하지 못했어요.');
  const points=[{id:base.node.id,t:0},{id:base.end.id,t:1},...group.map(s=>({id:s.id,t:s.node.id===base.node.id?s.t:1-s.t}))].sort((a,b)=>a.t-b.t);
  edit(base.node.id).edges=edit(base.node.id).edges.filter(e=>!(e.key===forward.key&&e.to===base.end.id));edit(base.end.id).edges=edit(base.end.id).edges.filter(e=>!(e.key===forward.key&&e.to===base.node.id));
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=forward.d*(b.t-a.t);edit(a.id).edges.push({...forward,to:b.id,d,parentKey:forward.key});edit(b.id).edges.push({...reverse,to:a.id,d,parentKey:forward.key})}
 }
 // Exclusions apply after projecting the same endpoints, in both directions.
 // A candidate search must not silently snap onto a different parallel road.
 if(excludedKeys?.size)for(const [id,node] of nodes){const edges=node.edges.filter(e=>!excludedKeys.has(e.parentKey||e.key));if(edges.length!==node.edges.length)nodes.set(id,{...node,edges})}
 let internal=profile;if(profile.rest&&profile.restMinutes){const budget=profile.restMinutes-first.distance/(profile.speed||65);if(budget<=0)throw Error('출발 연결만으로 요청한 첫 휴식 간격을 넘어요. 출발 위치를 확인해 주세요.');internal={...profile,restMinutes:budget}}const working={...graph,nodes,main};if(profile.rest&&graph.meta?.buildingAudit){const eligible=place=>{const near=E.nearest(working,place.ll,profile);return near&&graph.meta.buildingAudit.assess(near.node.ll,place.ll).status!=='building_overlap'};working.benches=(graph.benches||[]).filter(eligible);if(graph.restPlaces)working.restPlaces=graph.restPlaces.filter(eligible)}const result=E.route(working,first.ll,last.ll,internal,penalty),gaps=[first.distance,last.distance];if(result.restStop)result.restStop.firstDistance+=first.distance;
 result.gaps=gaps;result.totalLength=result.length+gaps[0]+gaps[1]+(result.restStop?2*result.restStop.gap:0);result.minutes=Math.max(1,Math.ceil(result.totalLength/(profile.speed||65)));result.endpointProjection={version:1,origin:{ll:first.ll,gap:first.distance,wayId:first.edge.id},destination:{ll:last.ll,gap:last.distance,wayId:last.edge.id},fieldVerified:false};
 return result;
}
const api={nearestSegment,arrivalNear,route};if(typeof module!=='undefined')module.exports=api;else root.EndpointRouting=api;
})(typeof globalThis==='undefined'?this:globalThis);
