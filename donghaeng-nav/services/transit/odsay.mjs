import {ServiceError,point} from '../expansion/contracts.mjs';
const error=(status,code,message)=>new ServiceError(status,code,message);
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const position=(x,y)=>{const p=[number(y),number(x)];return point(p)?p:null};
export function normalizeOdsay(data,input,{observedAt=new Date().toISOString()}={}){
 if(data?.error)throw error(502,'transit_provider_error','대중교통 제공업체가 경로를 반환하지 못했어요.');
 const paths=data?.result?.path;if(!Array.isArray(paths)||paths.length>100)throw error(502,'transit_invalid_response','대중교통 응답 형식을 확인하지 못했어요.');
 const candidates=[];let rejected=0;
 for(const [index,path] of paths.entries()){
  const subs=path.subPath;
  if(!Array.isArray(subs)||!subs.length||subs.length>60||subs.some(s=>![1,2,3].includes(s.trafficType)||number(s.sectionTime)===null||number(s.sectionTime)<0||number(s.sectionTime)>1440)){rejected++;continue}
  const legs=subs.map((s,i)=>{
   const mode={1:'subway',2:'bus',3:'walk'}[s.trafficType];
   return {id:'T'+(index+1)+'-L'+(i+1),mode,providerMinutes:number(s.sectionTime),distanceMeters:number(s.distance),
    from:mode==='walk'?null:position(s.startX,s.startY),to:mode==='walk'?null:position(s.endX,s.endY),
    fromId:s.startID==null?null:String(s.startID),toId:s.endID==null?null:String(s.endID),
    fromName:typeof s.startName==='string'?s.startName:null,toName:typeof s.endName==='string'?s.endName:null,
    lines:Array.isArray(s.lane)?s.lane.slice(0,20).map(l=>({id:l.busID==null?null:String(l.busID),name:l.busNo||l.name||null,subwayCode:l.subwayCode??null})):[],
    endpointRole:mode==='walk'?'derived_from_provider_references':'station_or_stop_reference',fieldVerified:false};
  });
  legs.forEach((leg,i)=>{if(leg.mode==='walk'){leg.from=i===0?[...input.origin]:legs[i-1].to;leg.to=i===legs.length-1?[...input.destination]:legs[i+1].from}});
  if(legs.some(l=>!point(l.from)||!point(l.to))||!legs.some(l=>l.mode!=='walk')){rejected++;continue}
  candidates.push({id:'T'+(index+1),provider:'ODsay',observedAt,providerTotalMinutes:number(path.info?.totalTime),legs,
   profile:{...input.profile},requestedAtTime:input.atTime,state:'review_only',timeFeasibility:'unknown',fieldVerified:false,
   reasons:['provider_reference_endpoints','boarding_schedule_unverified','indoor_and_accessibility_unverified']});
 }
 return {schema:'donghaeng-transit-v1',provider:'ODsay',state:candidates.length?'review_only':'no_provider_candidate',candidates,rejected,
  observedAt,requestedAtTime:input.atTime,fieldVerified:false,notice:'대중교통 참고 후보입니다. 출입구·역내 이동·환승 시각·접근성은 확인되지 않았어요.'};
}
export function createOdsayProvider({apiKey='',enabled=false,dailyLimit=20,maxConcurrent=2,timeoutMs=8000,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 let day='',used=0,inflight=0;
 if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>100000)throw Error('invalid transit daily limit');
 const today=()=>new Date(now()+9*3600000).toISOString().slice(0,10);
 const refresh=()=>{const d=today();if(d!==day){day=d;used=0}};
 return {
  status(){refresh();return {state:!apiKey?'not_configured':!enabled?'disabled':'reference_candidates_only',dailyLimit,used,citywide:false,fieldVerified:false,scheduleValidation:false,notice:'일일 한도는 이 서버 프로세스 기준입니다.'}},
  async search(input,{signal}={}){
   if(!apiKey)throw error(503,'transit_not_configured','대중교통 연결이 아직 준비되지 않았어요.');
   if(!enabled)throw error(503,'transit_disabled','대중교통 참고 검색이 아직 활성화되지 않았어요.');
   if(signal?.aborted)throw error(499,'request_aborted','요청을 취소했어요.');
   refresh();if(used>=dailyLimit)throw error(429,'transit_daily_limit','오늘 대중교통 검색 한도에 도달했어요.');
   if(inflight>=maxConcurrent)throw error(429,'transit_busy','대중교통 검색이 많아요. 잠시 후 다시 시도해 주세요.');
   const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(abort,timeoutMs);inflight++;used++;
   try{
    const url=new URL('https://api.odsay.com/v1/api/searchPubTransPathT');
    for(const [key,value] of Object.entries({apiKey,SX:input.origin[1],SY:input.origin[0],EX:input.destination[1],EY:input.destination[0],output:'json',OPT:0}))url.searchParams.set(key,value);
    const response=await fetchImpl(url,{signal:controller.signal,redirect:'error'});
    if(!response.ok)throw error(response.status===429?429:502,'transit_http_error','대중교통 제공업체 연결에 실패했어요.');
    const reader=response.body.getReader(),parts=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw error(502,'transit_response_too_large','대중교통 응답이 너무 커요.')}parts.push(value)}
    let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw error(502,'transit_invalid_response','대중교통 응답을 읽지 못했어요.')}
    return normalizeOdsay(data,input,{observedAt:new Date(now()).toISOString()});
   }catch(e){if(e instanceof ServiceError)throw e;if(signal?.aborted)throw error(499,'request_aborted','요청을 취소했어요.');throw error(controller.signal.aborted?504:502,'transit_unavailable','대중교통 연결을 완료하지 못했어요.')}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);inflight--}
  }
 };
}
