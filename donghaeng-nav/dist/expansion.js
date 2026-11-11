'use strict';
const $=s=>document.querySelector(s),client=RegionClient.create(),map=L.map('map').setView([37.60192,127.0414554],16);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).on('tileerror',()=>{$('#basemap-status').textContent='배경지도를 읽지 못했어요. 등록 자료와 길 찾기는 별도로 확인할 수 있어요.'}).addTo(map);
const features=L.layerGroup().addTo(map),paths=L.layerGroup().addTo(map),pins={};let origin=null,destination=null,picking=null,featureEpoch=0,routeEpoch=0,searchEpoch=0;
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e};
function clearRoute(){routeEpoch++;client.cancel('route');paths.clearLayers();$('#route-results').replaceChildren();$('#route-status').textContent='';$('#find').disabled=false;$('#cancel').hidden=true}
function setPoint(kind,ll,name){clearRoute();if(kind==='start')origin=ll;else destination=ll;pins[kind]?.remove();pins[kind]=L.marker(ll).addTo(map).bindTooltip(node('span',name|| (kind==='start'?'출발':'도착')));$('#point-status').textContent='출발 '+(origin?origin.map(x=>x.toFixed(5)).join(', '):'미지정')+' / 도착 '+(destination?destination.map(x=>x.toFixed(5)).join(', '):'미지정')}
for(const [id,kind] of [['#pick-start','start'],['#pick-end','end']])$(id).onclick=()=>{picking=picking===kind?null:kind;$('#pick-start').setAttribute('aria-pressed',picking==='start');$('#pick-end').setAttribute('aria-pressed',picking==='end');$('#point-status').textContent=picking?'지도에서 '+(picking==='start'?'출발':'도착')+'할 보행 위치를 눌러 주세요.':'위치 지정을 취소했어요.'};
map.on('click',ev=>{if(!picking)return;setPoint(picking,[ev.latlng.lat,ev.latlng.lng]);picking=null;$('#pick-start').setAttribute('aria-pressed','false');$('#pick-end').setAttribute('aria-pressed','false')});
$('#condition').oninput=clearRoute;$('#mode').onchange=()=>{clearRoute();$('#sharing-note').hidden=$('#mode').value!=='transit'};
async function loadFeatures(){
 const epoch=++featureEpoch;client.cancel('features');features.clearLayers();const bounds=map.getBounds(),bbox=[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()].join(','),layer=$('#layer').value;let offset=0,count=0,version=null;
 $('#feature-status').textContent='현재 화면의 자료를 읽고 있어요.';
 try{do{const query=new URLSearchParams({bbox,layer,limit:'300',offset:String(offset)}),data=await client.request('features','/api/features?'+query);if(epoch!==featureEpoch)return;
   if(version&&version!==data.datasetVersion)throw Error('자료 버전이 바뀌었어요. 지도를 움직여 다시 읽어 주세요.');version=data.datasetVersion;
   L.geoJSON(data,{style:f=>({color:f.properties.kind==='sidewalk'?'#176bd1':'#5b7355',weight:2}),pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:5,color:'#176d52'}),onEachFeature:(f,layer)=>layer.bindPopup(()=>{
    const p=f.properties||{},box=node('section',''),source=data.sourceMetadata||{},facility=data.layer==='facilities'?FacilityMap.meta(f):null;box.append(node('b',p.name||p.kind||'공개 자료'),node('p','현장·보행 연결 미확인'),node('p',p.coordinate_role||'원본 검토 위치'),node('p','출처: '+(facility?.source||source.provider||'원문 참고')),node('p','자료 기준: '+(facility?.time||p['데이터기준일자']||p.as_of||source.as_of||'미확인')),node('p','수집/대조일: '+(p.official_recheck?.retrieved_date||p.retrieved_date||p.fetched_date||'미확인')),node('p','표시: 경위도 GeoJSON / 원본 좌표계: '+(source.source_crs||p.source_crs||'미확인')));if(source.crs_verification?.status==='inferred_and_cross_checked_not_explicit_epsg_in_xml')box.append(node('p','원본 좌표계는 추론·교차 확인 상태입니다.'));if(source.vertical_datum)box.append(node('p','수직 기준: '+source.vertical_datum));
    if(p.official_hours_conflict)box.append(node('p',p.official_hours_conflict_note||'공식 운영 안내 충돌 · 방문 전 확인 필요'));
    if(p.source_url||source.source_url){try{const url=new URL(p.source_url||source.source_url);if(['https:','http:'].includes(url.protocol)){const a=node('a','원본 출처');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';box.append(a)}}catch{}}
    return box;
   })}).addTo(features);count+=data.features.length;$('#feature-status').textContent='현재 영역 '+count.toLocaleString()+' / '+data.total.toLocaleString()+'건 표시 · 현장 미확인';offset=data.nextOffset;
   if(offset!==null&&count>=3000){$('#feature-status').textContent+=' · 일부 표시, 확대해서 확인해 주세요.';break}
  }while(offset!==null&&epoch===featureEpoch);
 }catch(e){if(epoch!==featureEpoch)return;features.clearLayers();$('#feature-status').textContent=e.name==='AbortError'?'자료 요청이 취소됐어요. 지도를 움직여 다시 시도해 주세요.':e.message}
}
let timer;map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(loadFeatures,200)});$('#layer').onchange=loadFeatures;
$('#place-search').onsubmit=async ev=>{ev.preventDefault();const epoch=++searchEpoch;$('#place-results').replaceChildren(node('p','검색 중…'));try{const data=await client.request('places','/api/places?'+new URLSearchParams({q:$('#place-query').value}));if(epoch!==searchEpoch)return;$('#place-results').replaceChildren(node('p',data.notice));for(const p of data.items){const b=node('button',p.name+(p.address?' · '+p.address:''));b.type='button';b.className='place-item';b.onclick=()=>{setPoint('end',p.ll,p.name);map.setView(p.ll,17);$('#place-results').replaceChildren();$('#point-status').textContent+=' · 시설 기준점, 실제 보행 진입 위치를 확인해 주세요.'};$('#place-results').append(b)}if(!data.items.length)$('#place-results').append(node('p','등록 자료에서 찾지 못했어요. 지도에서 위치를 지정해 주세요.'))}catch(e){if(epoch===searchEpoch)$('#place-results').replaceChildren(node('p',e.name==='AbortError'?'검색이 취소됐어요.':e.message))}};
$('#cancel').onclick=()=>{clearRoute();$('#route-status').textContent='경로 계산을 취소했어요.'};
$('#route-form').onsubmit=async ev=>{
 ev.preventDefault();if(!origin||!destination){$('#route-status').textContent='출발·도착 위치를 먼저 지정해 주세요.';return}clearRoute();const epoch=routeEpoch,profile=NavEngine.parseState($('#condition').value),transit=$('#mode').value==='transit';$('#find').disabled=true;$('#cancel').hidden=false;$('#route-status').textContent='입력한 이동 조건으로 경로를 찾고 있어요.';
 try{const result=await client.request('route',transit?'/api/routes/transit':'/api/routes/walk',{method:'POST',body:{origin,destination,profile,atTime:new Date().toISOString()}});if(epoch!==routeEpoch)return;
  $('#route-status').textContent=result.notice;
  if(transit){if(!result.candidates.length)$('#route-results').append(node('p','제공업체에서 참고 후보를 받지 못했어요. 다른 시각·위치를 확인해 주세요.'));for(const candidate of result.candidates){const box=node('article','');box.className='result';box.append(node('b','대중교통 참고 후보 '+candidate.id),node('p',candidate.legs.map(l=>({walk:'도보',bus:'버스',subway:'지하철'})[l.mode]).join(' → ')),node('p','출입구·역내 연결·운행 시각·이동 조건 미검증 · 실제 안내 시작 불가'));$('#route-results').append(box)}}
  else for(const route of result.routes){L.polyline(route.coords,{color:'#176d52',weight:5}).addTo(paths);const box=node('article','');box.className='result';box.append(node('b','보행 경로 '+route.candidateId),node('p',Math.round(route.totalLength)+'m · 약 '+route.selectionMetrics.minutes+'분'),node('p','기록된 조건·건물 겹침 검사 통과 · 보도 실측·현장 통행 미검증'));for(const message of route.messages)box.append(node('p',message));$('#route-results').append(box)}
  if(!transit&&!result.routes.length)$('#route-results').append(node('p','요청 조건과 연결 검사를 만족하는 후보를 찾지 못했어요. 조건을 자동 완화하지 않았습니다.'));
 }catch(e){if(epoch===routeEpoch)$('#route-status').textContent=e.name==='AbortError'?'경로 요청 시간이 초과됐어요. 다시 시도해 주세요.':e.message}
 finally{if(epoch===routeEpoch){$('#find').disabled=false;$('#cancel').hidden=true}}
};
Promise.allSettled([
 client.request('coverage','/api/coverage').then(data=>{$('#coverage-status').textContent='보행 계산: '+(data.walking.serviceAvailable===false?'확장 자료 서버 연결 필요':data.walking.citywide?'자료별 지원 영역 참고':'월곡역 주변 시범 범위')+' / 정밀지도 '+data.precision.sheets+'도엽·'+data.precision.features.toLocaleString()+'도형 / 현장 검증 미완료. '+data.notice}),
 client.request('transit-status','/api/transit/status').then(data=>{$('#transit-status').textContent=data.state==='reference_candidates_only'?'대중교통 참고 검색 설정됨 · 실제 연결은 요청 시 확인 · 접근성/시각 미검증':'대중교통 연결 준비 중 · 보행과 등록 자료는 별도로 확인할 수 있어요.'})
]).then(results=>{if(results[0].status==='rejected')$('#coverage-status').textContent='지원 범위를 불러오지 못했어요. 자료 서비스를 확인해 주세요.';if(results[1].status==='rejected')$('#transit-status').textContent='대중교통 연결 상태를 확인하지 못했어요.'});loadFeatures();window.addEventListener('pagehide',()=>{clearTimeout(timer);client.cancelAll()});
