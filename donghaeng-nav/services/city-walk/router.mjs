import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {setImmediate as yieldLoop} from 'node:timers/promises';
import {ServiceError,walkingInput,jsonBody,fail} from '../expansion/contracts.mjs';
const unzip=promisify(gunzip),sha=b=>createHash('sha256').update(b).digest('hex');
const types={d:Float64Array,I:Uint32Array,B:Uint8Array,f:Float32Array};
export const distance=(a,b)=>{const r=Math.PI/180,x=a[0]*r,y=b[0]*r;return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin((y-x)/2)**2+Math.cos(x)*Math.cos(y)*Math.sin((b[1]-a[1])*r/2)**2)))};
const unavailable=()=>new ServiceError(503,'city_graph_unavailable','서울 보행 자료를 확인하지 못했어요. 나중에 다시 시도해 주세요.');

export function createCityGraph({read=readFile}={}){
 let pending,metaPending;
 async function manifest(){
  if(!metaPending)metaPending=(async()=>{
   const lock=JSON.parse(await read(new URL('../service-integrity.json',import.meta.url))),raw=await read(new URL('./manifest.json',import.meta.url));
   if(sha(raw)!==lock.city_assets?.['donghaeng-nav/services/city-walk/manifest.json'])throw Error('unregistered graph');
   const m=JSON.parse(raw);
   if(m.dataset_version!=='city-walk-'+m.assets?.['graph.bin.gz']?.raw_sha256||m.schema!=='donghaeng-city-walk-graph-v1'||m.validation_required!==false||m.metadata.field_verified!==false||m.metadata.accessibility_verified!==false||m.metadata.new_slope_values_promoted!==0||m.metadata.source_crs!=='EPSG:4326'||m.nodes>2000000||m.segments>2500000)throw Error('invalid graph');
   for(const [name,asset] of Object.entries(m.assets))if(asset.sha256!==lock.city_assets?.['donghaeng-nav/services/city-walk/assets/'+name])throw Error('unregistered asset');
   return m;
  })().catch(()=>{metaPending=null;throw unavailable()});
  return metaPending;
 }
 return {manifest,async load(){
  if(!pending)pending=(async()=>{
   const m=await manifest(),raw=[];
   for(const name of ['graph.bin.gz','ways.json.gz']){const a=m.assets[name],packed=await read(new URL('./assets/'+name,import.meta.url));if(packed.length!==a.bytes||sha(packed)!==a.sha256)throw Error('corrupt graph');const content=await unzip(packed,{maxOutputLength:128*1024*1024});if(content.length!==a.raw_bytes||sha(content)!==a.raw_sha256)throw Error('corrupt graph content');raw.push(content)}
   const buffer=raw[0].buffer.slice(raw[0].byteOffset,raw[0].byteOffset+raw[0].byteLength),g={m,ways:JSON.parse(raw[1]),cells:new Map()};
   for(const [key,descriptor] of Object.entries(m.layout)){const Type=types[descriptor.type];if(!Type||descriptor.offset%Type.BYTES_PER_ELEMENT)throw Error('graph layout');g[key]=new Type(buffer,descriptor.offset,descriptor.length)}
   if(g.coordinates.length!==m.nodes*2||g.nodeIds.length!==m.nodes||g.offsets.length!==m.nodes+1||g.targets.length!==m.segments*2||g.edgeIndices.length!==g.targets.length||g.offsets.at(-1)!==g.targets.length||g.ways.length!==m.ways)throw Error('graph counts');
   for(const key of ['starts','ends','wayIndex','parts','lengths','flags','slopes'])if(g[key].length!==m.segments)throw Error('edge counts');
   for(let i=0;i<m.nodes;i++){const [x,y]=g.coordinates.subarray(i*2,i*2+2);if(!Number.isFinite(x)||!Number.isFinite(y)||x<m.bounds[0]||x>m.bounds[2]||y<m.bounds[1]||y>m.bounds[3]||g.offsets[i]>g.offsets[i+1])throw Error('graph node');const k=Math.floor(x/.005)+':'+Math.floor(y/.005);let c=g.cells.get(k);if(!c)g.cells.set(k,c=[]);c.push(i)}
   for(let i=0;i<g.targets.length;i++)if(g.targets[i]>=m.nodes||g.edgeIndices[i]>=m.segments)throw Error('graph adjacency');
   for(let i=0;i<m.segments;i++)if(g.starts[i]>=m.nodes||g.ends[i]>=m.nodes||g.wayIndex[i]>=m.ways||!(g.lengths[i]>0)||!Number.isFinite(g.lengths[i]))throw Error('graph edge');
   const waySlopes=g.ways.map(w=>{const text=String(w[4]??''),match=/^([+-]?\d+(?:\.\d+)?)\s*%?$/.exec(text);return match&&Math.abs(Number(match[1]))<=100?Math.abs(Number(match[1])):NaN});g.slopes=Float64Array.from(g.wayIndex,i=>waySlopes[i]);
   return g;
  })().catch(()=>{pending=null;throw unavailable()});
  return pending;
 }};
}
const ll=(g,i)=>[g.coordinates[2*i+1],g.coordinates[2*i]];
function allowed(g,e,p){return !(p.avoidSteps&&(g.flags[e]&1)||p.wheelchair&&(g.flags[e]&5)||p.maxSlope!=null&&(!Number.isFinite(g.slopes[e])||g.slopes[e]>p.maxSlope))}
function nearest(g,p,profile){
 let best=-1,gap=Infinity;const x=Math.floor(p[1]/.005),y=Math.floor(p[0]/.005);
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const i of g.cells.get((x+dx)+':'+(y+dy))||[]){
  let usable=false;for(let j=g.offsets[i];j<g.offsets[i+1];j++)if(allowed(g,g.edgeIndices[j],profile)){usable=true;break}if(!usable)continue;
  const d=distance(p,ll(g,i));if(d<gap){best=i;gap=d}
 }
 if(best<0||gap>80)fail(422,'city_endpoint_unresolved','80m 안에서 조건에 맞는 등록 보행 연결을 찾지 못했어요. 실제 보행로에서 위치를 다시 지정해 주세요.');
 return {node:best,gap};
}
class Heap{
 constructor(){this.a=[]}
 push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p][1]<=v[1])break;a[i]=a[p];i=p}a[i]=v}
 pop(){const a=this.a,v=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1][1]<a[j][1])j++;if(a[j][1]>=last[1])break;a[i]=a[j];i=j}a[i]=last}return v}
}
export async function search(g,start,end,profile,{signal,timeoutMs=8000,maxVisited=600000}={}){
 const n=g.m.nodes,cost=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),via=new Int32Array(n).fill(-1),closed=new Uint8Array(n),heap=new Heap(),deadline=Date.now()+timeoutMs;
 cost[start]=0;heap.push([start,distance(ll(g,start),ll(g,end))]);let visited=0;
 while(heap.a.length){
  if((visited&4095)===0){await yieldLoop();if(signal?.aborted)throw new ServiceError(499,'cancelled','계산을 취소했어요.');if(Date.now()>deadline||visited>=maxVisited)fail(504,'city_route_timeout','서울 보행 계산 시간이 길어졌어요. 더 가까운 위치로 나누어 다시 요청해 주세요.')}
  const [v]=heap.pop();if(closed[v])continue;closed[v]=1;visited++;if(v===end)break;
  for(let j=g.offsets[v];j<g.offsets[v+1];j++){const e=g.edgeIndices[j],to=g.targets[j];if(closed[to]||!allowed(g,e,profile))continue;const weight=g.lengths[e]*(1+(!profile.short&&(g.flags[e]&2)?0.2:0)),next=cost[v]+weight;if(next>=cost[to])continue;cost[to]=next;prev[to]=v;via[to]=e;heap.push([to,next+distance(ll(g,to),ll(g,end))])}
 }
 if(!closed[end])fail(422,'city_no_connected_route','등록 도로의 연결과 이동 조건을 만족하는 경로를 찾지 못했어요. 교량·지하·차단물 등 미확인 연결을 임의로 잇지 않았습니다.');
 const nodes=[end],edges=[];for(let v=end;v!==start;v=prev[v]){if(prev[v]<0)throw unavailable();nodes.push(prev[v]);edges.push(via[v])}nodes.reverse();edges.reverse();if(!edges.length)fail(422,'same_endpoint','같은 등록 지점입니다. 다른 출발·도착 위치를 선택해 주세요.');return {nodes,edges,visited};
}
export function createCityWalkService({graph=createCityGraph()}={}){
 return {async coverage(){const m=await graph.manifest();return {schema:'donghaeng-city-walk-coverage-v1',state:'osm_reference_routing',datasetVersion:m.dataset_version,bounds:m.bounds,nodes:m.nodes,segments:m.segments,sourceMetadata:m.metadata,fieldVerified:false,accessibilityVerified:false,supportsRestRouting:false}},async route(input,{signal,timeoutMs=8000}={}){
  const {origin,destination,profile}=walkingInput(input),m=await graph.manifest();
  for(const p of [origin,destination])if(p[1]<m.bounds[0]||p[1]>m.bounds[2]||p[0]<m.bounds[1]||p[0]>m.bounds[3])fail(422,'outside_city_coverage','서울 도보 자료 범위 안에서 출발·도착을 선택해 주세요.');
  if(profile.avoidSlope&&profile.maxSlope==null)fail(422,'city_slope_evidence_required','서울 전역 도로의 노면 경사를 확인할 자료가 부족해요. 경사 회피 조건을 충족한 경로로 추천할 수 없습니다.');
  if(profile.rest)fail(422,'city_rest_evidence_required','서울 전역의 휴식 장소 접속·운영시간·휴식 간격 검증은 아직 연결되지 않았어요. 휴식 조건을 충족한 경로로 추천할 수 없습니다.');
  const g=await graph.load(),a=nearest(g,origin,profile),b=nearest(g,destination,profile),r=await search(g,a.node,b.node,profile,{signal,timeoutMs});
  let length=0,unknown=0,steps=0,maxIncline=null;const used=new Map();
  for(const e of r.edges){const d=g.lengths[e];length+=d;if(!Number.isFinite(g.slopes[e]))unknown+=d;else maxIncline=Math.max(maxIncline??0,g.slopes[e]);if(g.flags[e]&1)steps+=d;const w=g.ways[g.wayIndex[e]];used.set(w[0],{id:w[0],name:w[1],modifiedAt:w[2],highway:w[3],registeredIncline:w[4],footClaim:w[5],sourceUrl:'https://www.openstreetmap.org/way/'+w[0]})}
  return {schema:'donghaeng-city-walk-v1',state:'reference_route',datasetVersion:m.dataset_version,sourceMetadata:m.metadata,profile,origin,destination,coordinates:r.nodes.map(i=>ll(g,i)),sourceNodeIds:r.nodes.map(i=>g.nodeIds[i]),sourceSegments:r.edges.map(e=>[g.ways[g.wayIndex[e]][0],g.parts[e]]),distanceMeters:length,minutes:Math.ceil(length/profile.speed),endpointGaps:[a.gap,b.gap],unknownInclineMeters:unknown,registeredInclineMax:maxIncline,stepsMeters:steps,sourceWays:[...used.values()],visited:r.visited,fieldVerified:false,accessibilityVerified:false,endpointConnectionsVerified:false,restVerified:false,notices:['서울 OSM 등록 도로를 이용한 보행 참고 경로입니다. 통행 허가·현재 상태와 턱·폭·노면 경사는 현장 미확인입니다.','교량·터널·실내·층위·차단물 접속 미확인 구간과 건물 내부 겹침은 보류했습니다. 연결이 없는 곳을 직선으로 잇지 않습니다.','등록 계단과 경사 조건은 적용하지만 미등록 시설/위험은 알 수 없습니다. 출발·도착 핀과 등록 도로 사이도 미검증입니다.']};
 }};
}
export const cityWalk=createCityWalkService();
export function createCityWalkHandler({service=cityWalk}={}){
 let active=0;
 return async(req,res,route=new URL(req.url,'http://localhost').pathname)=>{
  const send=(status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
  const controller=new AbortController(),abort=()=>controller.abort();let acquired=false;
  try{
   if(req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))fail(403,'origin_not_allowed','이 서비스 화면에서 다시 시도해 주세요.');
   const status=route==='/api/city/coverage';if(req.method!==(status?'GET':'POST'))fail(405,'method_not_allowed',status?'GET 요청을 사용해 주세요.':'POST 요청을 사용해 주세요.');
   if(status)return send(200,await service.coverage());
   if(active>=2)fail(429,'city_route_busy','다른 보행 경로를 계산하고 있어요. 잠시 후 다시 시도해 주세요.');active++;acquired=true;
   req.once('aborted',abort);res.once('close',abort);return send(200,await service.route(await jsonBody(req),{signal:controller.signal}));
  }catch(e){send(e.status||503,{code:e.status?e.code:'city_graph_unavailable',error:e.status?e.message:unavailable().message})}
  finally{if(acquired)active--;req.removeListener('aborted',abort);res.removeListener('close',abort)}
 };
}
