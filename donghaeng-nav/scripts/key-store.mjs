import {readFile,writeFile,rename,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
export function normalizeKey(input){
let value=String(input??'').normalize('NFKC').replace(/\p{Cf}/gu,'').trim();
if(value.startsWith('{')){try{const object=JSON.parse(value);const found=['GEMINI_API_KEY','GOOGLE_API_KEY','apiKey','api_key','key'].map(k=>object[k]).find(v=>typeof v==='string');if(found!==undefined)value=found}catch{}}
const unwrap=s=>s.trim().replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g,'').trim();
value=unwrap(value).replace(/^(?:export\s+)?(?:GEMINI_API_KEY|GOOGLE_API_KEY|GOOGLE_GENERATIVE_AI_API_KEY|API_KEY|APIKEY|x-goog-api-key)\s*[:=]\s*/i,'').trim();value=unwrap(value.replace(/[;,]\s*$/,''));
if(/^https?:\/\//i.test(value)){try{const url=new URL(value),embedded=url.searchParams.get('key')||url.searchParams.get('api_key')||url.searchParams.get('apiKey');if(!embedded)throw Error('NO_KEY');value=embedded}catch{throw Error('키 대신 웹 주소가 들어왔어요. 발급 화면의 키 복사 버튼으로 키를 복사해 주세요.')}}
value=unwrap(value).replace(/\s+/g,'');if(!value)return '';
if(value.length>4096)throw Error('입력 내용이 너무 길어요. 키 부분만 복사해 주세요.');
if(!/^[\x21-\x7e]+$/.test(value))throw Error('키에 한글·이모지 같은 문자가 섞여 있어요. 발급 화면의 키 복사 버튼을 이용해 주세요.');
return value;
}
export async function saveConfig(key,model,envPath){const value=normalizeKey(key);if(!value)throw Error('키가 비어 있어요. 입력칸에 붙여넣어 주세요.');let current='';try{current=await readFile(envPath,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}for(const [name,v] of [['GEMINI_API_KEY',value],...(model?[['GEMINI_MODEL',model]]:[])]){const re=new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=.*$','gm'),line=name+'='+v;current=re.test(current)?current.replace(re,()=>line):current+(current&&!current.endsWith('\n')?'\n':'')+line+'\n'}const temp=envPath+'.tmp-'+process.pid+'-'+randomBytes(6).toString('hex');await writeFile(temp,current,{mode:0o600,flag:'wx'});await rename(temp,envPath);await chmod(envPath,0o600)}
