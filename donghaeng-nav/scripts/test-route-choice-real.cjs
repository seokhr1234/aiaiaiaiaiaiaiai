const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const E=require('../dist/engine'),X=require('../dist/endpoint-routing'),C=require('../dist/route-candidates'),P=require('../dist/precision-connections');
const base=path.resolve(__dirname,'../dist'),read=f=>JSON.parse(fs.readFileSync(path.join(base,f)));
(async()=>{const raw=fs.readFileSync(path.join(base,'map-data.json')),g=E.createGraph(JSON.parse(raw));g.meta.graphSha256=crypto.createHash('sha256').update(raw).digest('hex');E.applyTerrain(g,read('terrain-data.json'));g.meta.buildingAudit=P.create(read('data/precision/precision-map.geojson'),read('map-context.json'));
 const school=g.places.find(p=>p.name.toLowerCase()==='fortissimo'),library=g.places.find(p=>p.name==='월곡꿈그림도서관');assert(school&&library);
 const station=X.arrivalNear(g,[37.60192,127.0414554]).ll,schoolRoad=X.arrivalNear(g,school.ll).ll,libraryRoad=X.arrivalNear(g,library.ll).ll;
 const luna=X.arrivalNear(g,[37.5989,127.042]).ll;
 const rows=[];for(const [name,origin,destination,text] of [['station-library',station,libraryRoad,'짧은 길로 가고 싶어요'],['station-school',station,schoolRoad,'경사를 피해서 가고 싶어요'],['wheelchair-school',station,schoolRoad,'휠체어로 경사를 피해 주세요'],['luna-center-school',luna,schoolRoad,'다리가 아파서 오르막이 어려워요']]){
  const at=Date.now(),profile=E.wheelchairProfile(E.parseState(text)),generated=await C.generate(E,X,g,origin,destination,profile);assert(generated.routes.length<=5);assert(generated.attempts<=24);
  if(name==='luna-center-school')assert(generated.routes.length>=3,'Luna reference case should provide multiple genuine alternatives');
  if(name==='wheelchair-school')assert.equal(generated.routes.length,0);
  for(const r of generated.routes){assert(C.eligible(E,r,profile,g.meta.buildingAudit,origin,destination));assert(!r.assistancePreview&&!r.accessReview)}
  for(const [i,a] of generated.routes.entries())for(const b of generated.routes.slice(i+1))assert(C.overlap(a,b)<=.9);
  rows.push({name,condition:text,origin,destination,attempts:generated.attempts,elapsedMs:Date.now()-at,eligibleCandidates:generated.routes.length,diagnostics:generated.diagnostics,summary:generated.routes.map(r=>r.selectionMetrics),error:generated.error||null,...(name==='luna-center-school'?{previousCandidateCount:1,baselineCommit:'7da3bc0928b2f9169c6627cc7f351b39bc0b890b',endpointNote:'Road-projected reference in Luna center/south area, not the user\'s exact pin or a verified entrance'}:{})});
 }
 const report={pass:true,cases:rows,scope:'Current runtime graph, road-projected test endpoints; not physical field verification',realGemini:false,fieldVerified:false};fs.writeFileSync(path.resolve(__dirname,'../docs/route-choice-real-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1});
