import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import {createApp} from '../server.mjs';
import entry from '../../api/index.mjs';
import {createReviewPointsService,createReviewPointsHandler} from '../services/expansion/review-points.mjs';
import {queryFeatures} from '../services/expansion/features.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),nativeFetch=globalThis.fetch;
const manifest=JSON.parse(await readFile(new URL('../services/expansion/review-points-manifest.json',import.meta.url))),raw=gunzipSync(await readFile(new URL('../dist/data/review/connection-points.geojson.gz',import.meta.url))),source=JSON.parse(raw);
const vars=['DONGHAENG_BACKEND_URL','DONGHAENG_BACKEND_TOKEN'],saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));for(const key of vars)delete process.env[key];
let externalCalls=0;globalThis.fetch=async(...args)=>{externalCalls++;throw Error('No provider/backend requests are allowed in this fixture')};
const local=createApp(),vercel=createServer((req,res)=>{Promise.resolve(entry(req,res)).catch(()=>{res.statusCode=500;res.end('test entry failure')})});
for(const app of [local,vercel])await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=app=>'http://127.0.0.1:'+app.address().port;
const checks=[];
try{
 for(const box of [[127.035,37.595,127.046,37.607],[127.02,37.48,127.05,37.52],[126.9,37.54,126.95,37.58]]){
  const expected=source.features.filter(f=>{const [x,y]=f.geometry.coordinates;return x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3]});assert(expected.length>0);
  for(const app of [local,vercel]){
   const result=[],path=app===local?'/api/features':'/api/index?route=features';let offset=0;
   do{const params=new URLSearchParams({layer:'osm-review',bbox:box.join(','),limit:'500',offset:String(offset)}),response=await nativeFetch(base(app)+path+(path.includes('?')?'&':'?')+params);assert.equal(response.status,200);const data=await response.json();assert.equal(data.total,expected.length);assert.equal(data.datasetVersion,manifest.dataset_version);assert.equal(data.fieldVerified,false);assert.equal(data.routingEligible,false);assert.equal(data.storage,'bundled_review');assert.deepEqual(data.sourceMetadata,manifest.metadata);result.push(...data.features);offset=data.nextOffset}while(offset!==null);
   assert.deepEqual(result,expected);
  }
 }
 checks.push('Node and original/rewritten Vercel APIs preserve exact source points and metadata across Wolgok, Gangnam and Mapo pages without a backend/key');
 for(const kind of ['barrier','crossing','entrance','kerb','elevator']){
  const params=new URLSearchParams({layer:'osm-review',bbox:'127,37.55,127.1,37.65',kind,limit:'17'}),response=await nativeFetch(base(vercel)+'/api/features?'+params);assert.equal(response.status,200);const data=await response.json();
  const expected=source.features.filter(f=>{const [x,y]=f.geometry.coordinates;return x>=127&&x<=127.1&&y>=37.55&&y<=37.65&&f.properties.contexts.includes(kind)});assert.equal(data.total,expected.length);assert.deepEqual(data.features,expected.slice(0,17));
 }
 const first=source.features[0],[x,y]=first.geometry.coordinates,boundary=await (await nativeFetch(base(vercel)+'/api/features?'+new URLSearchParams({layer:'osm-review',bbox:[x,y,x+.000001,y+.000001].join(',')}))).json();assert(boundary.features.some(f=>f.id===first.id));
 const empty=await (await nativeFetch(base(vercel)+'/api/features?layer=osm-review&bbox=126,36,126.01,36.01')).json();assert.equal(empty.total,0);assert.equal(empty.fieldVerified,false);
 checks.push('All five context filters, stable sorted pagination, exact-boundary point inclusion and honest empty areas verified');
 for(const [query,status] of [['layer=osm-review',400],['layer=osm-review&bbox=126,37,127,38',413],['layer=osm-review&bbox=127,37,127.1,37.1&limit=1001',400],['layer=osm-review&bbox=127,37,127.1,37.1&kind=verified',400]])assert.equal((await nativeFetch(base(vercel)+'/api/features?'+query)).status,status);
 const path=base(vercel)+'/api/features?layer=osm-review&bbox=127,37.55,127.1,37.65';assert.equal((await nativeFetch(path,{method:'POST'})).status,405);assert.equal((await nativeFetch(path,{headers:{Origin:'https://foreign.invalid'}})).status,403);
 process.env.DONGHAENG_BACKEND_URL='https://should-not-be-contacted.invalid';assert.equal((await nativeFetch(path)).status,200);delete process.env.DONGHAENG_BACKEND_URL;
 const coverage=await (await nativeFetch(base(vercel)+'/api/coverage')).json();assert.equal(coverage.walking.citywide,false);assert.equal(coverage.walking.serviceAvailable,false);assert.equal(coverage.reviewPoints.records,31934);assert.equal(coverage.reviewPoints.routingEligible,false);
 const direct=await queryFeatures(new URLSearchParams({layer:'osm-review',bbox:'127,37.55,127.1,37.65',limit:'1'}),{repository:{query(){throw Error('Review points must not query or silently fall back from PostGIS')}}});assert.equal(direct.features.length,1);
 assert.equal((await nativeFetch(base(local)+'/api/features?layer=facilities&bbox=127.035,37.595,127.046,37.607&limit=1')).status,200);
 const outside=await nativeFetch(base(local)+'/api/routes/walk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin:[37.5,127.03],destination:[37.51,127.04],profile:{},atTime:'2026-11-13T01:00:00Z'})});assert.equal(outside.status,422);
 checks.push('Invalid area/limits/kind, method and origin rejected; display-only points do not call PostGIS/backends or enlarge walking coverage');
 const bad=createReviewPointsService({read:async url=>{if(String(url).endsWith('/connection-points.geojson.gz'))return Buffer.from('corrupt');return readFile(url)}});
 await assert.rejects(bad.query(new URLSearchParams({bbox:'127,37.55,127.1,37.65'})),e=>e.status===503&&e.code==='review_data_unavailable');
 const missing=createReviewPointsService({read:async()=>{throw Error('internal-fixture-detail')}});await assert.rejects(missing.coverage(),e=>e.status===503&&!e.message.includes('internal-fixture-detail'));
 const lock=JSON.parse(await readFile(new URL('../services/service-integrity.json',import.meta.url)));assert(!lock.files['donghaeng-nav/dist/data/review/connection-points.geojson.gz']);
 function fixture(verified){
  const f=structuredClone(source.features[0]);f.properties.field_verified=verified;const bytes=Buffer.from(JSON.stringify({...source,features:[f]})),packed=gzipSync(bytes),m={...manifest,records:1,dataset_version:'osm-review-'+sha(bytes),asset:{...manifest.asset,bytes:packed.length,uncompressed_bytes:bytes.length,sha256:sha(packed),uncompressed_sha256:sha(bytes)}};
  const manifestBytes=Buffer.from(JSON.stringify(m)),fixtureLock={...lock,review_assets:{...lock.review_assets,'donghaeng-nav/services/expansion/review-points-manifest.json':sha(manifestBytes),'donghaeng-nav/dist/data/review/connection-points.geojson.gz':sha(packed)}};
  return createReviewPointsService({read:async url=>String(url).endsWith('/service-integrity.json')?Buffer.from(JSON.stringify(fixtureLock)):String(url).endsWith('/review-points-manifest.json')?manifestBytes:String(url).endsWith('/connection-points.geojson.gz')?packed:readFile(url)});
 }
 assert.equal((await fixture(false).query(new URLSearchParams({bbox:[x,y,x+.000001,y+.000001].join(',')}))).total,1);
 await assert.rejects(fixture(true).query(new URLSearchParams({bbox:[x,y,x+.000001,y+.000001].join(',')})),e=>e.status===503);
 assert.equal(externalCalls,0);checks.push('Corrupt/missing assets and source-promoted verification flags fail closed with sanitized errors; review assets are isolated from core graph integrity');
 const report={pass:true,checks,records:manifest.records,externalCalls,liveOdsay:false,physicalGps:false,fieldVerified:false,activeRoutingExpanded:false,actualVercelRuntime:false};await writeFile(new URL('../docs/review-points-api-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{globalThis.fetch=nativeFetch;for(const key of vars){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key]}for(const app of [local,vercel]){app.closeAllConnections();await new Promise(r=>app.close(r))}}
