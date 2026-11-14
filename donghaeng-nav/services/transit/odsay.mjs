import {ServiceError,point} from '../expansion/contracts.mjs';
const error=(status,code,message)=>new ServiceError(status,code,message);
const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
const nonnegative=v=>{const n=number(v);return n!==null&&n>=0?n:null};
const position=(x,y)=>{const p=[number(y),number(x)];return point(p)?p:null};
// ODsay documents -98 for origin/destination within 700m. This is a
// provider search limit, not evidence that walking is feasible or accessible.
export function transitDistance(a,b){const r=Math.PI/180,x=a[0]*r,y=b[0]*r;return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin((y-x)/2)**2+Math.cos(x)*Math.cos(y)*Math.sin((b[1]-a[1])*r/2)**2)))}
export function shortTransitError(){const e=error(422,'transit_distance_too_short','출발지와 도착지가 700m 이내라 ODsay 대중교통 검색을 지원하지 않아요. 같은 조건으로 도보를 찾거나 위치를 수정해 주세요.');e.providerCode='-98';e.providerReason='distance';return e}

export function normalizeOdsay(data,input,{observedAt=new Date().toISOString()}={}){
 if(data?.error){
  // Never forward provider messages: some services echo request URLs/API keys.
  const detail=Array.isArray(data.error)?data.error[0]:data.error,raw=detail?.code;
  const code=(typeof raw==='string'||typeof raw==='number')&&/^-?\d{1,4}$/.test(String(raw))?String(raw):null;
  if(code==='-98')throw shortTransitError();
  const message=typeof detail?.message==='string'?detail.message:typeof detail?.msg==='string'?detail.msg:'';
  const reason=['-8','-9'].includes(code)?'request':/\bauth(?:entication|orization)?\b|api\s*key|인증|refer+er|referrer|client[_ ]?ip/i.test(message)?'authorization':/quota|limit|한도|호출\s*횟수/i.test(message)?'quota':'unknown';
  const help=reason==='authorization'?' ODsay 키의 인증·플랫폼·허용 서버 설정을 확인해 주세요.':reason==='request'?' 요청 좌표와 필수 입력값 형식·범위를 확인해 주세요.':reason==='quota'?' ODsay 계정의 호출 한도를 확인해 주세요.':'';
  const e=error(502,'transit_provider_error','대중교통 제공업체가 경로를 반환하지 못했어요.'+(code?' (업체 오류 코드 '+code+')':'')+help);
  if(code)e.providerCode=code;e.providerReason=reason;throw e;
 }
 const paths=data?.result?.path;if(!Array.isArray(paths)||paths.length>100)throw error(502,'transit_invalid_response','대중교통 응답 형식을 확인하지 못했어요.');
 const candidates=[];let rejected=0;
 for(const [index,path] of paths.entries()){
  const subs=path.subPath;
  if(!Array.isArray(subs)||!subs.length||subs.length>60||subs.some(s=>![1,2,3].includes(s.trafficType)||number(s.sectionTime)===null||number(s.sectionTime)<0||number(s.sectionTime)>1440)){rejected++;continue}
  const legs=subs.map((s,i)=>{
   const mode={1:'subway',2:'bus',3:'walk'}[s.trafficType];
   return {id:'T'+(index+1)+'-L'+(i+1),mode,providerMinutes:number(s.sectionTime),distanceMeters:nonnegative(s.distance),
    from:mode==='walk'?null:position(s.startX,s.startY),to:mode==='walk'?null:position(s.endX,s.endY),
    fromId:s.startID==null?null:String(s.startID),toId:s.endID==null?null:String(s.endID),
    fromName:typeof s.startName==='string'?s.startName:null,toName:typeof s.endName==='string'?s.endName:null,
    lines:Array.isArray(s.lane)?s.lane.slice(0,20).map(l=>({id:l.busID==null?null:String(l.busID),name:typeof l.busNo==='string'?l.busNo:typeof l.name==='string'?l.name:null,subwayCode:l.subwayCode??null})):[],
    stationCount:nonnegative(s.stationCount),
    endpointRole:mode==='walk'?'derived_from_provider_references':'station_or_stop_reference',fieldVerified:false};
  });
  legs.forEach((leg,i)=>{if(leg.mode==='walk'){leg.from=i===0?[...input.origin]:legs[i-1].to;leg.to=i===legs.length-1?[...input.destination]:legs[i+1].from}});
  if(legs.some(l=>!point(l.from)||!point(l.to))||!legs.some(l=>l.mode!=='walk')){rejected++;continue}
  candidates.push({id:'T'+(index+1),provider:'ODsay',observedAt,providerTotalMinutes:nonnegative(path.info?.totalTime)>0?nonnegative(path.info.totalTime):null,
   fareWon:nonnegative(path.info?.payment),fareRole:'provider_reference_not_final_charge',
   walkingMinutes:legs.filter(l=>l.mode==='walk').reduce((n,l)=>n+l.providerMinutes,0),
   transferCount:Math.max(0,legs.filter(l=>l.mode!=='walk').length-1),legs,
   profile:{...input.profile},requestedAtTime:input.atTime,state:'review_only',timeFeasibility:'unknown',fieldVerified:false,
   reasons:['provider_reference_endpoints','boarding_schedule_unverified','indoor_and_accessibility_unverified']});
 }
 if(paths.length&&!candidates.length)throw error(502,'transit_unusable_response','대중교통 응답의 위치·구간 정보를 확인하지 못했어요. 경로가 없다는 뜻은 아닙니다.');
 return {schema:'donghaeng-transit-v1',provider:'ODsay',state:candidates.length?'review_only':'no_provider_candidate',candidates,rejected,
  observedAt,requestedAtTime:input.atTime,fieldVerified:false,notice:'대중교통 참고 후보입니다. 출입구·역내 이동·환승 시각·접근성은 확인되지 않았어요.'};
}
export function createOdsayProvider({apiKey='',enabled=false,dailyLimit=20,maxConcurrent=2,timeoutMs=8000,fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
 apiKey=typeof apiKey==='string'?apiKey.trim():'';
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
   if(!point(input?.origin)||!point(input?.destination))throw error(400,'invalid_route','출발·목적지 좌표를 확인해 주세요.');
   if(transitDistance(input.origin,input.destination)<=700)throw shortTransitError();
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
