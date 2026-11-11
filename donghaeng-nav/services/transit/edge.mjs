import {createOdsayProvider} from './odsay.mjs';
import {jsonBody,walkingInput,ServiceError} from '../expansion/contracts.mjs';
// No filesystem/graph dependency: this handler runs directly on Vercel.
export function createTransitEdgeHandler({getConfig=()=>({}),fetchImpl=globalThis.fetch}={}){
 let cached=null,signature='';
 return async(req,res,route)=>{
  const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))};
  try{
   if(!['/api/routes/transit','/api/transit/status'].includes(route))throw new ServiceError(404,'unknown_route','존재하지 않는 API입니다.');
   if(req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))throw new ServiceError(403,'origin_not_allowed','이 서비스 화면에서 다시 시도해 주세요.');
   if(req.method!==(route.endsWith('/status')?'GET':'POST'))throw new ServiceError(405,'method_not_allowed','요청 방식을 확인해 주세요.');
   const config=getConfig(),next=JSON.stringify(config);if(!cached||next!==signature){cached=createOdsayProvider({...config,fetchImpl});signature=next}
   if(route.endsWith('/status'))return send(200,{...cached.status(),budgetScope:'server_instance',notice:'호출 한도는 인스턴스별입니다. 계정 전체 한도는 제공업체 설정도 확인하세요.'});
   const input=walkingInput(await jsonBody(req)),controller=new AbortController(),abort=()=>controller.abort();
   req.once('aborted',abort);res.once('close',()=>{if(!res.writableEnded)abort()});
   try{send(200,await cached.search(input,{signal:controller.signal}))}finally{req.removeListener('aborted',abort)}
  }catch(e){send(e.status||503,{code:e.code||'transit_unavailable',error:e.status?e.message:'대중교통 연결을 완료하지 못했어요.'})}
 };
}
