import {expansionPaths} from './routes.mjs';
import {jsonBody,walkingInput} from './contracts.mjs';
export function createExpansionProxy({getConfig=()=>({}),fetchImpl=globalThis.fetch,timeoutMs=15000}={}){
 return async(req,res,route)=>{
  const send=(status,data)=>{res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.statusCode=status;res.end(JSON.stringify(data))};
  try{
   if(!expansionPaths.includes(route))return send(404,{code:'unknown_route',error:'존재하지 않는 API입니다.'});
   if(req.headers.origin&&!['http://'+req.headers.host,'https://'+req.headers.host].includes(req.headers.origin))return send(403,{code:'origin_not_allowed',error:'이 서비스 화면에서 다시 시도해 주세요.'});
   const post=['/api/routes/walk','/api/routes/transit','/api/journeys'].includes(route);
   if(req.method!==(post?'POST':'GET'))return send(405,{code:'method_not_allowed',error:'요청 방식을 확인해 주세요.'});
   const config=getConfig();
   if(!config.baseUrl)return send(503,{code:'backend_not_configured',error:'확장 자료 서비스가 아직 연결되지 않았어요.'});
   const base=new URL(config.baseUrl);if(!['https:','http:'].includes(base.protocol)||base.username||base.password||base.search||base.hash)throw Error('invalid backend');
   const source=new URL(req.url,'http://localhost'),url=new URL(route,base);url.search=source.search;url.searchParams.delete('route');
   const controller=new AbortController(),abort=()=>controller.abort();const timer=setTimeout(abort,timeoutMs);
   req.once('aborted',abort);res.once('close',()=>{if(!res.writableEnded)abort()});
   try{
    const headers={};if(post)headers['Content-Type']='application/json';if(config.token)headers.Authorization='Bearer '+config.token;
    const body=post?JSON.stringify(walkingInput(await jsonBody(req))):undefined;
    const response=await fetchImpl(url,{method:req.method,headers,body,signal:controller.signal,redirect:'error'});
    const data=await response.json();send(response.status,data);
   }finally{clearTimeout(timer);req.removeListener('aborted',abort)}
  }catch(e){send(e.status||503,{code:e.code||'backend_unavailable',error:e.status?e.message:'확장 자료 서비스에 연결하지 못했어요.'})}
 };
}
