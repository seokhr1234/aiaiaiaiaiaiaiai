(function(root){'use strict';
const R=6371000,rad=Math.PI/180;
function distance(a,b){return Math.hypot((b[1]-a[1])*Math.cos((a[0]+b[0])*rad/2),b[0]-a[0])*rad*R}
function project(point,a,b){const c=Math.cos((a[0]+b[0])*rad/2),x=(point[1]-a[1])*c*rad*R,y=(point[0]-a[0])*rad*R,dx=(b[1]-a[1])*c*rad*R,dy=(b[0]-a[0])*rad*R,t=Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy||1)));return {t,ll:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],distance:Math.hypot(x-t*dx,y-t*dy)}}
function layer(e){return [e.layer??'0',e.level??'0',e.bridge?'bridge':'',e.tunnel?'tunnel':'',e.indoor??'no'].join(':')}
function bearing(a,b){return Math.atan2((b[1]-a[1])*Math.cos(a[0]*rad),b[0]-a[0])/rad}
function create(route,{origin,destination,profile=route.p||{},version=1,graphHash=null}={}){
 if(!Array.isArray(route.coords)||route.coords.length<2||route.edges?.length!==route.coords.length-1||route.coords.some(p=>!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)||Math.abs(p[0])>90||Math.abs(p[1])>180))throw Error('안내 경로 형식이 올바르지 않습니다.');
 let length=0;const segments=route.edges.map((edge,i)=>{const a=route.coords[i],b=route.coords[i+1],d=distance(a,b),s={index:i,a,b,edge,layer:layer(edge),start:length,length:d,end:length+d,heading:bearing(a,b),caution:!!(edge.bridge||edge.tunnel||String(edge.layer??'0')!=='0'||edge.steps||edge.slopeScreening?.kind==='structure_unresolved')};length+=d;return s});
 const events=[];
 for(let i=1;i<segments.length;i++){
  const s=segments[i],before=segments[i-1];let left=i-1,right=i;
  while(left>0&&s.start-segments[left].start<12)left--;while(right<segments.length-1&&segments[right].end-s.start<12)right++;
  const angle=(bearing(s.a,segments[right].b)-bearing(segments[left].a,s.a)+540)%360-180;
  if(Math.abs(angle)>=40||s.edge.id!==before.edge.id||s.caution!==before.caution)events.push({index:i,at:s.start,ll:s.a,label:s.caution?'구간 연결·층위를 확인하세요':s.edge.steps?'등록 계단 구간 확인':Math.abs(angle)>145?'되돌아가는 방향을 확인하세요':angle>40?'오른쪽으로 이어지는 길을 확인하세요':angle< -40?'왼쪽으로 이어지는 길을 확인하세요':'이어지는 보행 구간을 확인하세요',name:s.edge.name||'보행로',caution:s.caution,angle});
 }
 events.push({index:segments.length-1,at:length,ll:segments.at(-1).b,label:'목적지 인근 연결을 확인하세요',name:destination?.name||'목적지',caution:true});
 let rest=null;if(route.restStop){const ll=route.restStop.snap||route.restStop.ll;const closest=segments.map(s=>({...project(ll,s.a,s.b),s})).sort((a,b)=>a.distance-b.distance)[0];rest={...route.restStop,at:closest.s.start+closest.t*closest.s.length}}
 const index={origin:segments[0].a,cells:new Map(),wide:[]};const xy=p=>[(p[1]-index.origin[1])*rad*R*Math.cos(index.origin[0]*rad),(p[0]-index.origin[0])*rad*R];for(const segment of segments){const a=xy(segment.a),b=xy(segment.b),x0=Math.floor(Math.min(a[0],b[0])/60),x1=Math.floor(Math.max(a[0],b[0])/60),y0=Math.floor(Math.min(a[1],b[1])/60),y1=Math.floor(Math.max(a[1],b[1])/60);if((x1-x0+1)*(y1-y0+1)>5000){index.wide.push(segment);continue}for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+':'+y;if(!index.cells.has(key))index.cells.set(key,[]);index.cells.get(key).push(segment)}}
 return {version,graphHash,index,restFulfilled:!!route.restFulfilled,segments,length,events,rest,origin:origin||route.coords[0],destination:destination||{ll:route.coords.at(-1),name:'목적지'},profile:Object.freeze({...profile}),gaps:route.gaps||[0,0],assistancePreview:!!route.assistancePreview,fieldVerified:false,route};
}
function guidance(state,plan){
 const phase=state.phase,hold={idle:['◎','안내 준비'],waiting:['◎','GPS 위치를 찾고 있어요'],paused:['Ⅱ','안내 일시정지'],hidden:['Ⅱ','안내가 멈췄어요'],denied:['◎','위치 권한을 허용해 주세요'],timeout:['◎','GPS 수신 시간 초과'],unavailable:['◎','GPS를 수신하지 못했어요'],unsupported:['◎','GPS를 지원하지 않는 환경이에요'],blocked:['!','이 경로는 재생으로 확인하세요'],unstable:['◎','위치 오차가 커요'],ambiguous:['◎','현재 보행로를 확인해 주세요'],uncertain:['◎','이동 방향을 확인하고 있어요'],'signal-delayed':['◎','GPS 위치 갱신 중'],'signal-lost':['◎','GPS 신호를 기다리고 있어요'],offroute:['↺','경로를 벗어났어요'],'offroute-suspect':['◎','경로 위치를 확인하고 있어요'],rerouting:['↺','경로를 다시 찾고 있어요'],'reroute-failed':['↺','다시 찾기를 눌러 주세요'],ended:['■','안내 종료'],arrived:['✓','도착했어요'],resting:['Ⅱ','쉬는 중'],'rest-near':['☕','휴식 장소가 가까워요'],'arrival-near':['✓','목적지 인근이에요']};
 const remaining=Math.max(0,state.remaining||0),minutes=Math.max(1,Math.ceil(remaining/(plan.profile.speed||65))),meters=n=>n>=1000?(n/1000).toFixed(1)+'km':Math.max(0,Math.round(n/5)*5)+'m';
 if(hold[phase])return {icon:hold[phase][0],instruction:hold[phase][1],road:phase==='rest-near'||phase==='resting'?plan.rest?.name||'휴식 장소':phase==='arrival-near'||phase==='arrived'?plan.destination.name:phase==='offroute'?'현재 위치에서 다시 찾기':state.fix?'GPS 오차 약 '+Math.round(state.fix.accuracy)+'m':'위치 수신 후 안내를 시작해요',distance:'',remaining:meters(remaining),minutes,holding:true};
 const segment=plan.segments[state.match?.index||0],event=state.event||plan.events.at(-1),d=Math.max(0,state.distanceToEvent??event.at-(state.progress||0)),last=event===plan.events.at(-1),upcoming=plan.segments[event.index],approx=upcoming?.edge.approximateConnection;
 let icon='↑',action='직진하세요';if(approx){icon='↕';action='엘리베이터 연결 구간입니다'}else if(!last){if(Math.abs(event.angle)>145){icon='↶';action='방향을 돌리세요'}else if(event.angle>40){icon='↱';action='오른쪽으로 이동하세요'}else if(event.angle< -40){icon='↰';action='왼쪽으로 이동하세요'}else action='이어지는 길로 이동하세요'}
 const close=d<=12,instruction=last?(close?'목적지 앞 도로에 도착합니다':'목적지 방향으로 직진하세요'):approx?action:(close?'곧 ':'')+action;
 return {icon,instruction,road:last?(segment?.edge.name||'보행로')+' → '+plan.destination.name:(event.name||'보행로'),distance:close?'곧':meters(d)+' 앞',remaining:meters(remaining),minutes,holding:false};
}
function nearby(plan,ll,radius){if(!plan.index)return plan.segments;const index=plan.index,x=(ll[1]-index.origin[1])*rad*R*Math.cos(index.origin[0]*rad),y=(ll[0]-index.origin[0])*rad*R,found=new Set(index.wide);for(let a=Math.floor((x-radius)/60);a<=Math.floor((x+radius)/60);a++)for(let b=Math.floor((y-radius)/60);b<=Math.floor((y+radius)/60);b++)for(const segment of index.cells.get(a+':'+b)||[])found.add(segment);return found.size?[...found]:plan.segments}
const api={distance,project,layer,bearing,create,nearby,guidance};if(typeof module!=='undefined')module.exports=api;else root.NavigationPlan=api;
})(typeof globalThis==='undefined'?this:globalThis);
