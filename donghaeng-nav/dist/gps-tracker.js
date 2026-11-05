(function(root){'use strict';
const Quality=typeof module!=='undefined'?require('./gps-quality.js'):root.GPSQuality;
function create({geolocation=globalThis.navigator?.geolocation,now=()=>Date.now(),timers=globalThis,onUpdate=()=>{}}={}){
 const quality=Quality.create();
 let watch=null,timer=null,version=0,state={active:false,phase:'idle',fix:null};
 const emit=()=>{onUpdate({...state});return {...state}};
 function clear(){quality.reset();version++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;if(timer!==null)timers.clearInterval(timer);timer=null}
 function stop(){clear();state={active:false,phase:'stopped',fix:null};return emit()}
 function start(){clear();state={active:false,phase:'waiting',fix:null};if(!geolocation){state.phase='unsupported';emit();return false}state.active=true;const generation=version;emit();
  timer=timers.setInterval(()=>{if(generation===version&&state.fix&&now()-state.fix.timestamp>15000){state.phase='stale';emit()}},1000);
  try{const id=geolocation.watchPosition(pos=>{if(generation!==version)return;const c=pos.coords,result=quality.consume({latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,heading:c.heading,speed:c.speed,timestamp:pos.timestamp},now());if(!result.accepted){if(result.reason==='duplicate')return;state={...state,phase:'acquiring',qualityMessage:result.message};emit();return}state={active:true,phase:'tracking',fix:result.raw,displayFix:result.display,qualityMessage:'위치 표시 안정화 · 수신 오차는 그대로 표시'};emit()},err=>{if(generation!==version)return;if(err.code===1){clear();state={active:false,phase:'denied',fix:null}}else state={...state,phase:err.code===3?'timeout':'unavailable'};emit()},{enableHighAccuracy:true,maximumAge:0,timeout:15000});if(version===generation)watch=id;else geolocation.clearWatch(id)}catch{clear();state={active:false,phase:'unavailable',fix:null};emit();return false}return state.active;
 }
 return {start,stop,snapshot:()=>({...state})};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else root.GPSTracker=api;
})(typeof globalThis==='undefined'?this:globalThis);
