import {createHash} from 'node:crypto';
import {accessRequirements,createAccessEvidence,validateRestSchedule} from './evidence.mjs';

const labels={walking:'보행 연결·조건',stop_mapping:'실제 승하차·출입구 대응',schedule:'승차·환승·막차',
 stop_connection:'정류장·출입구 연결',indoor_connection:'역내 환승 연결',step_free_connection:'계단 없는 접속',
 low_floor_vehicle:'해당 운행편 저상차량',wheelchair_space:'휠체어 승차 공간',surface_slope:'접속 노면 경사',rest:'반복 휴식 일정'};
export function createJourneyReviewer({boarding,access=createAccessEvidence(),restOpportunities=[],now=()=>Date.now()}={}) {
 return async function review(input,walkingReview,{signal}={}) {
  const segments=[],checks=[],vehicles=input.vehicleLegs;let cursor=Date.parse(input.atTime),timingKnown=true;
  const add=(key,state,legId,reason)=>checks.push({key,label:labels[key],state,legId,reason});
  const safe=async(fn,...args)=>{signal?.throwIfAborted();try{const value=await fn?.(...args);signal?.throwIfAborted();return value}catch(e){signal?.throwIfAborted();return null}};
  for(let i=0;i<walkingReview.walkingLegs.length;i++) {
   signal?.throwIfAborted();const w=walkingReview.walkingLegs[i],r=w.route;
   // The current city graph is a reference: even a calculated line is not a
   // verified entrance connection or a measured wheelchair surface.
   segments.push({id:w.id,mode:'walk',role:w.role,from:w.from,to:w.to,minutes:r?.minutes??null,
    routeVersion:r?createHash('sha256').update(JSON.stringify([r.datasetVersion,r.sourceNodeIds,input.profile])).digest('hex'):null,providerMinutes:w.providerMinutes,timingKnown:false,state:r?'reference_route':'unresolved',walkingLegId:w.id});
   add('walking','unknown',w.id,r?'reference_street_not_verified_connection':w.code||'walking_missing');
   add('stop_mapping','unknown',w.id,'entrance_direction_and_level_unmapped');
   if(r)cursor+=r.minutes*60000;else timingKnown=false;
   if(i===vehicles.length)break;
   const leg=vehicles[i],at=new Date(cursor).toISOString();
   const slot=await safe(boarding,leg,{earliestBoardingAt:timingKnown?at:null,signal,profile:{...input.profile}});
   const dep=Date.parse(slot?.departsAt),arr=Date.parse(slot?.arrivesAt);
   const scheduled=slot?.state==='satisfied'&&Number.isFinite(dep)&&dep>=cursor&&Number.isFinite(arr)&&arr>=dep;
   const item={id:leg.id,mode:leg.mode,from:leg.from,to:leg.to,minutes:leg.providerMinutes,providerMinutes:leg.providerMinutes,
    timingKnown:false,state:'provider_reference',scheduleState:scheduled?'scheduled_reference':'unknown',
    scheduledDepartsAt:scheduled?new Date(dep).toISOString():null,scheduledArrivesAt:scheduled?new Date(arr).toISOString():null};
   add('schedule',slot?.state==='violated'?'violated':'unknown',leg.id,scheduled?'scheduled_only_connections_and_realtime_unverified':slot?.reason||'timetable_missing');
   const evidence=await safe(access,leg,{profile:{...input.profile},atTime:at,untilTime:scheduled?new Date(arr).toISOString():at,tripId:slot?.tripId,signal});
   for(const key of accessRequirements(leg,input.profile)) {
    const c=evidence?.checks?.find(c=>c.key===key);
    // Without a particular timed service, fresh vehicle/equipment evidence
    // cannot establish availability for the requested journey.
    add(key,scheduled&&['satisfied','violated'].includes(c?.state)?c.state:'unknown',leg.id,scheduled?'server_owned_evidence':'service_and_access_evidence_missing');
   }
   segments.push(item);if(scheduled)cursor=arr;else{cursor+=leg.providerMinutes*60000;timingKnown=false}
  }
  const rest=validateRestSchedule(segments,restOpportunities,input.profile,{startTime:input.atTime,now:now()});
  if(rest.state!=='not_required')add('rest',rest.state,'journey',rest.reason);
  const state=checks.some(c=>c.state==='violated')?'violated':'unknown';
  return {schema:'donghaeng-journey-review-v1',candidateId:input.candidateId,profile:input.profile,requestedAtTime:input.atTime,
   state:'review_only',validationState:state,segments,checks,rest,
   summary:{satisfied:checks.filter(c=>c.state==='satisfied').length,unknown:checks.filter(c=>c.state==='unknown').length,
    violated:checks.filter(c=>c.state==='violated').length,registeredWalkingMinutes:walkingReview.summary.estimatedWalkingMinutes,
    vehicleReferenceMinutes:vehicles.reduce((n,l)=>n+l.providerMinutes,0),totalMinutes:null,arrivalAt:null},
   gpsAllowed:false,aiEligible:false,fieldVerified:false,timetableVerified:false,accessibilityVerified:false,
   notice:'참고 도로·승하차 순서입니다. 실제 출입구·운행편·접근성이 확인되지 않아 GPS 길 안내와 AI 추천 대상으로 사용하지 않습니다.'};
 };
}
