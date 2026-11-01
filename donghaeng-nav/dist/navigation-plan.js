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
function nearby(plan,ll,radius){if(!plan.index)return plan.segments;const index=plan.index,x=(ll[1]-index.origin[1])*rad*R*Math.cos(index.origin[0]*rad),y=(ll[0]-index.origin[0])*rad*R,found=new Set(index.wide);for(let a=Math.floor((x-radius)/60);a<=Math.floor((x+radius)/60);a++)for(let b=Math.floor((y-radius)/60);b<=Math.floor((y+radius)/60);b++)for(const segment of index.cells.get(a+':'+b)||[])found.add(segment);return found.size?[...found]:plan.segments}
const api={distance,project,layer,bearing,create,nearby};if(typeof module!=='undefined')module.exports=api;else root.NavigationPlan=api;
})(typeof globalThis==='undefined'?this:globalThis);
