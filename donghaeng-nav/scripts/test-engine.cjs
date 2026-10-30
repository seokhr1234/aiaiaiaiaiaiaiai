const assert=require('node:assert/strict'),E=require('../dist/engine.js'),data=require('../dist/map-data.json');
const g=E.createGraph(data),start=[37.5960634,127.0384638],end=g.places.find(x=>x.name==='종월2교').ll;
const knee=E.parseState('무릎이 아파서 계단과 오르막을 피하고 싶어요.');assert(knee.avoidSteps&&knee.avoidSlope);
const wheel=E.parseState('휠체어로 이동해요');assert(wheel.wheelchair&&wheel.avoidSteps);
const noRest=E.parseState('휴식은 필요 없어요. 가장 짧은 길로 가고 싶어요.');assert(!noRest.rest&&noRest.short);
const direct=E.route(g,start,end,E.parseState('가장 짧은 거리로 가고 싶어요'));
const rest=E.route(g,start,end,E.parseState('중간에 벤치에서 쉬고 싶어요'));
assert(rest.restStop,'real OSM bench should be found');assert.notDeepEqual(direct.ids,rest.ids);assert(rest.length>direct.length);assert(rest.coords.some(p=>E.distance(p,rest.restStop.snap)<1));assert(rest.restStop.gap<=35);
for(const p of [knee,wheel]){const r=E.route(g,start,end,p);assert(r.edges.every(e=>!e.steps));assert(r.unknown>0);assert(r.messages.some(x=>x.includes('미확인')))}
assert.throws(()=>E.route(g,[37.5,127],end,wheel),/너무 멀/);
const isolated=E.createGraph({elements:[{type:'node',id:1,lat:37,lon:127},{type:'node',id:2,lat:37.001,lon:127},{type:'node',id:3,lat:37.002,lon:127},{type:'way',id:10,nodes:[1,2],tags:{highway:'steps'}},{type:'way',id:11,nodes:[2,3],tags:{highway:'footway'}}]});assert.equal(E.shortest(isolated,1,3,wheel),null);assert(E.shortest(isolated,1,3,{short:true}));
console.log('PASS: state interpretation, negation, real graph routing, wheelchair exclusion, bench waypoint, changed geometry, coverage failure.');console.log(JSON.stringify({nodes:g.nodes.size,shortestMeters:Math.round(direct.length),benchMeters:Math.round(rest.length),bench:rest.restStop.ll}));
