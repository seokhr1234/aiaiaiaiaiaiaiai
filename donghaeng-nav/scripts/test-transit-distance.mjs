import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createOdsayProvider,normalizeOdsay,transitDistance} from '../services/transit/odsay.mjs';
const input={origin:[37.56,126.97],destination:[37.58,126.98],profile:{avoidSteps:true},atTime:'2026-11-14T12:00:00+09:00'},checks=[];
const atMeters=n=>[input.origin[0]+n/6371000*180/Math.PI,input.origin[1]];
let calls=0;const provider=createOdsayProvider({apiKey:'synthetic-only',enabled:true,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({result:{path:[]}}))}});
for(const meters of [0,200,699]){const request={...input,destination:atMeters(meters)};assert(Math.abs(transitDistance(request.origin,request.destination)-meters)<.01);await assert.rejects(provider.search(request),e=>e.status===422&&e.code==='transit_distance_too_short'&&e.providerCode==='-98'&&e.providerReason==='distance');}
assert.equal(calls,0);assert.equal(provider.status().used,0);await provider.search({...input,destination:atMeters(701)});assert.equal(calls,1);assert.equal(provider.status().used,1);
checks.push('0/200/699m requests fail before provider calls or budget consumption, while 701m retains the normal search path');
for(const error of [{code:-98,message:'apiKey=DO-NOT-LEAK'},[{code:'-98',message:'authentication SECRET'}]])assert.throws(()=>normalizeOdsay({error},input),e=>e.status===422&&e.code==='transit_distance_too_short'&&e.providerReason==='distance'&&!e.message.includes('SECRET')&&!e.message.includes('DO-NOT-LEAK'));
const upstream=createOdsayProvider({apiKey:'synthetic-only',enabled:true,fetchImpl:async()=>new Response(JSON.stringify({error:{code:'-98',message:'DO-NOT-LEAK'}}))});await assert.rejects(upstream.search(input),e=>e.code==='transit_distance_too_short');assert.equal(upstream.status().used,1);
checks.push('Provider -98, including unexpected distant-coordinate replies, is a typed distance limit rather than authentication/server failure; raw messages stay private');
const result={pass:true,checks,actualProviderCalls:0,reference:'https://lab.odsay.com/guide/releaseReference',walkingFeasibilityImplied:false};await writeFile(new URL('../docs/transit-distance-core-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
