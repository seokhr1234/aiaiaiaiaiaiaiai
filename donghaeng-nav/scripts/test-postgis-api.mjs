import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createApp} from '../server.mjs';
import {createPostgisRepository} from '../services/expansion/postgis.mjs';
import {loadSnapshot} from '../services/expansion/snapshot.mjs';
const require=createRequire(new URL('../services/package.json',import.meta.url)),{Pool}=require('pg');
const databaseUrl=process.env.DONGHAENG_TEST_DATABASE_URL||'postgres://postgres@127.0.0.1:55439/postgres';
const target=new URL(databaseUrl);assert(['127.0.0.1','localhost'].includes(target.hostname),'This fixture test writes only to an explicitly local disposable database');
const admin=new Pool({connectionString:databaseUrl,max:1}),memory=createApp(),database=createApp({databaseUrl});
for(const app of [memory,database])await new Promise(r=>app.listen(0,'127.0.0.1',r));
const url=app=>'http://127.0.0.1:'+app.address().port,checks=[];
try{
 const snapshot=await loadSnapshot(),bbox='127.035,37.595,127.046,37.607';
 for(const layer of ['facilities','precision','crossings'])for(const offset of [0,13]){
  const query='/api/features?'+new URLSearchParams({bbox,layer,limit:'13',offset:String(offset)});
  const [a,b]=await Promise.all([fetch(url(memory)+query),fetch(url(database)+query)]);assert.equal(a.status,200);assert.equal(b.status,200);
  const local=await a.json(),db=await b.json();assert.equal(db.storage,'postgis');assert.equal(db.total,local.total);assert.equal(db.nextOffset,local.nextOffset);assert.equal(db.datasetVersion,local.datasetVersion);assert.deepEqual(db.features,local.features);assert.deepEqual(db.sourceMetadata,local.sourceMetadata);
 }
 checks.push('Real PostGIS API matches memory API for three layers, source metadata, versions, stable pages and original IDs/Z geometry');
 for(const kind of ['bench','seating','complex','shelter','elevator','escalator','stairs','apartment']){
  const query='/api/features?'+new URLSearchParams({bbox,kind,limit:'5'});
  const [a,b]=await Promise.all([fetch(url(memory)+query),fetch(url(database)+query)]);
  assert.equal(a.status,200);assert.equal(b.status,200);const local=await a.json(),db=await b.json();assert.equal(db.total,local.total);assert.deepEqual(db.features,local.features);
 }
 checks.push('All eight facility kind filters match the memory API');
 const counts=await admin.query('SELECT count(*)::int AS total, count(*) FILTER(WHERE field_verified)::int AS verified FROM donghaeng.review_feature');assert.equal(counts.rows[0].total,34914);assert.equal(counts.rows[0].verified,0);
 const raw=await admin.query("SELECT source_id,ordinal,properties FROM donghaeng.review_feature WHERE source_id LIKE 'precision:%' AND geometry && ST_MakeEnvelope(127.035,37.595,127.046,37.607,4326) ORDER BY ordinal LIMIT 1");
 const row=raw.rows[0];
 try{
  await admin.query("UPDATE donghaeng.review_feature SET properties=properties || '{\"tampered\":true}'::jsonb WHERE source_id=$1 AND ordinal=$2",[row.source_id,row.ordinal]);
  const response=await fetch(url(database)+'/api/features?'+new URLSearchParams({bbox,layer:'precision'}));assert.equal(response.status,503);assert(!(await response.text()).includes('tampered'));
 }finally{await admin.query('UPDATE donghaeng.review_feature SET properties=$3 WHERE source_id=$1 AND ordinal=$2',[row.source_id,row.ordinal,row.properties])}
 checks.push('Returned database row edits fail against preserved source; no silent memory fallback or internal DB details');
 const outside=await admin.query("SELECT source_id,ordinal FROM donghaeng.review_feature WHERE source_id LIKE 'precision:%' AND NOT (geometry && ST_MakeEnvelope(127.035,37.595,127.046,37.607,4326)) ORDER BY ordinal LIMIT 1");
 const hidden=outside.rows[0];
 try{
  await admin.query("UPDATE donghaeng.review_feature SET properties=properties || '{\"tampered_outside_viewport\":true}'::jsonb WHERE source_id=$1 AND ordinal=$2",[hidden.source_id,hidden.ordinal]);
  const response=await fetch(url(database)+'/api/features?'+new URLSearchParams({bbox,layer:'precision'}));assert.equal(response.status,503);assert(!(await response.text()).includes('tampered_outside_viewport'));
 }finally{await admin.query('UPDATE donghaeng.review_feature SET properties=$3 WHERE source_id=$1 AND ordinal=$2',[hidden.source_id,hidden.ordinal,snapshot.precision.features[hidden.ordinal].properties])}
 const restored=await fetch(url(database)+'/api/features?'+new URLSearchParams({bbox,layer:'precision'}));assert.equal(restored.status,200);
 checks.push('An edit outside the viewport invalidates the cached source and is rejected; restoring exact original content permits revalidation');
 const removed=await admin.query("DELETE FROM donghaeng.review_feature WHERE source_id LIKE 'facilities:%' AND ordinal=0 RETURNING *");assert.equal(removed.rows.length,1);const restore=removed.rows[0];
 try{
  const response=await fetch(url(database)+'/api/features?'+new URLSearchParams({bbox,layer:'facilities'}));assert.equal(response.status,503);
 }finally{
  await admin.query('INSERT INTO donghaeng.review_feature(source_id,ordinal,external_id,original_feature_id,kind,original_geometry,geometry,properties,field_verified,verification_evidence) VALUES($1,$2,$3,$4,$5,$6::jsonb,ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(($6::jsonb)::text),4326)),$7,$8,$9)',[restore.source_id,restore.ordinal,restore.external_id,restore.original_feature_id===null?null:JSON.stringify(restore.original_feature_id),restore.kind,restore.original_geometry,restore.properties,restore.field_verified,restore.verification_evidence]);
 }
 checks.push('A disappeared source row after cache initialization is rejected instead of reporting a false empty/partial area');
 const readonly=new Pool({connectionString:databaseUrl,options:'-c default_transaction_read_only=on'});
 try{await assert.rejects(readonly.query('DELETE FROM donghaeng.review_feature WHERE false'),e=>e.code==='25006')}finally{await readonly.end()}
 const broken=createPostgisRepository({pool:{connect:async()=>({query:async()=>({rows:[{total:0,promoted:0}]}),release:()=>{}}),end:async()=>{}}});try{await assert.rejects(broken.query(snapshot,'precision',{west:127,south:37,east:128,north:38},{limit:1,offset:0}),/snapshot mismatch/)}finally{await broken.close()}
 checks.push('Read-only PostgreSQL policy and mismatched snapshot rejection verified');
 const report={pass:true,checks,sourceRows:counts.rows[0].total,fieldVerifiedRows:0,liveLocalPostgis:true,productionDatabase:false,activeGraphUnchanged:true};await writeFile(new URL('../docs/postgis-api-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{for(const app of [memory,database]){app.closeAllConnections();await new Promise(r=>app.close(r))}await admin.end()}
