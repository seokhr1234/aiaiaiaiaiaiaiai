(function(root){'use strict';
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const keys=['wheelchair','avoidSteps','avoidSlope','rest','short','restKind','restMinutes','maxSlope','speed'];
function validate(review,input){
 const bad=()=>{throw Error('전체 여정 검토 결과를 확인하지 못했어요.')};
 if(review?.schema!=='donghaeng-journey-review-v1'||review.candidateId!==input.candidate.id||review.requestedAtTime!==input.atTime
  ||review.state!=='review_only'||!['unknown','violated'].includes(review.validationState)
  ||['gpsAllowed','aiEligible','fieldVerified','timetableVerified','accessibilityVerified'].some(k=>review[k]!==false)
  ||keys.some(k=>input.profile[k]!==undefined&&review.profile?.[k]!==input.profile[k])
  ||!Array.isArray(review.segments)||!review.segments.length||review.segments.length>13
  ||!Array.isArray(review.checks)||!review.checks.length||review.checks.length>160
  ||review.summary?.totalMinutes!==null||review.summary?.arrivalAt!==null)bad();
 const ids=new Set();for(const s of review.segments){
  if(typeof s.id!=='string'||ids.has(s.id)||!['walk','bus','subway'].includes(s.mode)||!point(s.from)||!point(s.to)
   ||s.timingKnown!==false||s.minutes!==null&&(!Number.isFinite(s.minutes)||s.minutes<0||s.minutes>1440))bad();ids.add(s.id);
 }
 const vehicles=input.candidate.legs.filter(l=>l.mode!=='walk');
 if(review.segments.length!==vehicles.length*2+1)bad();
 for(let i=0;i<review.segments.length;i++){
  const s=review.segments[i],v=vehicles[Math.floor(i/2)];
  const from=i%2?v.from:i?vehicles[i/2-1].to:input.origin,to=i%2?v.to:i===review.segments.length-1?input.destination:vehicles[i/2].from;
  if(s.mode!==(i%2?v.mode:'walk')||s.id!==(i%2?v.id:'W'+(i/2+1))||JSON.stringify(s.from)!==JSON.stringify(from)||JSON.stringify(s.to)!==JSON.stringify(to))bad();
 }
 for(const c of review.checks)if(!['satisfied','unknown','violated'].includes(c.state)||typeof c.label!=='string'||c.label.length>100||!ids.has(c.legId)&&c.legId!=='journey')bad();
 for(const state of ['satisfied','unknown','violated'])if(review.summary[state]!==review.checks.filter(c=>c.state===state).length)bad();
 if(review.checks.every(c=>c.state==='satisfied')||review.validationState!==(review.checks.some(c=>c.state==='violated')?'violated':'unknown'))bad();
 return review;
}
function createSession(segments,{onUpdate=()=>{},timers=root}={}){
 if(!Array.isArray(segments)||!segments.length||segments.length>13)throw Error('이동 순서가 비어 있거나 너무 많아요.');
 let index=0,phase='idle',timer=null,epoch=0,destroyed=false;
 const snapshot=()=>({index,phase,count:segments.length,segment:segments[index],simulated:true,gps:false});
 const emit=()=>{onUpdate(snapshot());return snapshot()};
 const clear=()=>{epoch++;if(timer!==null)timers.clearInterval(timer);timer=null};
 return {snapshot,select(i){if(destroyed||!Number.isInteger(i)||i<0||i>=segments.length)return false;clear();index=i;phase='manual';emit();return true},
  play(){if(destroyed)return false;clear();if(phase==='ended'||index===segments.length-1)index=0;phase='replay';const version=epoch;timer=timers.setInterval(()=>{if(version!==epoch)return;if(index<segments.length-1){index++;emit()}else{clear();phase='ended';emit()}},2500);return emit()},
  pause(){if(destroyed)return false;clear();phase='paused';return emit()},stop(){if(destroyed)return false;clear();index=0;phase='idle';return emit()},destroy(){destroyed=true;clear();phase='destroyed'},
  startGPS(){return false}};
}
function create({review,walkingLegs=[],map,fitBounds}){
 const doc=root.document,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
 const box=el('section',null,'journey-review'),title=el('h4','이동 순서'),notice=el('p','모의 확인 · 실제 GPS 안내 아님','gap-note');
 box.append(title,notice,el('p','도착 시각 미확인'+(review.summary.violated?' · 조건 불일치 '+review.summary.violated+'건':''),'journey-check-summary'));
 const evidence=el('details'),summary=el('summary','확인할 항목 '+review.summary.unknown+'건');evidence.append(summary);
 for(const c of review.checks)evidence.append(el('p',c.legId+' · '+c.label+' · '+({unknown:'미확인',violated:'조건 불일치',satisfied:'자료 확인'}[c.state]),'journey-check '+c.state));box.append(evidence);
 const status=el('p','구간을 넘기며 확인해요.','journey-progress');status.setAttribute('role','status');status.setAttribute('aria-live','polite');box.append(status);
 const allSteps=el('details',null,'journey-all-steps');allSteps.append(el('summary','전체 이동 순서'));const list=el('ol',null,'journey-steps');allSteps.append(list);box.append(allSteps);let marker=null;
 const previous=el('button','이전','secondary'),next=el('button','다음','secondary'),play=el('button','재생','secondary'),pause=el('button','일시정지','secondary'),stop=el('button','종료','secondary');
 const controls=el('div',null,'journey-controls');for(const b of [previous,next,play,pause,stop]){b.type='button';controls.append(b)}box.append(controls);
 const labels={walk:'도보 참고 구간',bus:'버스 승차 → 하차',subway:'지하철 승차 → 하차'},items=[];
 const session=createSession(review.segments,{onUpdate:s=>{
  status.textContent=(s.phase==='replay'?'모의 재생 · ':s.phase==='ended'?'재생 종료 · ':'수동 확인 · ')+(s.index+1)+'/'+s.count+' · '+labels[s.segment.mode];
  items.forEach((item,i)=>{item.classList.toggle('active',i===s.index);if(i===s.index)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current')});
  previous.disabled=s.index===0;next.disabled=s.index===s.count-1;pause.disabled=s.phase!=='replay';pause.hidden=s.phase!=='replay';play.hidden=s.phase==='replay';stop.hidden=['idle','manual'].includes(s.phase);
  if(marker){marker.remove();marker=null}
  const route=walkingLegs.find(l=>l.id===s.segment.walkingLegId)?.route;
  if(route?.coordinates?.length){fitBounds(root.L.latLngBounds(route.coordinates));marker=root.L.circleMarker(route.coordinates[0],{radius:7,color:'#486e8c',fillOpacity:1}).addTo(map).bindTooltip('모의 도보 시작점 · 실제 GPS 위치 아님')}
  // Vehicle geometry and missing walking gaps are never interpolated.
 }});
 for(const [i,s] of review.segments.entries()){const item=el('li'),b=el('button',labels[s.mode]+(s.minutes===null?' · 시간 미확인':' · 참고 '+s.minutes+'분'),'secondary');b.type='button';b.onclick=()=>session.select(i);item.append(b);items.push(item);list.append(item)}
 previous.onclick=()=>session.select(session.snapshot().index-1);next.onclick=()=>session.select(session.snapshot().index+1);play.onclick=()=>session.play();pause.onclick=()=>session.pause();stop.onclick=()=>session.stop();
 previous.disabled=true;next.disabled=review.segments.length<2;pause.disabled=true;pause.hidden=true;stop.hidden=true;
 const hide=()=>{if(doc.hidden)session.pause()};doc.addEventListener('visibilitychange',hide);
 return {element:box,session,destroy(){session.destroy();marker?.remove();doc.removeEventListener('visibilitychange',hide)}};
}
function createWalking(route,options){
 if(route?.state!=='reference_route'||route.fieldVerified!==false||route.accessibilityVerified!==false||!point(route.origin)||!point(route.destination)||!Number.isFinite(route.minutes)||route.minutes<0||!Array.isArray(route.coordinates)||route.coordinates.length<2||!route.coordinates.every(point))throw Error('서울 도보 참고 결과 형식을 확인하지 못했어요.');
 const review={schema:'donghaeng-journey-review-v1',candidateId:'walking',state:'review_only',profile:route.profile,
  requestedAtTime:null,validationState:'unknown',summary:{unknown:2,violated:0,satisfied:0,totalMinutes:null,arrivalAt:null},
  segments:[{id:'W1',mode:'walk',from:route.origin,to:route.destination,minutes:route.minutes,timingKnown:false,walkingLegId:'W1'}],
  checks:[{legId:'W1',key:'walking',label:'등록 도로의 실제 보도·경사·접근성',state:'unknown'},{legId:'W1',key:'endpoints',label:'실제 출입구·핀 접속',state:'unknown'}],gpsAllowed:false,aiEligible:false,fieldVerified:false};
 return create({...options,review,walkingLegs:[{id:'W1',route}]});
}
const api={validate,createSession,create,createWalking};if(typeof module!=='undefined')module.exports=api;else root.JourneyReview=api;
})(typeof globalThis==='undefined'?this:globalThis);
