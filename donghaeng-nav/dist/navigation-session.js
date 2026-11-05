(function(root){'use strict';const Core=typeof module!=='undefined'?require('./navigation-core.js'):root.NavigationCore,Policy=typeof module!=='undefined'?require('./navigation-policy.js'):root.NavigationPolicy;
const Quality=typeof module!=='undefined'?require('./gps-quality.js'):root.GPSQuality;
function create(plan,{geolocation=globalThis.navigator?.geolocation,now=()=>Date.now(),onUpdate=()=>{},reroute=null,autoReroute=Policy.autoReroute,timers=globalThis}={}){
 const quality=Quality.create();let displayFix=null,qualityReason=null,qualityAccuracy=null;
 let core=Core.create(plan),watch=null,pulse=null,epoch=0,active=false,mode='gps',phase='idle',inFlight=false,lastReroute=-Infinity,restOutcome=null,unavailableRestIds=new Set();
 function snapshot(){return {...core.snapshot(),phase:phase||core.snapshot().phase,mode,active,rerouting:inFlight,restOutcome,autoReroute,technicalTrial:true,displayFix,qualityReason,qualityAccuracy}}
 function emit(){const value=snapshot();onUpdate(value);return value}
 function clear(){epoch++;if(watch!==null){geolocation?.clearWatch(watch);watch=null}if(pulse!==null){timers.clearInterval(pulse);pulse=null}inFlight=false}
 function accept(sample,time=now()){
  if(!active)return snapshot();
  if(mode==='gps'){
   const result=quality.consume(sample,time);if(result.reason==='duplicate')return snapshot();qualityReason=result.reason;qualityAccuracy=Number.isFinite(result.raw?.accuracy)?result.raw.accuracy:null;
   if(!result.accepted){core.hold(result.message);phase=null;emit();return snapshot()}
   if(result.reacquired)core.resetPosition();displayFix=result.display;sample=result.sample;
  }
  const s=core.consume(sample,time);phase=inFlight?'rerouting':null;emit();if(s.phase==='offroute'&&autoReroute)requestReroute();return snapshot();
 }
 function start({replay=false}={}){
  clear();mode=replay?'replay':'gps';if(!replay&&core.plan.assistancePreview){phase='blocked';active=false;emit();return false}
  if(!replay&&!geolocation){phase='unsupported';active=false;emit();return false}
  active=true;phase='waiting';quality.reset();displayFix=null;qualityReason=null;qualityAccuracy=null;core.resetPosition();const generation=epoch;
  if(!replay){
   pulse=timers.setInterval(()=>{if(active&&generation===epoch){core.tick(now());if(!['paused','hidden','rerouting','reroute-failed','unavailable','timeout'].includes(phase))phase=null;emit()}},1000);
   try{const id=geolocation.watchPosition(pos=>{if(active&&generation===epoch)accept({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,heading:pos.coords.heading,speed:pos.coords.speed,timestamp:pos.timestamp})},err=>{if(generation!==epoch)return;if(err.code===1){clear();active=false;phase='denied'}else{quality.reset();displayFix=null;core.resetPosition();phase=err.code===3?'timeout':'unavailable'}emit()},{enableHighAccuracy:true,maximumAge:0,timeout:15000});if(active&&generation===epoch)watch=id;else geolocation.clearWatch(id)}catch{clear();active=false;phase='unavailable';emit();return false}
  }
  emit();return true;
 }
 async function requestReroute(){
  const s=core.snapshot();if(!active||inFlight||!reroute||!s.fixUsable||!s.fix||s.fix.accuracy>Policy.rerouteAccuracy||now()-s.fix.timestamp>Policy.maxSampleAge||now()-lastReroute<Policy.rerouteCooldown)return false;
  inFlight=true;phase='rerouting';const generation=epoch,version=core.plan.version,profile=core.plan.profile;emit();
  try{const result=await reroute(s.fix,profile,{restOutcome,unavailableRestIds:[...unavailableRestIds],plan:core.plan});if(!active||generation!==epoch||version!==core.plan.version)return false;
   if(!result||result.assistancePreview)throw Error('unsafe replacement');core=Core.create(result);quality.reset();displayFix=null;lastReroute=now();phase='waiting';emit();return true;
  }catch{if(generation===epoch&&active){lastReroute=now();phase='reroute-failed';emit()}return false}
  finally{if(generation===epoch){inFlight=false;emit()}}
 }
 return {start,accept,snapshot,requestReroute,getPlan:()=>core.plan,
  stop(){clear();active=false;phase='ended';return emit()},
  pause(){clear();active=false;phase='paused';return emit()},
  resume(){return start({replay:mode==='replay'})},
  hidden(){if(!active)return;clear();active=false;phase='hidden';emit()},
  rest(action){if(action==='unavailable'){if(core.plan.rest)unavailableRestIds.add(core.plan.rest.id);restOutcome='unavailable';return requestReroute()}const s=core.rest(action);if(action==='resume'&&s.restStatus==='completed')restOutcome='completed';if(action==='skip')restOutcome='skipped';phase=null;return emit()},
  confirmArrival(){const s=core.snapshot();if(!active||inFlight||['paused','hidden','rerouting','reroute-failed','ended','arrived'].includes(phase)||s.phase!=='arrival-near'||!s.arrival||!s.fixUsable||!s.fix||now()-s.fix.timestamp>Policy.maxSampleAge||s.fix.accuracy>Policy.arrivalAccuracy)return false;clear();active=false;phase='arrived';emit();return true}
 };
}
const api={create};if(typeof module!=='undefined')module.exports=api;else root.NavigationSession=api;
})(typeof globalThis==='undefined'?this:globalThis);
