import {jsonBody,walkingInput,ServiceError} from './contracts.mjs';
import {loadSnapshot,coverage} from './snapshot.mjs';
import {queryFeatures,queryPlaces} from './features.mjs';
import {createRoutingService} from '../routing/pool.mjs';
import {validateJourney} from '../transit/journey.mjs';
import {createPostgisRepository} from './postgis.mjs';
import {reviewPoints} from './review-points.mjs';
import {expansionPaths} from './routes.mjs';
export {expansionPaths} from './routes.mjs';
export function createExpansionHandler({routing=createRoutingService(),transit=null,databaseUrl='',featureRepository,journeyAdapters={}}={}){
 const repository=featureRepository||(databaseUrl?createPostgisRepository({connectionString:databaseUrl}):null);
 const send=(res,status,value)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))};
 const handler=async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!expansionPaths.includes(url.pathname))return false;
  const controller=new AbortController(),aborted=()=>controller.abort();req.once('aborted',aborted);res.once('close',()=>{if(!res.writableEnded)aborted()});
  try{
   const post=['/api/routes/walk','/api/routes/transit','/api/journeys'].includes(url.pathname);
   if(req.method!==(post?'POST':'GET'))throw new ServiceError(405,'method_not_allowed',post?'POST 요청을 사용해 주세요.':'GET 요청을 사용해 주세요.');
   let result;
   if(url.pathname==='/api/coverage'){result=coverage(await loadSnapshot());result.reviewPoints=await reviewPoints.coverage().catch(()=>({state:'unavailable',records:null,fieldVerified:false,routingEligible:false}));result.featureStorage=repository?'postgis_configured':'memory';if(transit)result.transit=transit.status()}
   else if(url.pathname==='/api/features')result=await queryFeatures(url.searchParams,{repository});
   else if(url.pathname==='/api/places')result=await queryPlaces(url.searchParams);
   else if(url.pathname==='/api/transit/status')result=transit?.status()||{state:'not_configured',reason:'대중교통 제공업체 설정이 필요해요.',fieldVerified:false};
   else {
    const input=walkingInput(await jsonBody(req));
    if(url.pathname==='/api/routes/walk')result=await routing.route(input,{signal:controller.signal});
    else if(!transit)throw new ServiceError(503,'transit_not_configured','대중교통 제공업체 연결이 아직 준비되지 않았어요.');
    else {
     result=await transit.search(input,{signal:controller.signal});
     if(url.pathname==='/api/journeys'){
      const candidates=[];
      for(const candidate of result.candidates.slice(0,5))candidates.push(await validateJourney(candidate,input,{boarding:journeyAdapters.boarding,access:journeyAdapters.access,signal:controller.signal,walk:async request=>{
       const generated=await routing.route(request,{signal:controller.signal}),route=generated.routes[0];
       // The current worker returns technical previews, not verified stop or
       // entrance connections. Adding a timetable must not promote them.
       return {profile:generated.profile,state:'unknown',minutes:route?.selectionMetrics.minutes,route,restWaypointEligible:false};
      }}));
      result={...result,schema:'donghaeng-journeys-v1',candidates,eligibleCandidates:candidates.filter(c=>c.validationState==='satisfied').map(c=>c.id),
       state:candidates.some(c=>c.validationState==='satisfied')?'validated_candidates':'needs_review',scheduleValidationConfigured:typeof journeyAdapters.boarding==='function'};
     }
    }
   }
   send(res,200,result);
  }catch(error){send(res,error.status||503,{error:error.status?error.message:'자료 서비스를 준비하지 못했어요.',code:error.code||'service_unavailable',...(error.providerCode?{providerCode:error.providerCode}:{}),...(error.providerReason?{providerReason:error.providerReason}:{})})}
  finally{req.removeListener('aborted',aborted)}
  return true;
 };
 handler.close=()=>{routing.close();Promise.resolve(repository?.close?.()).catch(()=>{})};return handler;
}
