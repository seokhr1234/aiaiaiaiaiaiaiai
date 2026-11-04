(function(root){'use strict';
// Geometry overlap is a reason to recheck an endpoint, never proof of a blocked or safe passage.
const R=6371000,rad=Math.PI/180,cell=.001;
function cross(a,b){return a[0]*b[1]-a[1]*b[0]}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
function intervals(a,b,ring,holes=[]){const d=[b[0]-a[0],b[1]-a[1]],ts=[0,1];for(const boundary of [ring,...holes])for(let i=1;i<boundary.length;i++){const c=boundary[i-1],v=[boundary[i][0]-c[0],boundary[i][1]-c[1]],q=[c[0]-a[0],c[1]-a[1]],den=cross(d,v);if(Math.abs(den)<1e-10)continue;const t=cross(q,v)/den,u=cross(q,d)/den;if(t>=0&&t<=1&&u>=0&&u<=1)ts.push(t)}ts.sort((a,b)=>a-b);const out=[];for(let i=1;i<ts.length;i++){const l=ts[i-1],h=ts[i],t=(l+h)/2,p=[a[0]+t*d[0],a[1]+t*d[1]];if(h-l>1e-10&&inside(p,ring)&&!holes.some(hole=>inside(p,hole)))out.push([l,h])}return out}
function create(data,context=null){
 const cells=new Map(),buildings=[],features=[...(data?.features||[])];
 const contextNodes=new Map((context?.elements||[]).filter(e=>e.type==='node').map(n=>[n.id,n]));
 for(const w of context?.elements||[]){if(w.type!=='way'||!w.tags?.building||w.tags.building==='no'||!w.nodes?.length||w.nodes[0]!==w.nodes.at(-1)||w.nodes.some(id=>!contextNodes.has(id)))continue;features.push({id:'osm:building:'+w.id,properties:{kind:'building'},geometry:{type:'LineString',coordinates:w.nodes.map(id=>{const n=contextNodes.get(id);return [n.lon,n.lat]})}})}
 for(const f of features){if(f.properties?.kind!=='building')continue;const g=f.geometry;let rings=[],holes=[];if(g.type==='LineString'&&g.coordinates.length>=4){const c=g.coordinates;if(c[0][0]===c.at(-1)[0]&&c[0][1]===c.at(-1)[1])rings=[c]}else if(g.type==='Polygon'){rings=[g.coordinates[0]];holes=g.coordinates.slice(1)}
  for(const ring of rings){const xs=ring.map(c=>c[0]),ys=ring.map(c=>c[1]),bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],id=buildings.length;buildings.push({ring,holes,bounds,id:f.id});for(let x=Math.floor(bounds[0]/cell);x<=Math.floor(bounds[2]/cell);x++)for(let y=Math.floor(bounds[1]/cell);y<=Math.floor(bounds[3]/cell);y++){const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id)}}
 }
 function assess(from,to){
  const missing={status:'not_available',overlapMeters:null,fieldVerified:false};if(!buildings.length)return missing;
  if(![from,to].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('연결 좌표 형식 오류');
  const c=Math.cos((from[0]+to[0])*rad/2),xy=p=>[(p[0]-from[1])*c*rad*R,(p[1]-from[0])*rad*R],a=[0,0],b=xy([to[1],to[0]]),length=Math.hypot(...b),ids=new Set(),spans=[],matches=[];
  const bounds=[Math.min(from[1],to[1]),Math.min(from[0],to[0]),Math.max(from[1],to[1]),Math.max(from[0],to[0])];
  for(let x=Math.floor(bounds[0]/cell);x<=Math.floor(bounds[2]/cell);x++)for(let y=Math.floor(bounds[1]/cell);y<=Math.floor(bounds[3]/cell);y++)for(const id of cells.get(x+':'+y)||[])ids.add(id);
  if(length>0)for(const id of ids){const f=buildings[id],q=f.bounds;if(q[0]>bounds[2]||q[2]<bounds[0]||q[1]>bounds[3]||q[3]<bounds[1])continue;const part=intervals(a,b,f.ring.map(xy),f.holes.map(h=>h.map(xy)));if(part.length){spans.push(...part);matches.push(f.id)}}
  spans.sort((a,b)=>a[0]-b[0]);let fraction=0,end=0;for(const [lo,hi] of spans){fraction+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi)}const overlapMeters=length*fraction;
  return {status:overlapMeters>1?'building_overlap':'unverified',lengthMeters:length,overlapMeters,buildingIds:matches.slice(0,12),source:context?'NGII 1:1,000 + OSM mapped building boundaries':'NGII 1:1,000 building boundaries',precisionHash:data?.metadata?.original_sha256??null,contextTimestamp:context?.osm3s?.timestamp_osm_base??null,fieldVerified:false,passability:'unverified',notice:'건물 도형과의 2차원 겹침 검사입니다. 출입구·층위·통행 가능을 확정하지 않습니다.'};
 }
 const cache=new WeakMap();
 function isSurface(edge){return !edge.bridge&&!edge.tunnel&&String(edge.layer??'0')==='0'&&(!edge.covered||edge.covered==='no')&&(!edge.indoor||edge.indoor==='no')&&(!edge.level||String(edge.level)==='0')&&(!edge.location||['surface','outdoor','overground'].includes(edge.location))}
 function filterGraph(graph){
  if(cache.has(graph))return cache.get(graph);
  const tested=new Map(),conflicts=[];
  for(const n of graph.nodes.values())for(const e of n.edges){const token=e.id+'|'+e.key;if(tested.has(token)||!isSurface(e))continue;const end=graph.nodes.get(e.to);if(!end)continue;const result=assess(n.ll,end.ll);tested.set(token,result);if(result.status==='building_overlap')conflicts.push({wayId:e.id,key:e.key,overlapMeters:result.overlapMeters,buildingIds:result.buildingIds});}
  const blocked=new Set(conflicts.map(e=>e.wayId+'|'+e.key)),nodes=new Map();
  for(const [id,n] of graph.nodes){const edges=n.edges.filter(e=>!blocked.has(e.id+'|'+e.key));nodes.set(id,edges.length===n.edges.length?n:{...n,edges})}
  const out={...graph,nodes,meta:{...graph.meta,buildingConflicts:{count:conflicts.length,precisionHash:data?.metadata?.original_sha256,policy:'Exclude unverified surface geometry overlapping building interiors by more than 1m; preserve original graph; structures require separate level review.'}}};
  cache.set(graph,out);cache.set(out,out);return out;
 }
 return {assess,filterGraph,isSurface,buildingCount:buildings.length};
}
function routeReview(audit,route,origin,destination){const from=audit.assess(origin,route.from),to=audit.assess(route.to,destination),body=[];for(const [index,e] of route.edges.entries()){if(!audit.isSurface(e))continue;const result=audit.assess(route.coords[index],route.coords[index+1]);if(result.status==='building_overlap')body.push({index,key:e.key,...result})}const rest=route.restStop?audit.assess(route.restStop.snap,route.restStop.ll):null,needsEndpointReview=from.status==='building_overlap'||to.status==='building_overlap';return {origin:from,destination:to,bodyConflicts:body,rest,needsEndpointReview,needsGeometryReview:needsEndpointReview||body.length>0||rest?.status==='building_overlap',fieldVerified:false}}

const api={create,routeReview};if(typeof module!=='undefined')module.exports=api;else root.PrecisionConnections=api;
})(typeof globalThis==='undefined'?this:globalThis);
