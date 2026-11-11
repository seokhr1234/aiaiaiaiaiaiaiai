import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
export const E = require('../../dist/engine.js'), F = require('../../dist/final-model.js');
export const Facilities = require('../../dist/facilities.js'), Connections = require('../../dist/precision-connections.js');
export const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let pending;
export function loadSnapshot() {
  if (!pending) pending = load().catch(error => { pending = null; throw error; });
  return pending;
}
async function load() {
  const services=JSON.parse(await readFile(new URL('../service-integrity.json',import.meta.url)));
  for(const [name,expected] of Object.entries(services.files)){
    const target=path.resolve(projectRoot,name);
    if(!target.startsWith(projectRoot)||sha(await readFile(target))!==expected)throw Error('서비스 코드 무결성 오류');
  }
  const lock = JSON.parse(await readFile(path.join(root, 'runtime-integrity.json')));
  const entries = await Promise.all(lock.data.map(async d => {
    const bytes = await readFile(path.join(root, d.path));
    if (sha(bytes) !== d.sha256) throw Error('자료 무결성 오류: ' + d.id);
    return [d.id, JSON.parse(bytes)];
  }));
  for (const [name, expected] of Object.entries(lock.protected_code)) {
    if (sha(await readFile(path.join(root,name))) !== expected) throw Error('코드 무결성 오류: ' + name);
  }
  const data = Object.fromEntries(entries), graphHash = lock.data.find(d=>d.id==='bundled-map-data').sha256;
  const precision = data['bundled-precision-map'];
  if (precision.metadata?.schema !== 'donghaeng-precision-v1' || !precision.features?.length || precision.features.some(f=>f.properties.field_verified!==false || f.properties.routing_eligible!==false)) throw Error('정밀 검토 자료 오류');
  if (data['bundled-terrain'].meta.graph_sha256 !== graphHash) throw Error('지형·도로 버전 불일치');
  const facilities = Facilities.normalize([{data:data['bundled-facilities-seoul'],file:'seoul/seoul-facilities.geojson'}]);
  const datasetVersion = sha(Buffer.from(JSON.stringify(lock.data.map(d=>[d.id,d.sha256]))));
  return {data,lock,graphHash,datasetVersion,precision,facilities};
}
export function makeGraph(snapshot) {
  const graph = E.createGraph(snapshot.data['bundled-map-data']); graph.meta.graphSha256 = snapshot.graphHash;
  E.applyTerrain(graph,snapshot.data['bundled-terrain']);
  graph.meta.buildingAudit = Connections.create(snapshot.precision,snapshot.data['bundled-map-context']);
  graph.meta.allowAssistancePreview = false;
  graph.benches = F.stopCandidates(snapshot.facilities.features,E);
  graph.restPlaces = F.restCandidates(snapshot.facilities.features,E);
  return graph;
}
export function coverage(snapshot) {
  return {schema:'donghaeng-coverage-v1',datasetVersion:snapshot.datasetVersion,graphVersion:snapshot.graphHash,
    walking:{bounds:F.COVERAGE,state:'technical_preview',fieldVerified:false,citywide:false},
    precision:{sheets:snapshot.precision.metadata.sources.length,features:snapshot.precision.features.length,
      sourceCrs:snapshot.precision.metadata.source_crs,crsVerification:snapshot.precision.metadata.crs_verification,
      sourceAsOf:snapshot.precision.metadata.as_of,verticalDatum:snapshot.precision.metadata.vertical_datum,fieldVerified:false,citywide:false},
    facilities:{records:snapshot.facilities.features.length,scope:'Seoul registered records; completeness and current availability unverified'},
    transit:{state:'not_configured',citywide:false},newSlopeValuesPromoted:0,
    notice:'시설 표시 범위와 길 찾기·정밀자료·현장 검증 범위는 다릅니다.'};
}
