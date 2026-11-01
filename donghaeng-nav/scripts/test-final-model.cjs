const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const E=require('../dist/engine.js'),F=require('../dist/final-model.js'),M=require('../dist/facilities.js');
const raw=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/accessibility/seoul/seoul-facilities.geojson')));
const model=M.normalize([{data:raw}]),g=E.createGraph(require('../dist/map-data.json'));E.applyTerrain(g,require('../dist/terrain-data.json'));g.benches=F.stopCandidates(model.features,E);g.restPlaces=F.restCandidates(model.features,E);
assert(g.benches.length>0);assert.equal(new Set(g.benches.map(f=>f.id)).size,g.benches.length);
for(const f of g.benches){const original=model.features.find(x=>x.id===f.id);assert(!original.properties.apartment_name);assert.notEqual(original.properties.context,'apartment_polygon');assert.notEqual(original.properties.coordinate_role,'public_space_parcel_reference');assert(F.inCoverage(f.ll))}
assert(!E.parseState('쉬지 않고 가장 짧은 길로 가요').rest);
const destination=g.places.find(p=>p.name==='월곡꿈그림도서관');assert(destination);const routes={};
for(const [key,scenario] of Object.entries(F.SCENARIOS)){const r=E.route(g,F.STATION,destination.ll,E.parseState(scenario.text));routes[key]=r;assert(r.totalLength>=r.length);assert(r.gaps.every(d=>d<20));if(key!=='short')assert(r.edges.every(e=>!e.steps));}
assert(routes.rest.restStop);assert(g.benches.some(x=>x.id===routes.rest.restStop.id));assert.notDeepEqual(routes.rest.ids,routes.short.ids);assert(routes.rest.totalLength>routes.short.totalLength);
const html=fs.readFileSync(path.join(__dirname,'../../동행길-최종.html'),'utf8');const match=html.match(/<script id="bundled-facilities-seoul"[^>]*>([^<]+)<\/script>/);assert(match);const embedded=JSON.parse(zlib.gunzipSync(Buffer.from(match[1],'base64')));assert.deepEqual(embedded,raw,'all source data must be preserved losslessly');assert.equal(html,fs.readFileSync(path.join(__dirname,'../../동행길-시연.html'),'utf8'));
assert(!/<script src=/.test(html));assert(!/https:\/\/tile.openstreetmap.org\//.test(html));
console.log(JSON.stringify({pass:true,sourceRecords:model.features.length,counts:model.counts,eligibleRestCandidates:g.benches.length,scenarios:Object.fromEntries(Object.entries(routes).map(([key,r])=>[key,{meters:Math.round(r.totalLength),minutes:Math.ceil(r.totalLength/E.parseState(F.SCENARIOS[key].text).speed),rest:r.restStop?.name||null}]))},null,2));
