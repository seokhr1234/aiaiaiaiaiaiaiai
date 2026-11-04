const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const E=require('../dist/engine'),X=require('../dist/endpoint-routing'),C=require('../dist/route-candidates'),P=require('../dist/precision-connections');
const base=path.resolve(__dirname,'../dist'),read=f=>JSON.parse(fs.readFileSync(path.join(base,f)));
(async()=>{const raw=fs.readFileSync(path.join(base,'map-data.json')),g=E.createGraph(JSON.parse(raw));g.meta.graphSha256=crypto.createHash('sha256').update(raw).digest('hex');E.applyTerrain(g,read('terrain-data.json'));g.meta.buildingAudit=P.create(read('data/precision/precision-map.geojson'),read('map-context.json'));
 const school=g.places.find(p=>p.name.toLowerCase()==='fortissimo'),library=g.places.find(p=>p.name==='월곡꿈그림도서관');assert(school&&library);
 const station=X.arrivalNear(g,[37.60192,127.0414554]).ll,schoolRoad=X.arrivalNear(g,school.ll).ll,libraryRoad=X.arrivalNear(g,library.ll).ll;
 const rows=[];for(const [name,origin,destination,text] of [['station-library',station,libraryRoad,'짧은 길로 가고 싶어요'],['station-school',station,schoolRoad,'경사를 피해서 가고 싶어요'],['wheelchair-school',station,schoolRoad,'휠체어로 경사를 피해 주세요']]){
  const profile=E.wheelchairProfile(E.parseState(text)),generated=await C.generate(E,X,g,origin,destination,profile,{timeBudgetMs:3000});assert(generated.routes.length<=5);
  for(const r of generated.routes){assert(C.eligible(E,r,profile,g.meta.buildingAudit,origin,destination));assert(!r.assistancePreview&&!r.accessReview)}
  rows.push({name,attempts:generated.attempts,eligibleCandidates:generated.routes.length,summary:generated.routes.map(r=>r.selectionMetrics),error:generated.error||null});
 }
 const report={pass:true,cases:rows,scope:'Current runtime graph, road-projected test endpoints; not physical field verification',realGemini:false,fieldVerified:false};fs.writeFileSync(path.resolve(__dirname,'../docs/route-choice-real-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
