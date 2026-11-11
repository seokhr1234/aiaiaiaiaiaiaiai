import {isDeepStrictEqual} from 'node:util';
import {Facilities} from './snapshot.mjs';
const datasets={facilities:'bundled-facilities-seoul',precision:'bundled-precision-map',crossings:'bundled-crossings-review'};
export function createPostgisRepository({connectionString,pool:providedPool}={}){
 let pending;
 const verified=new Map();
 async function pool(){
  if(!pending)pending=(async()=>{
   if(providedPool)return providedPool;
   const {default:pg}=await import('pg');
   const instance=new pg.Pool({connectionString,max:4,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,
    allowExitOnIdle:true,options:'-c default_transaction_read_only=on -c statement_timeout=5000'});
   instance.on('error',()=>verified.clear());return instance;
  })().catch(e=>{pending=null;throw e});
  return pending;
 }
 const sourceId=(snapshot,layer)=>layer+':'+snapshot.lock.data.find(d=>d.id===datasets[layer]).sha256;
 function originalFeature(row){
  const feature={type:'Feature',geometry:row.original_geometry,properties:row.properties};
  if(row.original_feature_id!==null)feature.id=row.original_feature_id;
  return feature;
 }
 async function verify(db,snapshot,layer,id){
  const original=snapshot.data[datasets[layer]].features;
  // xmin changes on UPDATE/INSERT. A per-source fingerprint also catches edits
  // outside the requested viewport; count alone would allow false empty areas.
  const stats=await db.query(`SELECT COUNT(*)::int AS total,
   COUNT(*) FILTER (WHERE field_verified)::int AS promoted,
   md5(string_agg(ordinal::text || ':' || xmin::text,',' ORDER BY ordinal)) AS fingerprint
   FROM donghaeng.review_feature WHERE source_id=$1`,[id]);
  const row=stats.rows[0];
  if(row.total!==original.length||row.promoted!==0)throw Error('PostGIS snapshot mismatch');
  const meta=await db.query('SELECT sha256 FROM donghaeng.source_snapshot WHERE id=$1',[id]);
  if(meta.rows[0]?.sha256!==id.split(':')[1])throw Error('PostGIS source version mismatch');
  const key=snapshot.datasetVersion+':'+id;
  if(verified.get(key)===row.fingerprint)return;
  const result=await db.query(`SELECT ordinal,original_feature_id,original_geometry,properties,kind,
   ST_Equals(geometry,ST_Force2D(ST_GeomFromGeoJSON(original_geometry::text))) AS geometry_matches
   FROM donghaeng.review_feature WHERE source_id=$1 ORDER BY ordinal`,[id]);
  if(result.rows.length!==original.length)throw Error('PostGIS snapshot mismatch');
  for(let i=0;i<original.length;i++){
   const item=result.rows[i],expectedKind=layer==='facilities'?Facilities.classify(original[i]):original[i].properties.kind||layer;
   if(item.ordinal!==i||!item.geometry_matches||item.kind!==expectedKind||!isDeepStrictEqual(originalFeature(item),original[i]))throw Error('PostGIS row does not match preserved source');
  }
  verified.set(key,row.fingerprint);
 }
 return {
  async query(snapshot,layer,bounds,{kind,limit,offset}){
   const db=await (await pool()).connect(),id=sourceId(snapshot,layer),values=[id,bounds.west,bounds.south,bounds.east,bounds.north,kind||null];
   try{
   await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await verify(db,snapshot,layer,id);
   // GiST's cached 2D boxes may round outwards. Keep its broad index filter,
   // then compare double-precision extents to preserve the memory API boundary.
   const predicate='source_id=$1 AND geometry && ST_MakeEnvelope($2,$3,$4,$5,4326) AND ST_XMin(Box3D(geometry)) <= $4 AND ST_XMax(Box3D(geometry)) >= $2 AND ST_YMin(Box3D(geometry)) <= $5 AND ST_YMax(Box3D(geometry)) >= $3 AND ($6::text IS NULL OR kind=$6)';
   const count=await db.query('SELECT COUNT(*)::int AS total FROM donghaeng.review_feature WHERE '+predicate,values);
   const rows=await db.query('SELECT ordinal,original_feature_id,original_geometry,properties,field_verified FROM donghaeng.review_feature WHERE '+predicate+' ORDER BY ordinal OFFSET $7 LIMIT $8',[...values,offset,limit]);
   const originals=snapshot.data[datasets[layer]].features;
   const raw=rows.rows.map(row=>{
    const feature=originalFeature(row);
    if(row.field_verified||!isDeepStrictEqual(feature,originals[row.ordinal]))throw Error('PostGIS row does not match preserved source');
    return feature;
   });
   const features=layer==='facilities'?Facilities.normalize([{data:{type:'FeatureCollection',features:raw},file:'seoul/seoul-facilities.geojson'}]).features:raw;
   await db.query('COMMIT');return {features,total:count.rows[0].total};
   }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
   finally{db.release()}
  },
  async close(){if(pending)await (await pending).end()},
  storage:'postgis'
 };
}
