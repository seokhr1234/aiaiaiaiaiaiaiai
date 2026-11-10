const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),file='donghaeng-nav/dist/data/accessibility/seoul/seoul-facilities.geojson';
const old=JSON.parse(cp.execFileSync('git',['show','3240968:'+file],{cwd:root,maxBuffer:64*1024*1024}));
const current=JSON.parse(fs.readFileSync(path.join(root,file)));
const M=require('../dist/facilities'),F=require('../dist/final-model'),E=require('../dist/engine');
assert.equal(current.features.length,old.features.length);
let rechecked=0,notices=0;const conflicts=[];
for(let i=0;i<current.features.length;i++){
 const a=current.features[i],b=old.features[i],p=a.properties;
 assert.deepEqual(a.geometry,b.geometry);
 for(const field of ['id','official_fields','opening_hours','source_snapshot','retrieved_date','field_verified','operational_status'])assert.deepEqual(p[field],b.properties[field]);
 const copy=structuredClone(a);
 for(const field of ['official_recheck','official_hours_conflict','official_hours_conflict_note'])delete copy.properties[field];
 if(copy.properties.additional_official_evidence){copy.properties.additional_official_evidence=copy.properties.additional_official_evidence.filter(e=>e.collection_batch!=='round4-2026-11-05');if(!copy.properties.additional_official_evidence.length&&!b.properties.additional_official_evidence)delete copy.properties.additional_official_evidence;}
 assert.deepEqual(copy,b,'Only documented evidence metadata may change');
 if(p.official_recheck){rechecked++;assert.equal(M.officialReviewRows(p).length,2);assert.equal(p.field_verified,false);assert.equal(p.official_recheck.field_verified,false);}
 notices+=(p.additional_official_evidence||[]).filter(e=>e.collection_batch==='round4-2026-11-05').length;
 if(p.official_hours_conflict)conflicts.push(p.id);
}
assert.equal(rechecked,4092);assert.equal(notices,3);assert.equal(conflicts.length,2);
for(const p of [{},{official_recheck:{}},{official_recheck:{matched_fields:23,field_verified:true}},{official_recheck:{matched_fields:23,field_verified:false,retrieved_date:'unknown',catalog_data_updated:'2026-11-05',facility_year:'2026'}}])assert.deepEqual(M.officialReviewRows(p),[]);
const normalized=d=>M.normalize([{data:d,file:'test'}]).features;
const before=F.restCandidates(normalized(old),E),after=F.restCandidates(normalized(current),E);
assert.deepEqual(before.filter(f=>!after.some(n=>n.id===f.id)).map(f=>f.id),['seoul:cooling:80f8394aa06897d9']);
assert(after.every(f=>!conflicts.includes(f.id)));
const oldRemaining=before.filter(f=>after.some(n=>n.id===f.id));
assert.deepEqual(after,oldRemaining);
for(const time of ['2026-07-15T03:30:00Z','2026-07-15T09:30:00Z','2026-11-05T01:00:00Z'])assert.deepEqual(after.map(f=>E.restStatus(f,time)),oldRemaining.map(f=>E.restStatus(f,time)));
const baselineLock=JSON.parse(cp.execFileSync('git',['show','3240968:donghaeng-nav/dist/runtime-integrity.json'],{cwd:root}));
for(const item of baselineLock.data.filter(d=>d.id!=='bundled-facilities-seoul'))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'donghaeng-nav/dist',item.path))).digest('hex'),item.sha256);
assert.equal(cp.execFileSync('git',['diff','--name-only','3240968','--','research'],{cwd:root,encoding:'utf8'}),'');
const report={pass:true,recheckedShelters:rechecked,linkedNotices:notices,conflicts:conflicts.length,newCoordinates:0,newSlopes:0,fieldVerified:false,checks:['All 17485 facility identities/geometries and source/operation fields preserved; changes restricted to evidence metadata','4092 verified recheck labels; absent/malformed verification cannot appear confirmed','Two conflicting records excluded from automatic rest; exactly one previously eligible record withheld; other candidates/statuses unchanged','Eight other runtime datasets and all prior research preserved']};
fs.writeFileSync(path.join(root,'donghaeng-nav/docs/research-map-linkage-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
