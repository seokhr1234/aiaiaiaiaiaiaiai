import {point,ServiceError} from '../expansion/contracts.mjs';
// Recompute every walking/transfer leg. A timetable callback must prove that a
// particular service can still be boarded after the new arrival time.
export async function validateJourney(candidate,input,{walk,boarding,access,now=()=>Date.now(),signal}={}){
 if(!candidate||!Array.isArray(candidate.legs)||!candidate.legs.length||candidate.legs.length>60||candidate.legs.some(l=>!['walk','bus','subway'].includes(l.mode)||!point(l.from)||!point(l.to)||!Number.isFinite(l.providerMinutes)||l.providerMinutes<0||l.providerMinutes>1440))throw new ServiceError(502,'invalid_journey','여정 구간 형식을 확인하지 못했어요.');
 const checks=[],legs=[];let at=Date.parse(input.atTime),providerElapsed=0,restConfirmed=false;
 const add=(key,state,leg,reason)=>checks.push({key,state,legId:leg.id,reason});
 if(candidate.legs[0].from.some((v,i)=>v!==input.origin[i]))add('origin_connection','unknown',candidate.legs[0],'origin_connection_missing');
 if(candidate.legs.at(-1).to.some((v,i)=>v!==input.destination[i]))add('destination_connection','unknown',candidate.legs.at(-1),'destination_connection_missing');
 const profile={...input.profile};
 for(const leg of candidate.legs){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const next={...leg};
  if(leg.mode==='walk'){
   let r;
   try{r=point(leg.from)&&point(leg.to)&&await walk?.({origin:leg.from,destination:leg.to,profile:{...profile},atTime:new Date(at).toISOString()},{signal})}catch(e){if(signal?.aborted)throw e;r=null}
   if(!r||r.profile&&['wheelchair','avoidSteps','avoidSlope','rest','restKind','restMinutes','maxSlope'].some(k=>k in profile&&r.profile[k]!==profile[k])){
    add('walking','unknown',leg,'walking_or_profile_not_verified');at+=leg.providerMinutes*60000;
   }else{
    next.walking=r;const minutes=r.minutes;
    if(r.state==='violated'){add('walking','violated',leg,'walking_conditions_violated');at+=leg.providerMinutes*60000}
    else if(!Number.isFinite(minutes)||minutes<0){add('walking','unknown',leg,'walking_duration_missing');at+=leg.providerMinutes*60000}
    else{at+=minutes*60000;add('walking',r.state==='satisfied'?'satisfied':r.state==='violated'?'violated':'unknown',leg,'walking_connection_and_conditions');if(r.restWaypointEligible===true)restConfirmed=true}
   }
  }else{
   const evidence=await access?.(leg,{profile,atTime:new Date(at).toISOString(),signal});
   const fresh=evidence&&Number.isFinite(Date.parse(evidence.observedAt))&&Number.isFinite(Date.parse(evidence.expiresAt))&&Date.parse(evidence.observedAt)<=Math.min(now(),at)&&Date.parse(evidence.expiresAt)>Math.max(now(),at);
   const requiresAccess=profile.wheelchair||profile.avoidSteps||profile.avoidSlope||profile.maxSlope!=null;
   add(requiresAccess?'accessibility':'boarding_connection',fresh&&['satisfied','violated'].includes(evidence.state)?evidence.state:'unknown',leg,fresh?'boarding_and_indoor_connection':'accessibility_missing_or_stale');
   const departure=await boarding?.(leg,{earliestBoardingAt:new Date(at).toISOString(),profile,signal});
   const dep=Date.parse(departure?.departsAt),arr=Date.parse(departure?.arrivesAt);
   if(departure?.state==='violated')add('schedule','violated',leg,'service_not_boardable');
   else if(departure?.state==='satisfied'&&Number.isFinite(dep)&&dep>=at&&Number.isFinite(arr)&&arr>=dep){at=arr;next.departsAt=new Date(dep).toISOString();next.arrivesAt=new Date(arr).toISOString();add('schedule','satisfied',leg,'service_after_recomputed_walk')}
   else{at+=leg.providerMinutes*60000;add('schedule','unknown',leg,'boarding_schedule_missing_or_departed')}
  }
  providerElapsed+=leg.providerMinutes*60000;next.estimatedEndsAt=new Date(at).toISOString();legs.push(next);
 }
 if(profile.rest)add('rest',restConfirmed?'satisfied':'unknown',{id:'journey'},'vehicle_riding_is_not_rest_confirmation');
 if(profile.restMinutes)add('rest_interval','unknown',{id:'journey'},'repeated_rest_schedule_not_implemented');
 const state=checks.some(c=>c.state==='violated')?'violated':checks.some(c=>c.state==='unknown')?'unknown':'satisfied';
 return {...candidate,profile,legs,checks,validationState:state,state:state==='satisfied'?'validated_candidate':'review_only',
  fieldVerified:false,estimatedMinutes:(at-Date.parse(input.atTime))/60000,providerLegMinutes:providerElapsed/60000,
  estimatedArrival:new Date(at).toISOString(),notice:state==='satisfied'?'기록된 조건·시각 검사 통과 · 현장 안전 인증 아님':'보행·접근성·환승 시각의 미확인 항목이 있어요.'};
}
