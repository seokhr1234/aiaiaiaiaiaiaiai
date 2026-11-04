(function(root){'use strict';const Plan=typeof module!=='undefined'?require('./navigation-plan.js'):root.NavigationPlan,Endpoint=typeof module!=='undefined'?require('./endpoint-routing.js'):root.EndpointRouting;
function fromFix(E,graph,fix,destination,profile,{restOutcome,unavailableRestIds=[],previousLayer=null}={}){
 const candidates=[],seen=new Set();
 for(const node of graph.nodes.values())for(const edge of node.edges){if(seen.has(edge.key))continue;seen.add(edge.key);const end=graph.nodes.get(edge.to);if(!end||!graph.main.has(node.id)||!graph.main.has(end.id))continue;
  if(profile.avoidSteps&&edge.steps||profile.wheelchair&&(edge.steps||edge.wheelchair==='no'))continue;
  if(profile.maxSlope!=null&&E.screeningGrade(edge)>profile.maxSlope)continue;
  const tags=[node.tags||{},end.tags||{}];if(tags.some(t=>['no','private'].includes(t.access)||['wall','fence','stile','turnstile'].includes(t.barrier)||profile.wheelchair&&['cycle_barrier','bollard','gate'].includes(t.barrier)&&t.wheelchair!=='yes'))continue;
  if(edge.indoor&&edge.indoor!=='no'||edge.location&&!['surface','outdoor','overground'].includes(edge.location)||edge.level&&String(edge.level)!=='0')continue;
  const layer=Plan.layer(edge);if(previousLayer&&layer!==previousLayer||!previousLayer&&(edge.bridge||edge.tunnel||String(edge.layer??'0')!=='0'))continue;
  const p=Plan.project(fix.ll,node.ll,end.ll);candidates.push({...p,node,end,edge,layer});
 }
 candidates.sort((a,b)=>a.distance-b.distance);const best=candidates[0];if(!best||best.distance>Math.min(20,Math.max(8,fix.accuracy)))throw Error('현재 위치에서 확인 가능한 보행 연결을 찾지 못했어요.');
 const alternate=candidates.find(c=>c.edge.id!==best.edge.id&&c.distance-best.distance<3&&Plan.distance(c.ll,best.ll)>4);if(alternate)throw Error('가까운 평행 경로를 확정할 수 없어요. 위치를 보정해 주세요.');
 const id='navigation-start',nodes=new Map(graph.nodes),main=new Set(graph.main);main.add(id);
 const reverse=best.end.edges.find(e=>e.to===best.node.id&&e.key===best.edge.key);if(!reverse)throw Error('보행 연결 방향을 확인할 수 없어요.');
 const full=Plan.distance(best.node.ll,best.end.ll),d1=full*best.t,d2=full*(1-best.t);
 nodes.set(id,{id,ll:best.ll,tags:{},edges:[{...reverse,to:best.node.id,d:d1},{...best.edge,to:best.end.id,d:d2}]});
 nodes.set(best.node.id,{...best.node,edges:[...best.node.edges,{...best.edge,to:id,d:d1}]});
 nodes.set(best.end.id,{...best.end,edges:[...best.end.edges,{...reverse,to:id,d:d2}]});
 const completed=restOutcome==='completed',pool=(graph.restPlaces||graph.benches||[]).filter(p=>!unavailableRestIds.includes(p.id));
 // Only the already completed waypoint is omitted; the user's profile remains intact.
 const internal=completed?{...profile,rest:false}:{...profile};const route=Endpoint.route(E,{...graph,nodes,main,restPlaces:pool,benches:pool,meta:{...graph.meta,allowAssistancePreview:false}},fix.ll,destination.ll,internal);
 if(route.assistancePreview)throw Error('위험 대안으로 자동 변경하지 않습니다.');
 return {...route,p:{...profile},restFulfilled:completed};
}
const api={fromFix};if(typeof module!=='undefined')module.exports=api;else root.NavigationRouting=api;
})(typeof globalThis==='undefined'?this:globalThis);
