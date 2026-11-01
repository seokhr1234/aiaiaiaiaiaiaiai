(function(root){'use strict';const Plan=typeof module!=='undefined'?require('./navigation-plan.js'):root.NavigationPlan,Policy=typeof module!=='undefined'?require('./navigation-policy.js'):root.NavigationPolicy;
function create(plan,options={}){
 const policy={...Policy,...options};let lastTimestamp=-Infinity,lastFix=null,lastMatch=null,offSince=null,offCount=0,arrivalSince=null,pendingBackward=null,restDone=!!plan.restFulfilled,resting=false,lastNow=0;
 let state={phase:'waiting',progress:0,remaining:plan.length,match:null,fix:null,restStatus:plan.rest?'pending':'none',arrival:false,message:'새 GPS 위치를 기다리고 있어요.'};
 function snapshot(){return {...state,profile:plan.profile,planVersion:plan.version}}
 function publish(phase,message,extra={}){if(['unstable','ambiguous','uncertain','signal-lost','signal-delayed'].includes(phase)){offSince=null;offCount=0;arrivalSince=null}state={...state,...extra,phase,message};return snapshot()}
 function consume(input,now=Date.now()){
  lastNow=now;
  const fix={ll:[input.latitude,input.longitude],accuracy:input.accuracy,timestamp:input.timestamp,heading:input.heading,speed:input.speed};
  if(!fix.ll.every(Number.isFinite)||Math.abs(fix.ll[0])>90||Math.abs(fix.ll[1])>180||!Number.isFinite(fix.accuracy)||fix.accuracy<=0||!Number.isFinite(fix.timestamp))return publish('unstable','위치 표본 형식을 확인하고 있어요.');
  if(fix.timestamp<=lastTimestamp)return snapshot();
  if(fix.timestamp>now+2000||now-fix.timestamp>policy.maxSampleAge)return publish('unstable','오래된 GPS 위치입니다. 새 위치를 기다려 주세요.');
  lastTimestamp=fix.timestamp;state.fix=fix;
  if(fix.accuracy>policy.maxAccuracy){offSince=null;offCount=0;arrivalSince=null;return publish('unstable','GPS 오차가 커서 자동 진행을 보류합니다.',{arrival:false})}
  if(lastFix){const dt=(fix.timestamp-lastFix.timestamp)/1000,travel=Plan.distance(lastFix.ll,fix.ll);if(dt>0&&travel>policy.maxSpeed*dt+2*(lastFix.accuracy+fix.accuracy)){lastFix=null;offSince=null;offCount=0;arrivalSince=null;return publish('unstable','위치가 크게 바뀌었어요. 연속 위치를 다시 확인합니다.',{arrival:false})}}
  const previousFix=lastFix;lastFix=fix;
  const candidates=Plan.nearby(plan,fix.ll,Math.max(50,fix.accuracy*2)).map(s=>{const p=Plan.project(fix.ll,s.a,s.b),progress=s.start+p.t*s.length;let score=p.distance;
   if(lastMatch){const dt=previousFix?(fix.timestamp-previousFix.timestamp)/1000:1,change=Math.abs(progress-lastMatch.progress);score+=Math.max(0,change-(policy.maxSpeed*dt+fix.accuracy*2))*.4;if(s.layer!==lastMatch.segment.layer)score+=18}
   if(Number.isFinite(fix.heading)&&fix.speed>.7){const angle=Math.abs((fix.heading-s.heading+540)%360-180);score+=Math.min(angle,Math.abs(180-angle))*.04}
   return {...p,progress,segment:s,score};
  }).sort((a,b)=>a.score-b.score),best=candidates[0];
  const limit=Math.max(policy.offrouteMeters,1.5*fix.accuracy);
  const atRestConnection=plan.rest&&!restDone&&Math.abs(best.progress-plan.rest.at)<50&&Plan.distance(fix.ll,plan.rest.ll)<=policy.restRadius&&best.distance<=Math.max(limit,(plan.rest.gap||0)+fix.accuracy);
  if(best.distance>limit&&!atRestConnection){arrivalSince=null;if(fix.accuracy<=policy.goodAccuracy){offSince??=now;offCount++}else{offSince=null;offCount=0}return publish(offSince!==null&&now-offSince>=policy.offrouteMs&&offCount>=policy.offrouteSamples?'offroute':'offroute-suspect',offSince!==null&&now-offSince>=policy.offrouteMs&&offCount>=policy.offrouteSamples?'경로 이탈이 확인됐어요. 현재 위치에서 같은 조건으로 다시 찾을 수 있습니다.':'경로에서 벗어났는지 위치를 확인하고 있어요.',{crossTrack:best.distance,arrival:false})}
  offSince=null;offCount=0;
  const alternative=candidates.find(c=>c.segment.index!==best.segment.index&&(Math.abs(c.progress-best.progress)>Math.max(30,fix.accuracy*2)||c.segment.layer!==best.segment.layer));
  const ambiguous=alternative&&alternative.distance<=fix.accuracy&&Math.abs(alternative.score-best.score)<Math.max(4,fix.accuracy*.35);
  if(ambiguous){arrivalSince=null;return publish('ambiguous','겹치는 길·층위의 위치를 확정하기 어려워요. 연결을 확인해 주세요.',{arrival:false})}
  if(fix.accuracy>policy.goodAccuracy)return publish('unstable','GPS 정확도가 낮아 구간 전환을 보류합니다.',{crossTrack:best.distance,arrival:false});
  if(lastMatch&&best.progress<lastMatch.progress-8){if(pendingBackward&&Math.abs(pendingBackward.progress-best.progress)<20)pendingBackward.count++;else pendingBackward={progress:best.progress,count:1};if(pendingBackward.count<3)return publish('uncertain','되돌아가는 이동인지 확인하고 있어요.',{arrival:false})}else pendingBackward=null;
  const stationary=previousFix&&Plan.distance(previousFix.ll,fix.ll)<Math.max(2,Math.min(8,fix.accuracy*.5));
  let progress=best.progress;if(lastMatch&&stationary&&Math.abs(progress-lastMatch.progress)<10)progress=lastMatch.progress;
  lastMatch={...best,progress};
  const event=plan.events.find(e=>e.at>progress+5)||plan.events.at(-1),remaining=Math.max(0,plan.length-progress);
  const restNear=plan.rest&&!restDone&&Math.abs(progress-plan.rest.at)<35&&Plan.distance(fix.ll,plan.rest.ll)<=Math.max(policy.restRadius,fix.accuracy);
  const destinationNear=best.distance<=Math.max(4,Math.min(8,fix.accuracy))&&remaining<=policy.arrivalRemaining&&fix.accuracy<=policy.arrivalAccuracy&&Plan.distance(fix.ll,plan.destination.ll)<=policy.arrivalRadius;
  if(destinationNear)arrivalSince??=now;else arrivalSince=null;
  const arrival=arrivalSince!==null&&now-arrivalSince>=policy.arrivalDwellMs;
  const phase=resting?'resting':arrival?'arrival-near':restNear?'rest-near':best.segment.caution?'connection-check':'navigating';
  state={...state,progress,remaining,match:{ll:best.ll,index:best.segment.index,layer:best.segment.layer},fix,event,distanceToEvent:Math.max(0,event.at-progress),restStatus:restDone?'completed':resting?'resting':restNear?'near':plan.rest?'pending':'none',arrival,phase,message:phase==='connection-check'?'구조물·층위의 실제 연결을 확인하세요.':arrival?'목적지 인근입니다. 실제 출입구와 도착 여부를 확인해 주세요.':restNear?'휴식 지점 인근입니다. 이용 상태를 확인해 주세요.':resting?'쉬는 중 · 이동 재개를 누르면 남은 경로를 확인합니다.':event.label};return snapshot();
 }
 function tick(now){if(!state.fix)return snapshot();const age=now-state.fix.timestamp;if(age>=policy.lostMs){arrivalSince=null;return publish('signal-lost','GPS 신호가 오래 갱신되지 않아 안내를 보류합니다.',{arrival:false})}if(age>=policy.staleMs)return publish('signal-delayed','GPS 갱신이 지연되고 있어요.',{arrival:false});return snapshot()}
 function rest(action){if(!plan.rest)return snapshot();if(action==='start'&&state.restStatus==='near'){resting=true;return publish('resting','휴식 중 · 실제 위치와 이용 상태를 확인하세요.',{restStatus:'resting'})}if(action==='resume'&&resting||action==='skip'){resting=false;restDone=true;return publish('waiting',action==='skip'?'휴식 장소를 지나갑니다. 휴식 완료를 뜻하지 않습니다.':'휴식을 마쳤어요. 새 위치에서 이동을 재개합니다.',{restStatus:action==='skip'?'skipped':'completed'})}return snapshot()}
 return {consume,tick,rest,snapshot,resetPosition(){lastFix=null;lastMatch=null;lastTimestamp=-Infinity;arrivalSince=null;offSince=null;offCount=0;return publish('waiting','새 GPS 위치를 확인하고 있어요.',{arrival:false,match:null,fix:null})},plan};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else root.NavigationCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
