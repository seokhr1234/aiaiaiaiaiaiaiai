import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzip} from 'node:zlib';
import {promisify,isDeepStrictEqual} from 'node:util';
import {bbox,integer,ServiceError,fail} from './contracts.mjs';
const unzip=promisify(gunzip),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const kinds=['barrier','crossing','entrance','kerb','elevator'];
const manifestUrl=new URL('./review-points-manifest.json',import.meta.url);
const assetUrl=new URL('../../dist/data/review/connection-points.geojson.gz',import.meta.url);
const integrityUrl=new URL('../service-integrity.json',import.meta.url);
const unavailable=()=>new ServiceError(503,'review_data_unavailable','등록 접속점 자료를 확인하지 못했어요. 나중에 다시 시도해 주세요.');

// Independently load only this small display dataset. In particular this module
// does not import the walking snapshot, graph, terrain, database or API keys.
export function createReviewPointsService({read=readFile}={}){
 let manifestPending,dataPending;
 async function manifest(){
  if(!manifestPending)manifestPending=(async()=>{
   const lock=JSON.parse(await read(integrityUrl)),raw=await read(manifestUrl);
   // Deployment tooling may transform JS. Code hashes are checked by the
   // builder; runtime checks cover byte-preserved JSON/gzip assets only.
   if(sha(raw)!==lock.review_assets?.['donghaeng-nav/services/expansion/review-points-manifest.json'])throw Error('review registration mismatch');
   const m=JSON.parse(raw);
   if(m.schema!=='donghaeng-review-points-v1'||!Number.isInteger(m.records)||m.records<1||m.records>50000||m.field_verified!==false||m.routing_eligible!==false||m.display_only!==true
     ||m.metadata.source_crs!=='EPSG:4326'||m.metadata.field_verified!==false||m.metadata.routing_eligible!==false||m.metadata.new_slope_values_promoted!==0
     ||m.asset.sha256!==lock.review_assets?.['donghaeng-nav/dist/data/review/connection-points.geojson.gz']||m.asset.uncompressed_bytes>32*1024*1024
     ||m.dataset_version!=='osm-review-'+m.asset.uncompressed_sha256)throw Error('invalid review registration');
   return m;
  })().catch(()=>{manifestPending=null;throw unavailable()});
  return manifestPending;
 }
 async function data(){
  if(!dataPending)dataPending=(async()=>{
   const m=await manifest(),packed=await read(assetUrl);
   if(packed.length!==m.asset.bytes||sha(packed)!==m.asset.sha256)throw Error('review asset mismatch');
   const raw=await unzip(packed,{maxOutputLength:32*1024*1024});
   if(raw.length!==m.asset.uncompressed_bytes||sha(raw)!==m.asset.uncompressed_sha256)throw Error('review content mismatch');
   const collection=JSON.parse(raw),cells=new Map(),seen=new Set();
   if(collection.type!=='FeatureCollection'||collection.features?.length!==m.records||!isDeepStrictEqual(collection.metadata,m.metadata))throw Error('review schema mismatch');
   for(const [i,f] of collection.features.entries()){
    const p=f.properties,c=f.geometry?.coordinates;
    if(f.type!=='Feature'||f.geometry?.type!=='Point'||!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||Math.abs(c[0])>180||Math.abs(c[1])>90
      ||!Number.isSafeInteger(p?.osm_node_id)||p.osm_node_id<=0||f.id!=='osm-node-'+p.osm_node_id||seen.has(f.id)
      ||p.source_url!=='https://www.openstreetmap.org/node/'+p.osm_node_id||p.field_verified!==false||p.routing_eligible!==false
      ||p.coordinate_role!=='osm_registered_reference_not_verified_connection'||!kinds.includes(p.kind)||!Array.isArray(p.contexts)||!p.contexts.includes(p.kind)
      ||p.contexts.some(k=>!kinds.includes(k))||new Set(p.contexts).size!==p.contexts.length)throw Error('review feature mismatch');
    seen.add(f.id);const key=Math.floor(c[0]/.02)+':'+Math.floor(c[1]/.02);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);
   }
   return {m,features:collection.features,cells};
  })().catch(()=>{dataPending=null;throw unavailable()});
  return dataPending;
 }
 return {
  async coverage(){const m=await manifest();return {records:m.records,contexts:m.context_counts,datasetVersion:m.dataset_version,sourceAsOf:m.metadata.as_of,collectedDate:m.metadata.collected_date,reviewedDate:m.metadata.reviewed_date,sourceCrs:m.metadata.source_crs,scope:m.metadata.scope,state:'registered_display_data',storage:'bundled_review',fieldVerified:false,routingEligible:false}},
  async query(params){
   const bounds=bbox(params.get('bbox')),limit=integer(params.get('limit'),300,1000),offset=integer(params.get('offset'),0,1000000),kind=params.get('kind');
   if(!limit)fail(400,'invalid_limit','요청 건수는 1 이상이어야 해요.');if(kind&&!kinds.includes(kind))fail(400,'invalid_kind','등록 지점 종류를 확인해 주세요.');
   const {m,features,cells}=await data(),found=[];
   for(let x=Math.floor(bounds.west/.02);x<=Math.floor(bounds.east/.02);x++)for(let y=Math.floor(bounds.south/.02);y<=Math.floor(bounds.north/.02);y++)
    for(const i of cells.get(x+':'+y)||[]){const f=features[i],[lon,lat]=f.geometry.coordinates;if(lon>=bounds.west&&lon<=bounds.east&&lat>=bounds.south&&lat<=bounds.north&&(!kind||f.properties.contexts.includes(kind)))found.push(i)}
   found.sort((a,b)=>a-b);
   return {type:'FeatureCollection',schema:'donghaeng-features-v1',layer:'osm-review',datasetVersion:m.dataset_version,sourceMetadata:m.metadata,bounds,
    features:found.slice(offset,offset+limit).map(i=>features[i]),total:found.length,offset,nextOffset:offset+limit<found.length?offset+limit:null,
    storage:'bundled_review',fieldVerified:false,routingEligible:false,notice:'OSM 등록 지점의 검토 표시입니다. 출입·통행 가능·턱/유효 폭·승강기 운행은 현장 미확인입니다.'};
  }
 };
}
export const reviewPoints=createReviewPointsService();
export function createReviewPointsHandler({service=reviewPoints}={}){
 return async(req,res)=>{
  const send=(status,value)=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.statusCode=status;res.end(JSON.stringify(value))};
  try{
   if(req.method!=='GET')return send(405,{code:'method_not_allowed',error:'GET 요청을 사용해 주세요.'});
   if(req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))return send(403,{code:'origin_not_allowed',error:'이 서비스 화면에서 다시 시도해 주세요.'});
   return send(200,await service.query(new URL(req.url,'http://localhost').searchParams));
  }catch(e){send(e.status||503,{code:e.status?e.code:'review_data_unavailable',error:e.status?e.message:unavailable().message})}
 };
}
