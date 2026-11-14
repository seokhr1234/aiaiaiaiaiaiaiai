import {createCityWalkHandler} from './services/city-walk/router.mjs';
import {createWalkReviewHandler} from './services/transit/walk-review.mjs';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createConditionHandler,DEFAULT_GEMINI_MODEL} from './scripts/condition-api.mjs';
import {normalizeKey,saveConfig} from './scripts/key-store.mjs';
import {createExpansionHandler,expansionPaths} from './services/expansion/handler.mjs';
import {createOdsayProvider} from './services/transit/odsay.mjs';
import {createTransitProvider} from './services/transit/provider.mjs';
import {createConfiguredWalkReviewHandler} from './services/transit/configured-review.mjs';
export const projectDir=path.dirname(fileURLToPath(import.meta.url));
export async function readConfig(env=process.env){const values={};for(const name of [path.join(projectDir,'../.env'),path.join(projectDir,'.env')]){try{for(const line of (await readFile(name,'utf8')).split(/\r?\n/)){const m=line.match(/^\s*(?:export\s+)?(GEMINI_API_KEY|GEMINI_MODEL|PORT)\s*=\s*(.*?)\s*$/);if(!m)continue;let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);else v=v.replace(/\s+#.*$/,'').trim();values[m[1]]=v}}catch(e){if(e.code!=='ENOENT')throw e}}
const key=env.GEMINI_API_KEY??values.GEMINI_API_KEY??'',model=env.GEMINI_MODEL||values.GEMINI_MODEL||DEFAULT_GEMINI_MODEL,port=Number(env.PORT||values.PORT||4173);return {apiKey:key.trim(),model,port}}
function configured(key){return typeof key==='string'&&Boolean(key.trim())}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
async function body(req){let size=0,parts=[];for await(const chunk of req){size+=chunk.length;if(size>8192)throw Object.assign(Error('입력 내용이 너무 길어요.'),{status:413});parts.push(chunk)}try{return JSON.parse(Buffer.concat(parts).toString('utf8'))}catch{throw Object.assign(Error('JSON 요청이 올바르지 않아요.'),{status:400})}}
export function createApp({apiKey='',model=DEFAULT_GEMINI_MODEL,fetchImpl=globalThis.fetch,timeoutMs=15000,configPath=path.join(projectDir,'.env'),expansionHandler,transitProvider,backendToken='',transitConfig={},databaseUrl=''}={}){const staticGzipCache=new Map();const conditionHandler=createConditionHandler({getConfig:()=>({apiKey,model}),fetchImpl,timeoutMs});
const expansion=expansionHandler||createExpansionHandler({transit:transitProvider||createOdsayProvider(transitConfig),databaseUrl});
const city=createCityWalkHandler();
const walkReview=createConfiguredWalkReviewHandler({getConfig:()=>({localPackFile:process.env.DONGHAENG_TRANSIT_PACK||''})});
const server=createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost'),origin=req.headers.origin;
// Browser requests from unrelated pages cannot spend this local service's key.
if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)return json(res,403,{error:'이 서비스 화면에서 다시 시도해 주세요.'});
if(url.pathname==='/setup'){
if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'GET 요청을 사용해 주세요.'});
const html=await readFile(path.join(projectDir,'api-setup.html'));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});return res.end(req.method==='HEAD'?undefined:html)}
if(url.pathname==='/api/config'){
if(req.method!=='POST')return json(res,405,{error:'POST 요청을 사용해 주세요.'});
if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return json(res,415,{error:'JSON 요청을 사용해 주세요.'});
const input=await body(req);if(!input||Array.isArray(input)||typeof input.apiKey!=='string'||Object.keys(input).some(k=>k!=='apiKey'))return json(res,400,{error:'키 입력 형식을 확인해 주세요.'});
let key;try{key=normalizeKey(input.apiKey);if(!key)throw Error('키가 비어 있어요. 입력칸에 붙여넣어 주세요.')}catch(error){return json(res,400,{error:error.message})}
let check;try{const reply=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(10000)});if(!reply.ok){const message=reply.status===400||reply.status===401?'Google이 키를 거부했어요. Google AI Studio에서 발급한 Gemini 키인지 확인해 주세요.':reply.status===403?'키의 Gemini API 접근 권한·프로젝트 제한을 확인해 주세요.':reply.status===429?'Google 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.':'Google 연결 확인에 실패했어요. 잠시 후 다시 시도해 주세요.';return json(res,400,{error:message})}
const data=await reply.json();const models=(data.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')&&/^models\/gemini-[a-z0-9.-]+$/.test(m.name)&&!/image|tts|audio|native|live|robotics|computer-use/.test(m.name)).map(m=>m.name.replace(/^models\//,''));const next=models.includes(model)?model:models.find(n=>/flash/.test(n)&&!/preview|exp/.test(n))||models.find(n=>/flash/.test(n))||models[0];if(!next)return json(res,400,{error:'이 키로 사용할 수 있는 Gemini 텍스트 모델을 찾지 못했어요.'});check={verified:true,model:next}}catch{check={verified:false,model,error:'키는 저장했지만 Google 연결을 확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'}}
try{await saveConfig(key,check.model,configPath)}catch{return json(res,500,{error:'키를 파일에 저장하지 못했어요. 폴더의 쓰기 권한을 확인해 주세요.'})}
apiKey=key;model=check.model;return json(res,200,{saved:true,...check})}

if(['/api/status','/api/analyze-condition','/api/select-route'].includes(url.pathname))return conditionHandler(req,res);
if(['/api/routes/city-walk','/api/city/coverage'].includes(url.pathname))return city(req,res);
if(url.pathname==='/api/transit/walk-review')return walkReview(req,res);
if(expansionPaths.includes(url.pathname)){
if(backendToken&&req.headers.authorization!=='Bearer '+backendToken)return json(res,401,{error:'자료 서비스 인증을 확인해 주세요.',code:'backend_auth_required'});
return expansion(req,res)}
if(url.pathname.startsWith('/api/'))return json(res,404,{error:'존재하지 않는 API입니다.'});
if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'GET 요청을 사용해 주세요.'});
let target;if(['/동행길-최종.html','/동행길-시연.html','/동행길-전달용.html'].includes(decodeURIComponent(url.pathname)))target=path.join(projectDir,'../동행길-최종.html');
else{let relative=decodeURIComponent(url.pathname).replace(/^\/app(?:\/|$)/,'/').replace(/^\//,'');if(relative===''||relative==='index.html')relative='index.html';const packed=relative.endsWith('.gz');if(packed)relative=relative.slice(0,-3);if(packed&&!/\.(?:json|geojson)$/.test(relative))return json(res,404,{error:'파일을 찾을 수 없어요.'});if(!/^(?:(?:index|expansion)\.html|(?:app|expansion|city-map|transit-ui|transit-walk-review|journey-review|trip-questions|map-layers|region-client|saved-data|engine|condition-ai|condition-request|route-choice|route-candidates|portable-ai|final-model|facilities|seoul-base|leaflet|endpoint-routing|access-review|precision-connections|precision-map|terrain-evidence|gps-quality|gps-tracker|data-loader|navigation-(?:policy|plan|core|session|routing|ui))\.js|(?:style|leaflet|expansion|transit)\.css|(?:map-(?:data|context)|terrain-data)\.json|data\/accessibility\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:json|geojson)|data\/terrain\/evidence\.json|data\/precision\/(?:access-reports\.json|(?:precision-map|crossings-review)\.geojson)|images\/[a-z0-9_.-]+\.png)$/.test(relative))return json(res,404,{error:'파일을 찾을 수 없어요.'});target=path.join(projectDir,'dist',relative+(packed?'.gz':''))}
try{const info=await stat(target);if(!info.isFile())return json(res,404,{error:'파일을 찾을 수 없어요.'});const ext=path.extname(target),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.png':'image/png'}[ext]||'application/octet-stream';const encoded=!['.png','.gz'].includes(ext)&&(req.headers['accept-encoding']||'').split(',').some(v=>{const [name,...params]=v.trim().split(';');const q=params.find(p=>p.trim().startsWith('q='));return name==='gzip'&&(!q||Number(q.trim().slice(2))>0)});
const etag='"'+info.size.toString(16)+'-'+info.mtimeMs.toString(16)+(encoded?'-gzip':'')+'"';const headers={'ETag':etag,'Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'};
if((req.headers['if-none-match']||'').split(',').some(t=>t.trim().replace(/^W\//,'')===etag||t.trim()==='*')){res.writeHead(304,headers);return res.end()}
let content;if(encoded){const cacheKey=target+etag;content=staticGzipCache.get(cacheKey);if(!content){content=gzipSync(await readFile(target));if(content.length<8*1024*1024){if(staticGzipCache.size>=32)staticGzipCache.delete(staticGzipCache.keys().next().value);staticGzipCache.set(cacheKey,content)}}headers['Content-Encoding']='gzip'}else content=req.method==='HEAD'?null:await readFile(target);
headers['Content-Type']=ext==='.gz'?'application/gzip':mime+(ext==='.png'?'':'; charset=utf-8');headers['Content-Length']=content?content.length:info.size;
res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:content)}catch{return json(res,404,{error:'파일을 찾을 수 없어요.'})}
}catch(error){if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'요청 처리에 실패했어요.'});else res.end()}});server.on('close',()=>expansion.close?.());return server}
export async function start(){const config=await readConfig();const localMode=process.env.DONGHAENG_TRANSIT_MODE==='local'||!!process.env.DONGHAENG_TRANSIT_PACK;const transitProvider=localMode?await createTransitProvider({mode:'local',localPackFile:process.env.DONGHAENG_TRANSIT_PACK||''}):undefined;const app=createApp({...config,transitProvider,backendToken:process.env.DONGHAENG_BACKEND_TOKEN||'',databaseUrl:process.env.DONGHAENG_DATABASE_URL||'',transitConfig:{apiKey:process.env.ODSAY_API_KEY||'',enabled:process.env.DONGHAENG_TRANSIT_ENABLED!=='false',dailyLimit:Number(process.env.ODSAY_DAILY_LIMIT||20)}});app.listen(config.port,process.env.BIND_HOST||'127.0.0.1',()=>{console.log(`동행길: http://127.0.0.1:${app.address().port}`);console.log(configured(config.apiKey)?'Gemini 조건 해석 사용 가능 (실제 연결은 요청 시 확인)':'Gemini 키 미설정 · 기기 내 해석으로 실행합니다.')});app.on('error',e=>{console.error(e.code==='EADDRINUSE'?'같은 포트가 사용 중입니다. PORT 설정을 바꿔 주세요.':'서버를 시작하지 못했어요.');process.exitCode=1});return app}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await start();
