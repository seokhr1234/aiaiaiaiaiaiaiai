import {loadTransitPack} from './provider.mjs';
import {createLocalTimetable} from './timetable.mjs';
import {createAccessEvidence} from './evidence.mjs';
import {createJourneyReviewer} from './journey-review.mjs';
import {createWalkReviewService,createWalkReviewHandler} from './walk-review.mjs';
export function reviewServiceForPack(pack,{now=()=>Date.now(),walk}={}) {
 const reviewer=createJourneyReviewer({now,boarding:pack?.timetable?.trips?.length?createLocalTimetable(pack.timetable,{now}):undefined,
  access:createAccessEvidence(pack?.accessEvidence||[],{now}),restOpportunities:pack?.restOpportunities||[]});
 return createWalkReviewService({journeyReviewer:reviewer,...(walk?{walk}:{})});
}
// Config comes only from the server environment, never the browser request.
export function createConfiguredWalkReviewHandler({getConfig=()=>({})}={}) {
 let servicePromise,signature='';
 return createWalkReviewHandler({getService:async()=>{
  const config=getConfig(),next=JSON.stringify(config);
  if(!servicePromise||next!==signature){signature=next;servicePromise=loadTransitPack(config.localPackFile).then(pack=>reviewServiceForPack(pack))}
  return servicePromise;
 }});
}
