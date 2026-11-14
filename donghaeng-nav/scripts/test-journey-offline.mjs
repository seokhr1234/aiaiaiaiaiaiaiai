import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createLocalTransitProvider} from '../services/transit/local-network.mjs';
import {createTransitProvider} from '../services/transit/provider.mjs';
import {createAccessEvidence,validateRestSchedule} from '../services/transit/evidence.mjs';
import {createJourneyReviewer} from '../services/transit/journey-review.mjs';
import {reviewInput,createWalkReviewService} from '../services/transit/walk-review.mjs';
import {walkingInput} from '../services/expansion/contracts.mjs';
const require=createRequire(import.meta.url),UI=require('../dist/transit-ui.js'),WalkUI=require('../dist/transit-walk-review.js'),JourneyUI=require('../dist/journey-review.js'),checks=[];
const at='2026-11-14T10:00:00+09:00',now=()=>Date.parse(at),points=[[37.56,126.97],[37.565,126.97],[37.58,126.98],[37.60,127],[37.605,127]];
const input=walkingInput({origin:points[0],destination:points[4],atTime:at,profile:{avoidSteps:true}});
export const pack={schema:'donghaeng-transit-pack-v1',stops:[{id:'A',name:'합성 승차',ll:points[1]},{id:'B',name:'합성 환승',ll:points[2]},{id:'C',name:'합성 하차',ll:points[3]}],lines:[{id:'R1',mode:'bus',name:'합성 버스1'},{id:'R2',mode:'subway',name:'합성 지하철2'}],timetable:{schema:'donghaeng-local-timetable-v1',timezone:'Asia/Seoul',version:'synthetic-offline-fixture',source:'Synthetic only; not Seoul service data',observedAt:'2026-11-14T00:00:00+09:00',expiresAt:'2026-11-15T04:00:00+09:00',trips:[
 {id:'missed',mode:'bus',idNamespace:'ODsay',lineId:'R1',fromId:'A',toId:'B',serviceDate:'2026-11-14',departs:'10:05:00',arrives:'10:15:00'},
 {id:'t1',mode:'bus',idNamespace:'ODsay',lineId:'R1',fromId:'A',toId:'B',serviceDate:'2026-11-14',departs:'10:10:00',arrives:'10:20:00'},
 {id:'t2',mode:'subway',idNamespace:'ODsay',lineId:'R2',fromId:'B',toId:'C',serviceDate:'2026-11-14',departs:'10:25:00',arrives:'10:35:00'}]}};
let walkingCalls=0;
export const route=input=>({schema:'donghaeng-city-walk-v1',state:'reference_route',profile:{...input.profile},origin:input.origin,destination:input.destination,
 sourceMetadata:{source_crs:'EPSG:4326'},datasetVersion:'synthetic-graph',minutes:7,distanceMeters:420,coordinates:[input.origin,input.destination],sourceNodeIds:[1,2],sourceSegments:[[1,0]],endpointGaps:[1,2],unknownInclineMeters:420,stepsMeters:0,
 fieldVerified:false,accessibilityVerified:false,endpointConnectionsVerified:false,restVerified:false});
const walk=async input=>{walkingCalls++;return route(input)};
const provider=createLocalTransitProvider({pack,walk,now}),data=await provider.search(input);UI.validate(data,input.profile);
assert.equal(data.provider,'local_timetable');assert.equal(data.externalApiCalls,0);assert.equal(data.candidates.length,1);assert.equal(data.candidates[0].providerTotalMinutes,42);assert.equal(data.candidates[0].transferCount,1);assert.equal(data.candidates[0].timeFeasibility,'unknown');assert.equal(walkingCalls,2);
checks.push('Offline two-service search uses the same-profile endpoint walks, misses the first departure, respects explicit service dates, and returns review-only candidates with zero external calls');
const request=WalkUI.request(data.candidates[0],input.profile,{origin:input.origin,destination:input.destination,atTime:at});
const result=await createWalkReviewService({walk}).review(request);WalkUI.validate(result,request);JourneyUI.validate(result.journeyReview,request);
assert.equal(result.journeyReview.segments.length,5);assert.equal(result.walkingLegs[1].code,'indoor_connection_unresolved');assert.equal(result.journeyReview.summary.arrivalAt,null);assert.equal(result.journeyReview.gpsAllowed,false);assert.equal(result.journeyReview.aiEligible,false);
assert(result.journeyReview.checks.some(c=>c.key==='indoor_connection'&&c.state==='unknown'));
checks.push('Offline candidate connects to the actual walking-review contract and all-leg accessibility/time checks; indoor transfer remains unresolved without a fabricated zero or road shortcut');
for(const modify of [r=>r.gpsAllowed=true,r=>r.aiEligible=true,r=>r.segments[1].mode='walk',r=>r.segments[0].from=[0,0],r=>r.summary.arrivalAt=at,r=>r.profile.speed=120,r=>r.summary.unknown=0]){const bad=structuredClone(result.journeyReview);modify(bad);assert.throws(()=>JourneyUI.validate(bad,request));}
checks.push('Frontend rejects changed journey profile/endpoints/modes, fabricated arrival/summary, and promotion to GPS or AI eligibility');
const record=(state='satisfied',extra={})=>({state,source:'synthetic observation',observedAt:'2026-11-14T09:00:00+09:00',expiresAt:'2026-11-14T11:00:00+09:00',...extra});
const bus={mode:'bus',fromId:'A',toId:'B',lines:[{id:'R1'}]},p={wheelchair:true,avoidSteps:true,maxSlope:5};
const row={...bus,lineId:'R1',checks:Object.fromEntries(['stop_connection','step_free_connection','low_floor_vehicle','wheelchair_space','surface_slope'].map(k=>[k,record('satisfied',['low_floor_vehicle','wheelchair_space'].includes(k)?{tripId:'t1'}:k==='surface_slope'?{maxSlope:3}:{})]))};
const access=createAccessEvidence([row],{now});assert.equal((await access(bus,{profile:p,atTime:at,untilTime:'2026-11-14T10:20:00+09:00',tripId:'t1'})).state,'satisfied');assert.equal((await access(bus,{profile:p,atTime:at,tripId:'other'})).state,'unknown');assert.equal((await access(bus,{profile:p,atTime:at,untilTime:'2026-11-14T11:01:00+09:00',tripId:'t1'})).state,'unknown');
const badRow=structuredClone(row);badRow.checks.low_floor_vehicle=record('violated',{tripId:'t1'});assert.equal((await createAccessEvidence([row,badRow],{now})(bus,{profile:p,atTime:at,tripId:'t1'})).state,'violated');
const namespaced=structuredClone(pack);namespaced.timetable.idNamespace='local:synthetic';namespaced.timetable.trips.forEach(r=>r.idNamespace='local:synthetic');assert.equal((await createLocalTransitProvider({pack:namespaced,walk,now}).search(input)).candidates[0].legs[1].idNamespace,'local:synthetic');
checks.push('Access evidence matches line/stops and the particular vehicle trip, covers the full ride, expires honestly and preserves conflicting negative observations');
const segments=[{id:'W1',minutes:25,timingKnown:true,routeVersion:'route-v1'},{id:'B1',minutes:10,timingKnown:true,routeVersion:'route-v2'}];
const opportunity=(id,offset)=>({id,legId:'W1',offsetMinutes:offset,durationMinutes:5,kind:'bench',eligible:true,connectionVerified:true,routeVersion:'route-v1',...record()});
const rest=validateRestSchedule(segments,[opportunity('rest1',10),opportunity('rest2',20)],{rest:true,restKind:'bench',restMinutes:15},{startTime:at,now:now()});assert.equal(rest.state,'satisfied');assert.equal(rest.breaks.length,2);assert.equal(rest.maxContinuousMinutes,15);
assert.equal(validateRestSchedule(segments,[opportunity('tooLate',20)],{rest:true,restMinutes:15},{startTime:at,now:now()}).state,'violated');
assert.equal(validateRestSchedule([{...segments[0],timingKnown:false}],[],{rest:true},{startTime:at,now:now()}).state,'unknown');
const wrongRoute={...opportunity('wrong',10),routeVersion:'unrelated'};assert.equal(validateRestSchedule(segments,[wrongRoute],{rest:true},{startTime:at,now:now()}).state,'unknown');
const expires={...opportunity('expires',10),expiresAt:'2026-11-14T10:12:00+09:00'};assert.equal(validateRestSchedule(segments,[expires],{rest:true},{startTime:at,now:now()}).state,'unknown');
checks.push('Repeated breaks include waiting/vehicle movement in fatigue intervals, shift following times by dwell, require exact route provenance and opening validity throughout the break, and never treat riding as rest');
let tick,updates=0;const timers={setInterval(f){tick=f;return 1},clearInterval(){tick=null}};const session=JourneyUI.createSession(result.journeyReview.segments,{timers,onUpdate:()=>updates++});assert.equal(session.startGPS(),false);session.play();tick();assert.equal(session.snapshot().index,1);session.pause();assert.equal(tick,null);session.select(3);assert.equal(session.snapshot().phase,'manual');session.stop();assert.equal(session.snapshot().index,0);session.play();const late=tick;session.destroy();late();assert.equal(session.snapshot().phase,'destroyed');assert(updates>3);
checks.push('Manual/replay state machine advances whole steps without interpolating vehicle lines, cleans timers on pause/destroy, discards late ticks and cannot start live GPS');
await assert.rejects(createLocalTransitProvider().search(input),e=>e.code==='local_transit_data_missing');
await assert.rejects(createLocalTransitProvider({pack,walk,now:()=>Date.parse('2027-01-01T00:00:00Z')}).search(input),e=>e.code==='local_transit_data_stale');
await assert.rejects(createLocalTransitProvider({pack,walk:async()=>{throw Error('private')},now}).search(input),e=>e.code==='local_transit_walk_unresolved');
const ac=new AbortController();ac.abort();await assert.rejects(provider.search(input,{signal:ac.signal}),e=>e.name==='AbortError');
const local=await createTransitProvider({mode:'local',pack,walk,now,fetchImpl:()=>{throw Error('network forbidden')}});assert.equal((await local.search(input)).externalApiCalls,0);
checks.push('Missing/stale/unsupported local data and cancellation fail explicitly, with no provider fallback even when a fetch function is supplied');
const report={pass:true,checks,actualProviderCalls:0,actualTimetableData:false,actualAccessEvidence:false,fieldVerified:false};await writeFile(new URL('../docs/journey-offline-core-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
