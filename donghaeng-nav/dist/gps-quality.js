(function(root){'use strict';
const distance=(a,b)=>Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*111195*Math.cos((a[0]+b[0])*Math.PI/360));
// Display stabilization does not manufacture a better sensor accuracy. Routing
// receives the accepted original fix; filtered coordinates are display-only.
function create({maxAge=8000,maxAccuracy=50,maxSpeed=5}={}){
 let last=null,display=null,variance=0,seen=-Infinity,pending=null;
 function reset(){last=null;display=null;variance=0;seen=-Infinity;pending=null}
 function consume(input,now=Date.now()){
  const raw={ll:[input.latitude,input.longitude],accuracy:input.accuracy,timestamp:input.timestamp,heading:input.heading,speed:input.speed};
  const reject=(reason,message)=>({accepted:false,reason,message,raw,display});
  if(!raw.ll.every(Number.isFinite)||Math.abs(raw.ll[0])>90||Math.abs(raw.ll[1])>180||!Number.isFinite(raw.accuracy)||raw.accuracy<=0||!Number.isFinite(raw.timestamp))return reject('invalid','위치 표본을 확인하고 있어요.');
  if(raw.timestamp>now+2000||now-raw.timestamp>maxAge)return reject('stale','새 GPS 위치를 기다리고 있어요.');
  if(raw.timestamp<=seen)return reject('duplicate','이미 처리한 위치입니다.');seen=raw.timestamp;
  if(raw.accuracy>maxAccuracy){pending=null;return reject('accuracy',`수신 오차 약 ${Math.round(raw.accuracy)}m · 탁 트인 곳에서 위치를 다시 확인해 주세요.`);}
  let reacquired=false;
  if(last){
   const dt=(raw.timestamp-last.timestamp)/1000,jump=distance(last.ll,raw.ll),limit=Math.max(20,maxSpeed*dt+last.accuracy+raw.accuracy);
   if(dt>15){last=null;display=null;pending=null;reacquired=true}
   else if(jump>limit){
    if(pending&&raw.timestamp-pending.last.timestamp<=4000&&distance(pending.last.ll,raw.ll)<=Math.max(10,raw.accuracy+pending.last.accuracy))pending={...pending,last:raw,count:pending.count+1};
    else pending={last:raw,since:raw.timestamp,count:1};
    if(pending.count<3||raw.timestamp-pending.since<2000)return reject('jump','위치가 갑자기 바뀌어 연속 신호를 확인하고 있어요.');
    last=null;display=null;pending=null;reacquired=true;
   }else pending=null;
  }
  if(!display){display={ll:raw.ll.slice()};variance=Math.pow(raw.accuracy/2,2)}
  else{
   const dt=Math.max(.1,(raw.timestamp-last.timestamp)/1000),movement=distance(display.ll,raw.ll);
   const predicted=variance+Math.pow(1.5*dt,2),measurement=Math.pow(raw.accuracy/2,2);
   let gain=Math.max(.15,Math.min(.9,predicted/(predicted+measurement)));
   if(Number.isFinite(raw.speed)&&raw.speed<.3&&movement<Math.min(8,raw.accuracy*.5))gain*=.25;
   display={ll:display.ll.map((x,i)=>x+gain*(raw.ll[i]-x))};variance=(1-gain)*predicted;
  }
  display={...display,accuracy:raw.accuracy+distance(display.ll,raw.ll),rawAccuracy:raw.accuracy,timestamp:raw.timestamp};last=raw;
  return {accepted:true,reason:reacquired?'reacquired':'accepted',reacquired,raw,display,sample:{...input}};
 }
 return {consume,reset};
}
const api={create,distance};if(typeof module!=='undefined')module.exports=api;else root.GPSQuality=api;
})(typeof globalThis==='undefined'?this:globalThis);
