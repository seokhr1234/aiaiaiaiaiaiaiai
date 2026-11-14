import {walkingInput,point,ServiceError} from '../expansion/contracts.mjs';
import {distance,cityWalk} from '../city-walk/router.mjs';
import {createLocalTimetable} from './timetable.mjs';
const fail=(code,message)=>{throw new ServiceError(503,code,message)};
const id=s=>typeof s==='string'&&s.length>0&&s.length<=100;
// Local, explicit service-date data is optional. No synthetic city network is
// bundled and no web/API fallback is made from this provider.
export function createLocalTransitProvider({pack,walk=(input,options)=>cityWalk.route(input,options),now=()=>Date.now(),budgetMs=12000}={}) {
 if(!pack)return {status:()=>({state:'local_data_missing',scheduleValidation:false,fieldVerified:false}),async search(){fail('local_transit_data_missing','로컬 노선·정류장·시간표 파일이 필요해요. 외부 API는 호출하지 않았어요.')}};
 if(pack.schema!=='donghaeng-transit-pack-v1'||!Array.isArray(pack.stops)||pack.stops.length>20000||!Array.isArray(pack.lines)||pack.lines.length>20000)fail('invalid_local_transit_pack','로컬 교통 자료 형식을 확인해 주세요.');
 const stops=new Map(),lines=new Map();
 for(const s of pack.stops){if(!id(s?.id)||stops.has(s.id)||!point(s.ll)||typeof s.name!=='string'||s.name.length>200)fail('invalid_local_transit_pack','로컬 정류장 자료를 확인해 주세요.');stops.set(s.id,structuredClone(s))}
 for(const l of pack.lines){if(!id(l?.id)||lines.has(l.id)||!['bus','subway'].includes(l.mode)||typeof l.name!=='string'||l.name.length>200)fail('invalid_local_transit_pack','로컬 노선 자료를 확인해 주세요.');lines.set(l.id,{...l})}
 if(!pack.stops.length||!pack.lines.length||!pack.timetable?.trips?.length)return createLocalTransitProvider();
 createLocalTimetable(pack.timetable,{now}); // Shared strict source/date/24+ hour validation.
 const rows=pack.timetable.trips.map(r=>{
  if(!stops.has(r.fromId)||!stops.has(r.toId)||lines.get(r.lineId)?.mode!==r.mode)fail('invalid_local_transit_pack','시간표의 정류장·노선 ID 대응을 확인해 주세요.');
  const ms=text=>{const [h,m,s]=text.split(':').map(Number);return Date.parse(r.serviceDate+'T00:00:00+09:00')+(h*3600+m*60+s)*1000};
  return {...r,dep:ms(r.departs),arr:ms(r.arrives)};
 }).sort((a,b)=>a.dep-b.dep||a.arr-b.arr);
 const byStop=new Map();for(const row of rows){if(!byStop.has(row.fromId))byStop.set(row.fromId,[]);byStop.get(row.fromId).push(row)}
 let active=0;
 const source={version:pack.timetable.version,observedAt:pack.timetable.observedAt,expiresAt:pack.timetable.expiresAt};
 return {status:()=>({state:'local_reference_candidates_only',provider:'local_timetable',datasetVersion:source.version,stops:stops.size,scheduledSegments:rows.length,scheduleValidation:false,fieldVerified:false}),
  async search(value,{signal}={}){
   const input=walkingInput(value);signal?.throwIfAborted();if(active>=1)throw new ServiceError(429,'local_transit_busy','다른 로컬 교통 후보를 계산하고 있어요. 잠시 후 다시 시도해 주세요.');active++;
   try {const start=Date.parse(input.atTime),current=now(),deadline=Date.now()+budgetMs;
   signal?.throwIfAborted();
   if(Date.parse(source.observedAt)>Math.min(start,current)||Date.parse(source.expiresAt)<=Math.max(start,current))fail('local_transit_data_stale','로컬 시간표의 유효기간을 확인해 주세요. 외부 API는 호출하지 않았어요.');
   const near=ll=>[...stops.values()].map(s=>({s,d:distance(ll,s.ll)})).filter(s=>s.d<=800).sort((a,b)=>a.d-b.d).slice(0,3);
   const access=[],egress=new Map();let walkRequests=0;
   const route=async(origin,destination)=>{
    if(Date.now()>=deadline)throw new ServiceError(504,'local_transit_timeout','로컬 교통 계산 시간이 초과됐어요.');
    signal?.throwIfAborted();walkRequests++;
    try{const r=await walk({...input,origin,destination},{signal,timeoutMs:Math.min(3000,deadline-Date.now())});
     signal?.throwIfAborted();if(r?.state!=='reference_route'||!Number.isFinite(r.minutes)||r.minutes<=0||r.minutes>1440||JSON.stringify(r.profile)!==JSON.stringify(input.profile))return null;
     return {minutes:r.minutes,distanceMeters:r.distanceMeters};
    }catch(e){signal?.throwIfAborted();if(Date.now()>=deadline)throw new ServiceError(504,'local_transit_timeout','로컬 교통 계산 시간이 초과됐어요.');return null}
   };
   for(const {s} of near(input.origin)){const r=await route(input.origin,s.ll);if(r)access.push({stop:s,walking:r})}
   for(const {s} of near(input.destination)){const r=await route(s.ll,input.destination);if(r)egress.set(s.id,{stop:s,walking:r})}
   if(!access.length||!egress.size)throw new ServiceError(422,'local_transit_walk_unresolved','같은 이동 조건의 승하차 도보 연결을 계산하지 못했어요. 조건을 완화하거나 가짜 연결을 만들지 않았어요.');
   const queue=access.map(a=>({at:start+a.walking.minutes*60000,stop:a.stop.id,first:a,rides:[],visited:new Set([a.stop.id])})),found=[];let expanded=0;
   for(let q=0;q<queue.length&&expanded<20000;q++){
    if((expanded++&255)===0){signal?.throwIfAborted();if(Date.now()>=deadline)throw new ServiceError(504,'local_transit_timeout','로컬 교통 계산 시간이 초과됐어요.')}
    const state=queue[q],end=egress.get(state.stop);
    if(state.rides.length&&end){found.push({...state,end,arrival:state.at+end.walking.minutes*60000});if(found.length>=30)break}
    if(state.rides.length>=3)continue;
    const choices=new Map();for(const row of byStop.get(state.stop)||[]){
     // The same stop ID does not prove a physical interchange. Such transfers
     // remain review-only and are checked independently by the journey review.
     if(row.dep<state.at||row.arr>=Date.parse(source.expiresAt)||row.arr-start>12*3600000||state.visited.has(row.toId))continue;
     const key=row.lineId+':'+row.toId;if(choices.has(key))continue;choices.set(key,row);
     if(choices.size>=50)break;
    }
    for(const row of choices.values())if(queue.length<20000)queue.push({at:row.arr,stop:row.toId,first:state.first,rides:[...state.rides,row],visited:new Set([...state.visited,row.toId])});
   }
   const seen=new Set(),plans=found.sort((a,b)=>a.arrival-b.arrival).filter(p=>{const k=p.rides.map(r=>r.id).join('|')+'|'+p.first.stop.id+'|'+p.end.stop.id;if(seen.has(k))return false;seen.add(k);return true}).slice(0,5);
   const candidates=plans.map((plan,index)=>{
    const cid='T'+(index+1),legs=[],add=l=>legs.push({id:cid+'-L'+(legs.length+1),idNamespace:pack.timetable.idNamespace??'ODsay',lines:[],fromId:null,toId:null,fromName:null,toName:null,stationCount:null,fieldVerified:false,...l});
    add({mode:'walk',from:input.origin,to:plan.first.stop.ll,providerMinutes:plan.first.walking.minutes});
    for(const row of plan.rides){const a=stops.get(row.fromId),b=stops.get(row.toId),line=lines.get(row.lineId);add({mode:row.mode,from:a.ll,to:b.ll,fromId:a.id,toId:b.id,fromName:a.name,toName:b.name,lines:[{id:line.id,name:line.name}],providerMinutes:(row.arr-row.dep)/60000})}
    add({mode:'walk',from:plan.end.stop.ll,to:input.destination,providerMinutes:plan.end.walking.minutes});
    return {id:cid,provider:'local_timetable',observedAt:source.observedAt,requestedAtTime:input.atTime,profile:{...input.profile},legs,
     providerTotalMinutes:Math.ceil((plan.arrival-start)/60000),walkingMinutes:plan.first.walking.minutes+plan.end.walking.minutes,
     fareWon:null,transferCount:plan.rides.length-1,state:'review_only',timeFeasibility:'unknown',fieldVerified:false,
     reasons:['local_scheduled_snapshot','stop_connections_and_realtime_unverified']};
   });
   return {schema:'donghaeng-transit-v1',provider:'local_timetable',datasetVersion:source.version,state:candidates.length?'review_only':'no_provider_candidate',candidates,rejected:0,
    requestedAtTime:input.atTime,observedAt:source.observedAt,fieldVerified:false,externalApiCalls:0,walkRequests,
    notice:'로컬 시간표의 참고 후보입니다. 실제 운행·휴일 자료의 완전성·출입구·역내 환승·접근성은 별도 확인이 필요합니다.'};
   }finally{active--}
  }};
}
