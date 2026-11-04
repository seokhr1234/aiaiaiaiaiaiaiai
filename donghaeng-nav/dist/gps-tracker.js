(function(root){'use strict';
function create({geolocation=globalThis.navigator?.geolocation,now=()=>Date.now(),timers=globalThis,onUpdate=()=>{}}={}){
 let watch=null,timer=null,version=0,state={active:false,phase:'idle',fix:null};
 const emit=()=>{onUpdate({...state});return {...state}};
 function clear(){version++;if(watch!==null)geolocation?.clearWatch(watch);watch=null;if(timer!==null)timers.clearInterval(timer);timer=null}
 function stop(){clear();state={active:false,phase:'stopped',fix:null};return emit()}
 function start(){clear();state={active:false,phase:'waiting',fix:null};if(!geolocation){state.phase='unsupported';emit();return false}state.active=true;const generation=version;emit();
  timer=timers.setInterval(()=>{if(generation===version&&state.fix&&now()-state.fix.timestamp>15000){state.phase='stale';emit()}},1000);
  try{const id=geolocation.watchPosition(pos=>{if(generation!==version)return;const c=pos.coords,t=pos.timestamp;if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||!Number.isFinite(t)||now()-t>15000||t>now()+5000||state.fix&&t<state.fix.timestamp)return;state={active:true,phase:'tracking',fix:{ll:[c.latitude,c.longitude],accuracy:c.accuracy,timestamp:t}};emit()},err=>{if(generation!==version)return;if(err.code===1){clear();state={active:false,phase:'denied',fix:null}}else state={...state,phase:err.code===3?'timeout':'unavailable'};emit()},{enableHighAccuracy:true,maximumAge:0,timeout:15000});if(version===generation)watch=id;else geolocation.clearWatch(id)}catch{clear();state={active:false,phase:'unavailable',fix:null};emit();return false}return state.active;
 }
 return {start,stop,snapshot:()=>({...state})};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else root.GPSTracker=api;
})(typeof globalThis==='undefined'?this:globalThis);
