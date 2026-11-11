import {parentPort} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {loadSnapshot,makeGraph,E,F,Connections} from '../expansion/snapshot.mjs';
const require=createRequire(import.meta.url),Candidates=require('../../dist/route-candidates.js'),Endpoint=require('../../dist/endpoint-routing.js');
let ready;
parentPort.on('message',async({id,input})=>{
 try {
  ready ||= loadSnapshot().then(snapshot=>({snapshot,graph:makeGraph(snapshot)}));
  const {snapshot,graph}=await ready;
  if(!F.inCoverage(input.origin)||!F.inCoverage(input.destination)) throw Object.assign(Error('길 찾기는 현재 검토한 월곡역 주변에서 지원해요.'),{status:422,code:'outside_coverage'});
  const profile=E.wheelchairProfile(input.profile),p={...profile,atTime:input.atTime};
  const generated=await Candidates.generate(E,Endpoint,graph,input.origin,input.destination,p);
  const routes=generated.routes.map(r=>({...r,p:profile,connectionReview:Connections.routeReview(graph.meta.buildingAudit,r,input.origin,input.destination)}));
  parentPort.postMessage({id,result:{schema:'donghaeng-walk-v1',datasetVersion:snapshot.datasetVersion,graphVersion:snapshot.graphHash,
    profile,atTime:input.atTime,routes,diagnostics:generated.diagnostics,attempts:generated.attempts,fieldVerified:false,
    state:routes.length?'technical_preview':'no_eligible_candidate',notice:'지도 자료의 조건 검사 결과이며 현장 통행 검증이 아닙니다.'}});
 }catch(error){parentPort.postMessage({id,error:{status:error.status||503,code:error.code||'routing_unavailable',message:error.status?error.message:'검증된 경로 자료를 준비하지 못했어요.'}})}
});
