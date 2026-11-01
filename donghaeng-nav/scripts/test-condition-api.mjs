import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url),AI=require('../dist/condition-ai.js');
const profile={wheelchair:true,avoidSteps:false,avoidSlope:true,rest:true,short:false,recognized:true,restMinutes:5};
const response=()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(profile)}]}}]}),{status:200});
async function serve(options){const app=createApp(options);await new Promise(r=>app.listen(0,'127.0.0.1',r));return {app,url:`http://127.0.0.1:${app.address().port}`}}
async function close(app){await new Promise(r=>app.close(r))}
let calls=[];const configured=await serve({apiKey:'test-only-credential-never-real',fetchImpl:async(url,options)=>{calls.push({url,options});return response()}});
const post=(url,value,headers={})=>fetch(url+'/api/analyze-condition',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(value)});
try{let r=await post(configured.url,{condition:'휠체어로 가고 5분마다 쉬고 싶어요'}),data=await r.json();assert.equal(r.status,200);assert(data.profile.avoidSteps);assert.equal(data.profile.restMinutes,5);assert.equal(calls.length,1);const sent=JSON.parse(calls[0].options.body);assert.equal(sent.contents[0].parts[0].text,'휠체어로 가고 5분마다 쉬고 싶어요');assert.deepEqual(Object.keys(sent).sort(),['contents','generationConfig','systemInstruction']);assert(!JSON.stringify(sent).includes('127.041'));assert(!JSON.stringify(data).includes('credential'));assert.equal((await post(configured.url,{condition:'짧은 길',latitude:37})).status,400);assert.equal((await post(configured.url,{condition:'a'.repeat(501)})).status,400);assert.equal((await post(configured.url,{condition:'짧은 길'},{Origin:'https://unrelated.example'})).status,403);assert.equal((await fetch(configured.url+'/.env')).status,404);assert.equal((await fetch(configured.url+'/data/../../server.mjs')).status,404);assert.equal((await fetch(configured.url+'/api/status')).status,200);assert.equal(calls.length,1);assert.throws(()=>AI.validate({...profile,rest:'false'}));assert.throws(()=>AI.validate({...profile,restMinutes:0}));}finally{await close(configured.app)}
for(const [name,options,status] of [['missing',{apiKey:'',fetchImpl:()=>{throw Error('must not be called')}},503],['rate-limit',{apiKey:'test-only-credential-never-real',fetchImpl:async()=>new Response('{}',{status:429})},429],['invalid-response',{apiKey:'test-only-credential-never-real',fetchImpl:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"wheelchair":"true"}'}]}}]}))},502],['timeout',{apiKey:'test-only-credential-never-real',fetchImpl:async()=>{throw Error('timeout with a secret message')}},502]]){const s=await serve(options);try{const r=await post(s.url,{condition:'짧은 길'});assert.equal(r.status,status,name);assert(!JSON.stringify(await r.json()).includes('secret message'))}finally{await close(s.app)}}
const temporary=await mkdtemp(path.join(tmpdir(),'donghaeng-key-config-test-')),configPath=path.join(temporary,'.env');
const setup=await serve({apiKey:'',configPath,fetchImpl:async(url)=>url.includes('pageSize=1000')?new Response(JSON.stringify({models:[{name:'models/gemini-test-model',supportedGenerationMethods:['generateContent']}]})):response()});
try{
 assert.equal((await (await fetch(setup.url+'/api/status')).json()).configured,false);
 const saved=await fetch(setup.url+'/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:'test-only-credential-never-real'})});assert.equal(saved.status,200);assert((await saved.json()).saved);
 assert.equal((await (await fetch(setup.url+'/api/status')).json()).configured,true);
 assert.equal((await post(setup.url,{condition:'휠체어로 이동해요'})).status,200);
 assert((await readFile(configPath,'utf8')).includes('GEMINI_MODEL=gemini-test-model'));
}finally{await close(setup.app);await unlink(configPath).catch(error=>{if(error.code!=='ENOENT')throw error});await rmdir(temporary)}
console.log('PASS: Gemini request contract, strict validation, wheelchair protection, no coordinates/keys in response, missing key, timeout, rate limit, malformed response, local origin and private-file protection, local key setup updates the shared handler. No real provider calls.');
