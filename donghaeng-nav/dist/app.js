'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],E=NavEngine,F=DonghaengFinal;
if(/^https?:$/.test(location.protocol))$('#expansion-link').hidden=false;
const storageIssues={};const read=k=>{try{const value=SavedData.decode(k,localStorage.getItem(k));storageIssues[k]=value.invalid;return value.items}catch{storageIssues[k]=0;return []}},write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{toast('브라우저 저장 공간에 접근할 수 없어요.');return false}};
let graph,map,precisionController,origin=null,originName='출발 위치를 선택해 주세요',destination=null,profile,analyzed='',routes=[],selected=0,watchId=null,currentStep=-1,detailGroups=[],toastTimer,pickMode=null,gpsMarker,accuracyCircle;
let accessReports=[];
let journeyStages=[],activeStage=0,facilityController,facilityFeatures=[],localDestinations=[],cityDestinations=[],cityRoute=null,cityRequest=null,travelMode='walk',transitRequest=null,transitStatusRequest=null,transitResult=null,transitView=null;
const stageMarkers=L.layerGroup(),stageFocus=L.layerGroup();
const pins={},routeLayer=L.layerGroup(),snapLayer=L.layerGroup();
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4000)}
function textEl(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e}
function icon(type,text){return L.divIcon({className:'map-pin '+type,html:`<span>${text}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}
function placePin(type,ll,title){if(pins[type])pins[type].remove();pins[type]=L.marker(ll,{icon:icon(type,type==='origin'?'출':'도'),draggable:true,autoPan:true,title}).addTo(map).bindTooltip(title,{direction:'top'});pins[type].on('dragend',()=>{const p=pins[type].getLatLng(),ll=[p.lat,p.lng];if(type==='origin')setOrigin(ll,'지도에서 지정한 출발지');else setDestination({ll,name:'지도에서 지정한 목적지'},{pan:false})})}
function invalidate(message='조건이 바뀌었어요. 길 찾기를 눌러 다시 계산해 주세요.'){if(transitRequest){transitRequest.abort();transitRequest=null;$('#find-route').disabled=!graph;$('#transit-cancel').hidden=true;$('#search').removeAttribute('aria-busy');searchLabel()}if(transitResult){transitResult=null;transitView?.clear();$('#routes').replaceChildren(textEl('p',message,'empty-note'))}if(cityRequest){cityRequest.abort();cityRequest=null;$('#find-route').disabled=!graph;$('#search').removeAttribute('aria-busy');searchLabel()}if(cityRoute){cityRoute=null;routeLayer.clearLayers();snapLayer.clearLayers();$('#routes').replaceChildren(textEl('p',message,'empty-note'))}clearRouteSelection();$('#mobile-route-action').replaceChildren();if(routes.length){routes=[];routeLayer.clearLayers();snapLayer.clearLayers();$('#routes').replaceChildren(textEl('p',message,'empty-note'));$('#result-title').textContent='다시 길 찾기'}clearOrder();if(isMobileUI()&&mobileMode!=='input')setMobileMode('input');$('#route-callout').hidden=true;$('#plan-reason').hidden=true;$('#route-evidence').hidden=true;$('#route-evidence').open=false;stopTracking(false)}
function setOrigin(ll,name){origin=ll;originName=name;$('#origin-name').textContent=name;placePin('origin',ll,name);invalidate();$('#location-status').textContent='실제 보행로에 출발 핀을 맞춰 주세요.'}
let destinationEntryReview=false,destinationPreviewAllowed=false,entryReference=null;
function checkDestinationEntry(place){destinationEntryReview=false;destinationPreviewAllowed=false;const box=$('#destination-connection');box.hidden=true;if(travelMode==='transit'||!place||!F.inCoverage(place.ll)||!graph||!precisionController?.getData?.())return;
 try{const arrival=EndpointRouting.arrivalNear(graph,place.ll);destinationEntryReview=precisionController.assessConnection(arrival.ll,place.ll).status==='building_overlap'}catch{destinationEntryReview=true}
 box.hidden=!destinationEntryReview;if(destinationEntryReview)$('#destination-status').textContent='시설 기준점 · 진입 위치 확인 필요';
}
$('#verify-destination').onclick=()=>chooseOnMap('destination');
$('#preview-destination').onclick=()=>{destinationPreviewAllowed=true;pickMode=null;entryReference=null;$('#map-instruction').hidden=true;$('#search').requestSubmit()};
function setDestination(place,{pan=true}={}){destination=place;$('#destination-query').value=place.name;$('#destination-status').textContent=place.arrivalNotice?'도착점: 건물 앞 도로':'목적지 선택됨';$('#destination-status').dataset.selected='true';$('#places').replaceChildren();placePin('destination',place.ll,place.name);checkDestinationEntry(place);invalidate();if(pan){if(isMobileUI())frameVisibleLocation(place.ll,map.getZoom());else map.panTo(place.ll)}}
let analysisRequest=null,analysisVersion=0,autoAnalyzedText='';
function searchLabel(label='내 상태에 맞는 길 찾기'){$('#find-route').replaceChildren(document.createTextNode(label+' '),textEl('span','→'))}
function cancelAnalysis(){clearRouteSelection();analysisVersion++;if(analysisRequest){analysisRequest.abort();analysisRequest=null}searchLabel();$('#search').removeAttribute('aria-busy');if(graph)$('#find-route').disabled=false}
function conditionChanged(){cancelAnalysis();autoAnalyzedText='';profile=null;analyzed='';invalidate();$('#parser-note').textContent=travelMode==='transit'?'길 찾기를 누르면 이동 상태를 읽어요. 대중교통 후보의 조건 충족은 아직 미확인입니다.':'길 찾기를 누르면 AI가 문장을 해석해 이동 조건을 자동으로 반영해요.';$('#search-status').textContent='상태를 바꿨어요. 길 찾기를 눌러 주세요.'}
function setCondition(text){$('#condition').value=text;conditionChanged()}
function applyProfile(next,source){profile=E.wheelchairProfile({...next,avoidSteps:next.avoidSteps||next.wheelchair,avoidSlope:next.avoidSlope||next.wheelchair});analyzed=$('#condition').value;$('#parser-note').textContent=source+' · '+(travelMode==='transit'?'입력한 이동 조건을 읽었어요. 대중교통 후보의 조건 충족은 아직 미확인입니다.':profile.recognized?'이동 조건을 경로에 반영했어요.':'추가 이동 제약을 찾지 못해 기본 보행 경로를 추천해요. 상태를 구체적으로 적으면 다시 반영해요.')+(profile.restMinutes?` · ${profile.restMinutes}분 휴식 간격 요청`:'');return profile}
async function analyzeWithGemini(){const raw=$('#condition').value;if(!raw.trim()){toast('먼저 현재 상태를 적어 주세요.');return false}cancelAnalysis();invalidate();if(PortableAI.isFile()&&!PortableAI.hasKey()){applyProfile(E.parseState(raw),'AI 키 미입력 · 기기 내 해석');return true}const version=analysisVersion,controller=new AbortController();analysisRequest=controller;$('#find-route').disabled=true;$('#search').setAttribute('aria-busy','true');searchLabel('AI가 상태를 해석하고 있어요…');$('#parser-note').textContent='입력한 상태 문장으로 이동 조건을 확인하고 있어요.';const deadline=setTimeout(()=>controller.abort(),18000);try{let data;if(PortableAI.isFile()){data={profile:await PortableAI.analyze(raw,{signal:controller.signal})}}else{const response=await fetch('/api/analyze-condition',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({condition:raw})});data=await response.json();if(!response.ok)throw Error(data.error||'AI 연결에 실패했어요.')}if(version!==analysisVersion||raw!==$('#condition').value)return false;applyProfile(ConditionAI.merge(E.parseState(raw),data.profile),'Gemini 해석');autoAnalyzedText=raw;return true}catch(error){if(version!==analysisVersion||raw!==$('#condition').value)return false;applyProfile(E.parseState(raw),'AI 연결 실패 · 기기 내 해석');autoAnalyzedText='';$('#parser-note').title=error.message;$('#parser-note').textContent=(error.name==='AbortError'?'AI 응답 시간 초과':error.message.replace(/기기 내 해석.*$/,'').trim().slice(0,80))+' · 기기 내 해석'+(travelMode==='transit'?' · 대중교통 조건 충족은 아직 미확인':'');return true}finally{clearTimeout(deadline);if(version===analysisVersion){analysisRequest=null;searchLabel();$('#search').removeAttribute('aria-busy');$('#find-route').disabled=!graph}}}
function effectiveProfile(){if(!profile||analyzed!==$('#condition').value)throw Error('상태를 다시 입력하고 길 찾기를 눌러 주세요.');return {...profile}}
$$('[data-example]').forEach(b=>b.onclick=()=>setCondition(b.dataset.example));$('#condition').oninput=conditionChanged;
function searchPlaces(){if(!graph)return;const q=$('#destination-query').value.trim().toLowerCase().replace(/\s/g,'');$('#places').replaceChildren();if(q.length<2){$('#places').append(textEl('p','서울 등록 시설의 이름·주소를 두 글자 이상 입력하거나 지도에서 선택하세요.','empty-note'));return}const items=cityDestinations.filter(p=>(p.name+' '+(p.address||'')).toLowerCase().replace(/\s/g,'').includes(q)).slice(0,10);for(const p of items){const button=textEl('button',p.name);button.type='button';button.append(textEl('small',(origin?Math.round(E.distance(origin,p.ll))+'m 직선거리 · ':'')+(p.address||'서울 등록 장소 · 현장 미확인')));button.onclick=()=>{setDestination(p);if(map.getZoom()<16)frameVisibleLocation(p.ll,16)};$('#places').append(button)}if(!items.length)$('#places').append(textEl('p','등록 시설 검색 결과가 없어요. 일반 주소 전체 검색은 아직 지원하지 않으며 지도에서 위치를 지정할 수 있어요.','empty-note'))}
$('#destination-query').oninput=()=>{delete $('#destination-status').dataset.selected;destination=null;checkDestinationEntry(null);invalidate();$('#destination-status').textContent='검색 결과에서 목적지를 선택해 주세요.';searchPlaces()};$('#destination-query').onfocus=searchPlaces;
function chooseOnMap(mode){pickMode=mode;entryReference=mode==='destination'&&destinationEntryReview?destination:null;if(entryReference)map.panTo(entryReference.ll);if(isMobileUI())setSheetSize('collapsed');$('#map-instruction').hidden=false;$('#map-instruction').textContent=(mode==='origin'?'출발':'도착')+'할 보행로를 지도에서 눌러 주세요. 같은 버튼을 다시 누르면 취소돼요.';$('#live-map').scrollIntoView({behavior:'smooth',block:'center'});map.invalidateSize()}
$('#pick-origin').onclick=()=>{if(pickMode==='origin'){pickMode=null;$('#map-instruction').hidden=true}else chooseOnMap('origin')};$('#pick-destination').onclick=()=>{if(pickMode==='destination'){pickMode=null;$('#map-instruction').hidden=true}else chooseOnMap('destination')};
// Independent GPS location tracking is available even when a route is preview-only.
let locationTracker=null,trackingFirstFix=false,trackingOriginPending=false,trackingFollow=true;
function followCurrentLocation(){trackingFollow=true;$('#gps-tracking-follow').hidden=true;const snapshot=locationTracker?.snapshot(),fix=snapshot?.displayFix||snapshot?.fix;if(fix){const zoom=map.getZoom();if(isMobileUI())frameVisibleLocation(fix.ll,zoom);else map.setView(fix.ll,zoom,{animate:false})}}
function stopLocationTracking(){locationTracker?.stop()}
function getPosition(){
 if(!window.isSecureContext){$('#location-status').textContent='GPS를 사용하려면 HTTPS 주소를 브라우저로 열어 주세요. 파일 미리보기에서는 제한될 수 있어요.';toast('GPS는 위치 권한을 지원하는 브라우저에서 실행해 주세요.');return}
 if(locationTracker?.snapshot().active){followCurrentLocation();return}
 endNavigation();trackingFirstFix=true;trackingOriginPending=true;trackingFollow=true;
 if(!locationTracker)locationTracker=GPSTracker.create({onUpdate:s=>{
  $('#gps-stop').hidden=!s.active;$('#locate').textContent=s.active?'◎ 내 위치로':'◎ GPS 추적 시작';$('#locate').setAttribute('aria-pressed',String(s.active));
  const badge=$('#gps-tracking-status');badge.hidden=s.phase==='stopped';
  const messages={acquiring:s.qualityMessage||'GPS 위치 안정화 중',waiting:'GPS 연결 중 · 위치 권한을 허용해 주세요',denied:'위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.',unsupported:'이 브라우저는 GPS를 지원하지 않아요.',timeout:'GPS 수신 대기 · 실외에서 다시 확인해 주세요',unavailable:'GPS 수신 대기 · 위치를 찾고 있어요',stale:'GPS 신호 지연 · 마지막 위치',stopped:'GPS 추적 종료'};
  const text=s.phase==='tracking'?`GPS 추적 중 · 수신 오차 약 ${Math.round(s.fix.accuracy)}m · 표시 안정화`:messages[s.phase]||'GPS 대기';$('#location-status').textContent=text;$('#gps-tracking-label').textContent=text;$('#gps-tracking-stop').hidden=!s.active;$('#gps-tracking-follow').hidden=!s.active||trackingFollow;
  if(s.phase==='tracking'){
   const fix=s.displayFix||s.fix;if(trackingOriginPending&&s.fix.accuracy<=25){trackingOriginPending=false;if(!routes.length){setOrigin(s.fix.ll,'현재 위치 · GPS');$('#location-status').textContent=text}}if(trackingFirstFix){trackingFirstFix=false;if(trackingFollow){if(isMobileUI())frameVisibleLocation(fix.ll,17);else map.setView(fix.ll,17)}if(!CityMap.inScope(fix.ll))toast('현재 위치는 서울 도보 자료 범위 밖이에요.')}
   if(!gpsMarker)gpsMarker=L.circleMarker(fix.ll,{radius:9,color:'#fff',weight:3,fillColor:'#1675df',fillOpacity:1}).addTo(map).bindTooltip('내 위치 · 실제 GPS');else gpsMarker.setLatLng(fix.ll);
   gpsMarker.setStyle({opacity:1,fillOpacity:1});if(!accuracyCircle)accuracyCircle=L.circle(fix.ll,{radius:fix.accuracy,color:'#1675df',weight:1,fillOpacity:.08}).addTo(map);else accuracyCircle.setLatLng(fix.ll).setRadius(fix.accuracy);
   gpsMarker.bringToFront();if(trackingFollow){const zoom=map.getZoom();if(isMobileUI())frameVisibleLocation(fix.ll,zoom);else map.setView(fix.ll,zoom,{animate:false})}
  }else if(['acquiring','stale','timeout','unavailable'].includes(s.phase)){gpsMarker?.setStyle({opacity:.45,fillOpacity:.35})}
  else if(!s.active){gpsMarker?.remove();gpsMarker=null;accuracyCircle?.remove();accuracyCircle=null}
 }});
 locationTracker.start();
}
$('#locate').onclick=getPosition;
$('#gps-stop').onclick=stopLocationTracking;
$('#gps-tracking-stop').onclick=stopLocationTracking;
$('#gps-tracking-follow').onclick=followCurrentLocation;
window.addEventListener('pagehide',()=>{transitRequest?.abort();transitStatusRequest?.abort();transitView?.destroy();stopLocationTracking();endNavigation()});
function resetTrip(){if(!graph)return;setTravelMode('walk');$('.quick-destinations').hidden=false;setOrigin(F.STATION.slice(),'월곡역 · 시연 기준점');$('#location-status').textContent='시연 위치 · GPS 아님. 출발 핀을 맞춰 주세요.';const library=localDestinations.find(p=>p.name==='월곡꿈그림도서관');if(library)setDestination(library,{pan:false});map.setView(F.STATION,17,{animate:false});if(isMobileUI())frameVisibleLocation(origin,17)}
function showSeoul(){if(map)fitMobileAware(L.latLngBounds(CityMap.BOUNDS))}
$('#school-reset').onclick=showSeoul;
let routeSelection=null,selectionRequest=null;
function clearRouteSelection(){selectionRequest?.abort();selectionRequest=null;routeSelection=null;$('#route-reason-dialog')?.close()}
async function selectWithGemini(input,signal){
 if(PortableAI.isFile())return PortableAI.selectRoute(input,{signal});
 const response=await fetch('/api/select-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});
 const data=await response.json();if(!response.ok)throw Error('Gemini 후보 비교에 연결하지 못했어요.');return RouteChoice.validateDecision(data.decision,input.candidates);
}
$('#search').onsubmit=async ev=>{
 ev.preventDefault();if(!graph)return;
 if(analysisRequest||selectionRequest){toast('경로를 비교하고 있어요. 잠시 기다려 주세요.');return}
 if(!origin){toast('GPS 또는 지도에서 출발 위치를 먼저 선택해 주세요.');$('#origin-name').focus?.();return}
 if(!destination){toast('검색 결과에서 목적지를 선택하거나 지도를 눌러 주세요.');return}
 if(travelMode==='transit'){await findTransitRoute();return}
 if(destinationEntryReview&&!destinationPreviewAllowed){$('#search-status').textContent='먼저 지도에서 도착할 진입 위치를 지정해 주세요. 검토용 보기로 원래 기준점의 연결을 확인할 수도 있어요.';chooseOnMap('destination');return}
 if(!F.inCoverage(origin)||!F.inCoverage(destination.ll)){await findCityRoute();return}
 if(isMobileUI()){document.activeElement?.blur();setSheetSize('default')}
 const requestText=$('#condition').value,tripKey=JSON.stringify([origin,destination.ll]);
 if(autoAnalyzedText!==requestText||!profile){$('#search-status').textContent='이동 조건을 해석하고 있어요…';const applied=await analyzeWithGemini();if(!applied||requestText!==$('#condition').value||tripKey!==JSON.stringify([origin,destination?.ll]))return}
 invalidate();
 const p=effectiveProfile(),version=analysisVersion,controller=new AbortController();selectionRequest=controller;
 const current=()=>version===analysisVersion&&requestText===$('#condition').value&&tripKey===JSON.stringify([origin,destination?.ll])&&!controller.signal.aborted;
 $('#find-route').disabled=true;searchLabel('경로 후보를 찾고 있어요…');$('#search').setAttribute('aria-busy','true');
 try{
  await precisionController.ready;if(!current())return;graph.meta.buildingAudit=precisionController.getAudit();
  const generated=await RouteCandidates.generate(E,EndpointRouting,graph,origin,destination.ll,p,{signal:controller.signal,onProgress:()=>$('#search-status').textContent='서로 다른 경로 후보를 찾고 있어요…'});
  if(!current())return;
  routes=generated.routes.map(r=>({...r,label:r.variantLabel}));selected=0;
  routeSelection={source:'algorithm',selectedId:routes[0]?.candidateId||null,decision:null,createdAt:new Date().toISOString(),generation:{attempts:generated.attempts,...generated.diagnostics},message:routes.length===1?'현재 조건에서 구분되는 후보 1개를 찾았어요. 대체 경로를 더 찾지 못해 AI 비교는 하지 않았어요.':'계산된 경사·미확인 구간과 거리를 비교한 결과예요.',summaries:routes.map(r=>({id:r.candidateId,...r.selectionMetrics}))};
  if(routes.length>1){
   if(!PortableAI.isFile()||PortableAI.hasKey()){
    $('#search-status').textContent='Gemini가 '+routes.length+'개 후보를 비교하고 있어요…';searchLabel('AI가 경로를 비교하고 있어요…');
    const timer=setTimeout(()=>controller.abort(),14000);
    try{
     const input=RouteChoice.input(requestText,p,routes);
     const decision=await selectWithGemini(input,controller.signal);
     if(!current())return;
     const chosen=routes.findIndex(r=>r.candidateId===decision.selectedId);
     if(chosen<0||!RouteCandidates.eligible(E,routes[chosen],p,graph.meta.buildingAudit,origin,destination.ll))throw Error('선택 결과가 이동 조건과 다릅니다.');
     selected=chosen;routeSelection={...routeSelection,source:'Gemini',selectedId:decision.selectedId,decision};
    }catch(error){
     if(version!==analysisVersion||requestText!==$('#condition').value||tripKey!==JSON.stringify([origin,destination?.ll]))return;
     routeSelection={...routeSelection,message:controller.signal.aborted?'AI 비교 시간이 초과되어 알고리즘 결과를 사용해요.':'AI 비교를 완료하지 못해 알고리즘 결과를 사용해요.'};
    }finally{clearTimeout(timer)}
   }else routeSelection.message='AI 키가 없어 알고리즘으로 후보를 비교했어요.';
  }
  // Timing out the comparison must not discard an otherwise valid local result.
  if(version!==analysisVersion||requestText!==$('#condition').value||tripKey!==JSON.stringify([origin,destination?.ll]))return;
  if(!routes.length){
   const fitted=EndpointRouting.route(E,graph,origin,destination.ll,p);
   routes=[{...fitted,label:'조건 미충족 · 검토용',p,selectionIneligible:true}];
   if(fitted.assistancePreview){const review=AccessReview.candidate(E,EndpointRouting,graph,origin,destination.ll,p,accessReports,'diagnostic');if(review)routes.push({...review,label:'육교 검토용',p,selectionIneligible:true})}
   routeSelection={source:'unavailable',selectedId:null,decision:null,createdAt:new Date().toISOString(),summaries:[],message:'요청 조건과 연결 검사를 만족하는 추천 후보가 없어요. 아래는 검토용이며 AI 선택 대상이 아니에요.'};
  }
  if(isMobileUI())setMobileMode('results');renderRoutes();drawRoutes(true);
  $('#result-title').textContent=routeSelection.source==='Gemini'?'Gemini가 비교한 경로':routeSelection.source==='unavailable'?'조건 확인 필요':'경로 후보';
  $('#search-status').textContent=routeSelection.source==='Gemini'?routes.length+'개 후보 중 Gemini가 경로를 선택했어요.':routeSelection.message;
  renderPlanReason(routes[selected],p);updateRouteCallout();
  if(isMobileUI())$('.sheet-scroll').scrollTop=0;else $('#routes').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(error){if(version!==analysisVersion)return;routes=[];routeSelection=null;routeLayer.clearLayers();snapLayer.clearLayers();$('#routes').replaceChildren();$('#mobile-route-action').replaceChildren();clearOrder();$('#search-status').textContent=error.message;if(isMobileUI())setMobileMode('input')}
 finally{if(version===analysisVersion){selectionRequest=null;searchLabel();$('#search').removeAttribute('aria-busy');$('#find-route').disabled=!graph}}
};
function showRouteReason(){
 const r=routes[selected],record=routeSelection;if(!r||!record)return;
 const box=$('#route-reason-content');box.replaceChildren();const ai=record.source==='Gemini',chosen=ai&&r.candidateId===record.selectedId;
 $('#route-reason-title').textContent=chosen?'Gemini가 이 길을 선택한 이유':ai?'직접 선택한 경로의 비교 내용':record.source==='unavailable'?'추천 조건 확인이 필요한 경로':'알고리즘이 이 길을 선택한 이유';
 if(ai){
  box.append(textEl('p',chosen?'Gemini가 후보 선택 당시 반환한 설명입니다.':'직접 선택한 경로입니다. Gemini의 원래 추천은 '+record.selectedId.replace('R','경로 ')+'입니다.','choice-source'));
  if(chosen){box.append(textEl('p',record.decision.summary,'choice-summary'));for(const [key,title] of [['advantages','선택한 장점'],['tradeoffs','감수한 점'],['cautions','미확인 사항']]){box.append(textEl('h3',title));const list=textEl('ul','');record.decision[key].forEach(t=>list.append(textEl('li',t)));box.append(list)}}
  else{const comment=record.decision.comparisons.find(c=>c.id===r.candidateId);if(comment)box.append(textEl('p',comment.comment));}
 }else box.append(textEl('p',record.message,'choice-summary'));
 if(record.generation){
  const g=record.generation,detail=textEl('details','','choice-generation');detail.append(textEl('summary','후보 탐색 결과'));
  detail.append(textEl('p',`같은 이동 조건으로 ${g.attempts}회 탐색해 비교 후보 ${record.summaries.length}개를 남겼어요. 같은 길 ${g.duplicates||0}회, 조건·연결 검사 제외 ${g.ineligible||0}회, 연결 경로 없음 ${g.noPath||0}회입니다.`));
  if(g.excessiveDetours)detail.append(textEl('p','다른 수치상 이점 없이 우회가 크게 늘어나는 경로는 제외했어요.'));
  detail.append(textEl('p',g.stopReason==='time-budget'||g.stopReason==='attempt-limit'?'탐색 한도 안의 결과이며 가능한 모든 길을 확인한 것은 아니에요.':'내장 도로망에서 탐색한 결과이며 실제 통행 가능 여부는 미확인입니다.'));box.append(detail);
 }
 if(record.summaries.length){
  const detail=textEl('details','','choice-comparison');detail.append(textEl('summary','다른 후보와 수치 비교'));const table=textEl('table',''),head=textEl('tr','');['후보','거리','최대 참고 경사','미확인 구간'].forEach(t=>head.append(textEl('th',t)));table.append(head);
  for(const m of record.summaries){const row=textEl('tr','');[m.id.replace('R','경로 '),Math.round(m.distanceMeters)+'m',m.maxReferenceSlope===null?'미확인':m.maxReferenceSlope+'%',Math.round(m.unknownMeters)+'m'].forEach(t=>row.append(textEl('td',t)));table.append(row)}detail.append(table);
  if(ai)for(const c of record.decision.comparisons)detail.append(textEl('p',c.id.replace('R','경로 ')+': '+c.comment));box.append(detail);
 }
 box.append(textEl('p','참고 경사는 보도 실측이 아닙니다. 미확인 구간과 시설 상태는 현장 확인이 필요해요.','choice-footnote'));
 box.append(textEl('small','선택 시각 · '+new Date(record.createdAt).toLocaleString('ko-KR')));
 $('#route-reason-dialog').showModal();
}
function setTravelMode(mode){
 if(!['walk','transit'].includes(mode)||travelMode===mode)return;
 if(mode==='transit'&&!/^https?:$/.test(location.protocol)){toast('대중교통은 온라인 동행길에서 사용할 수 있어요.');return}
 cancelAnalysis();invalidate();travelMode=mode;$('#transit-sharing').hidden=mode!=='transit';$('#transit-connection').hidden=mode!=='transit';$('#mobile-save').hidden=mode==='transit';
 $$('[data-travel-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.travelMode===mode)));checkDestinationEntry(destination);
 $('#ai-sharing-note').textContent=mode==='transit'?'AI 상태 해석: 상태 문장만 전송 · ODsay 검색에는 좌표 전송':'AI 비교: 상태 문장·경로 요약 전송 · 좌표 제외';
 $('#parser-note').textContent=mode==='transit'?'길 찾기를 누르면 이동 상태를 해석하고 대중교통 참고 후보를 검색해요.':'길 찾기를 누르면 상태를 해석해요.';
 $('#search-status').textContent=mode==='transit'?'버스·지하철 참고 후보를 선택했어요. 이동 조건·환승 가능 여부는 아직 미확인입니다.':'도보 길찾기를 선택했어요.';
 if(mode==='transit')refreshTransitStatus();else{transitStatusRequest?.abort();transitStatusRequest=null}
}
$$('[data-travel-mode]').forEach(button=>button.onclick=()=>setTravelMode(button.dataset.travelMode));
async function refreshTransitStatus(){
 transitStatusRequest?.abort();const controller=new AbortController();transitStatusRequest=controller;$('#transit-connection').textContent='대중교통 설정을 확인하고 있어요.';
 const timer=setTimeout(()=>controller.abort(),6000);
 try{const response=await fetch('/api/transit/status',{signal:controller.signal}),data=await response.json();if(transitStatusRequest!==controller||travelMode!=='transit')return;if(!response.ok)throw Error('설정 상태를 읽지 못했어요.');$('#transit-connection').textContent=data.state==='reference_candidates_only'?'대중교통 검색 설정됨 · 실제 연결은 검색 결과에서 확인합니다.':data.state==='disabled'?'대중교통 검색이 비활성 상태입니다.':'대중교통 검색 키 설정이 필요합니다.'}
 catch(error){if(transitStatusRequest===controller&&travelMode==='transit')$('#transit-connection').textContent='대중교통 설정을 확인하지 못했어요. 검색 시 연결 결과를 알려드려요.'}
 finally{clearTimeout(timer);if(transitStatusRequest===controller)transitStatusRequest=null}
}
$('#transit-cancel').onclick=()=>{invalidate('대중교통 검색을 취소했어요.');$('#search-status').textContent='대중교통 검색을 취소했어요.'};
async function findTransitRoute(){
 if(!/^https?:$/.test(location.protocol)){$('#search-status').textContent='대중교통 검색은 온라인 동행길에서 사용할 수 있어요.';return}
 if(transitRequest)return;
 const text=$('#condition').value,trip=JSON.stringify([origin,destination.ll]);
 if(autoAnalyzedText!==text||!profile){const ok=await analyzeWithGemini();if(!ok||text!==$('#condition').value||trip!==JSON.stringify([origin,destination?.ll])||travelMode!=='transit')return}
 invalidate();const p=effectiveProfile(),controller=new AbortController();transitRequest=controller;const timer=setTimeout(()=>controller.abort(),18000);
 $('#find-route').disabled=true;$('#transit-cancel').hidden=false;$('#search').setAttribute('aria-busy','true');searchLabel('대중교통 후보를 검색하고 있어요…');$('#search-status').textContent='ODsay에 출발·도착 좌표를 보내 참고 후보를 찾고 있어요.';
 try{const response=await fetch('/api/routes/transit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin,destination:destination.ll,profile:TransitUI.toApiProfile(p),atTime:new Date().toISOString()}),signal:controller.signal}),data=await response.json();if(transitRequest!==controller||travelMode!=='transit'||trip!==JSON.stringify([origin,destination?.ll])||text!==$('#condition').value)return;
  if(!response.ok)throw Error(data.error||'대중교통 연결을 완료하지 못했어요.');TransitUI.validate(data,p);transitResult=data;$('#result-title').textContent='대중교통 참고 후보';$('#mobile-route-status').textContent='이동 조건·환승 시각 미확인 · 참고 후보';if(isMobileUI())setMobileMode('results');transitView.show(data,p,{origin,destination:destination.ll,atTime:data.requestedAtTime});$('#search-status').textContent=data.candidates.length?'노선과 승하차 순서를 확인하세요. 요청한 이동 조건·운행편·환승 가능 여부는 아직 미확인입니다.':'제공업체에서 참고 후보를 받지 못했어요. 다른 위치로 확인해 주세요.';
 }catch(error){if(transitRequest===controller){transitResult=null;transitView?.clear();$('#search-status').textContent=error.name==='AbortError'?'대중교통 검색을 취소했거나 응답 시간이 초과됐어요.':error.message}}
 finally{clearTimeout(timer);if(transitRequest===controller){transitRequest=null;$('#transit-cancel').hidden=true;$('#find-route').disabled=!graph;$('#search').removeAttribute('aria-busy');searchLabel()}}
}
async function findCityRoute(){
 if(!/^https?:$/.test(location.protocol)){$('#search-status').textContent='서울 전역 도보 계산은 온라인 동행길에서 지원합니다. 파일 실행은 월곡 상세 시연을 사용할 수 있어요.';return}
 const inputText=$('#condition').value,trip=JSON.stringify([origin,destination.ll]);
 if(autoAnalyzedText!==inputText||!profile){const ok=await analyzeWithGemini();if(!ok||inputText!==$('#condition').value||trip!==JSON.stringify([origin,destination?.ll]))return}
 invalidate();const controller=new AbortController();cityRequest=controller;const atTime=new Date().toISOString(),timeout=setTimeout(()=>controller.abort(),18000),p=effectiveProfile();$('#find-route').disabled=true;searchLabel('서울 보행 경로를 계산하고 있어요…');$('#search').setAttribute('aria-busy','true');$('#search-status').textContent='서울 등록 도로의 연결과 이동 조건을 확인하고 있어요.';
 try{const response=await fetch('/api/routes/city-walk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({origin,destination:destination.ll,profile:TransitUI.toApiProfile(p),atTime}),signal:controller.signal}),data=await response.json();if(cityRequest!==controller||trip!==JSON.stringify([origin,destination?.ll]))return;if(!response.ok)throw Error(data.error||'서울 보행 계산에 실패했어요.');if(data.schema!=='donghaeng-city-walk-v1'||data.fieldVerified!==false||data.accessibilityVerified!==false||!Array.isArray(data.coordinates)||data.coordinates.length<2)throw Error('서울 보행 결과를 확인하지 못했어요.');cityRoute=data;
  L.polyline(data.coordinates,{color:'#fff',weight:9,opacity:.95}).addTo(routeLayer);L.polyline(data.coordinates,{color:'#176d52',weight:5,opacity:.95}).addTo(routeLayer);fitMobileAware(L.latLngBounds([...data.coordinates,origin,destination.ll]));$('#routes').replaceChildren();const card=textEl('article','','route-card');card.append(textEl('h3','서울 보행 참고 경로'),textEl('p',Math.round(data.distanceMeters).toLocaleString()+'m · 약 '+data.minutes+'분','city-route-summary'),textEl('p','계단 등록 구간 '+Math.round(data.stepsMeters)+'m · 경사 미등록 '+Math.round(data.unknownInclineMeters)+'m','city-route-note'));
  for(const note of data.notices)card.append(textEl('p',note,'gap-note'));card.append(textEl('p','출발/도착 등록 도로까지 약 '+data.endpointGaps.map(Math.round).join('m / ')+'m · 이 연결은 미검증입니다.','city-route-note'));
  const details=textEl('details',''),summary=textEl('summary','자료 출처와 기준일');details.append(summary,textEl('p','OSM 자료 기준 '+data.sourceMetadata.source_as_of+' · 수집 '+data.sourceMetadata.collected_date+' · EPSG:4326 · ODbL-1.0'));for(const w of data.sourceWays.slice(0,30)){const a=textEl('a',w.name||'OSM way/'+w.id);a.href='https://www.openstreetmap.org/way/'+w.id;a.target='_blank';a.rel='noopener noreferrer';details.append(a,document.createElement('br'))}card.append(details);$('#routes').append(card);$('#result-title').textContent='서울 보행 경로';$('#search-status').textContent='등록 도로의 참고 경로입니다. 현장 통행·접근성 확인이 필요해요. 서울 전역 GPS 경로 안내는 아직 지원하지 않습니다.';if(isMobileUI())setMobileMode('results');
 }catch(error){if(cityRequest===controller)$('#search-status').textContent=error.name==='AbortError'?'계산을 취소했거나 응답 시간이 초과됐어요.':error.message}
 finally{clearTimeout(timeout);if(cityRequest===controller){cityRequest=null;$('#find-route').disabled=!graph;$('#search').removeAttribute('aria-busy');searchLabel()}}
}
function endpointReview(route,start=origin,end=destination.ll){return precisionController.reviewRoute(route,start,end)}
function renderRoutes(){for(const route of routes)route.connectionReview=endpointReview(route);const c=$('#routes');c.replaceChildren();$('#mobile-route-action').replaceChildren();routes.forEach((r,i)=>{const card=textEl('article','','route-card'+(selected===i?' selected':'')+(r.assistancePreview?' risk-preview':'')+(r.accessReview?' reported-route':''));const choose=textEl('button','');choose.type='button';choose.style.cssText='border:0;background:transparent;padding:0;width:100%;text-align:left';choose.setAttribute('aria-pressed',selected===i);choose.setAttribute('aria-label',r.label);const top=textEl('div','','route-header');top.append(textEl('span',compactRouteTitle(r),'route-tag'+(r.comparison?' tag-gray':'')),textEl('span','','select-circle'));const time=textEl('div',Math.max(1,Math.ceil((r.totalLength||r.length)/r.p.speed))+'분','route-time');time.append(textEl('em',Math.round(r.totalLength||r.length)+'m · 예상'));const stairs=r.edges.filter(e=>e.steps).reduce((a,e)=>a+e.d,0),features=textEl('div','','route-features');features.append(textEl('span','등록 계단 '+(stairs?Math.round(stairs)+'m':'0구간')));choose.append(top,time,features);if(r.assistancePreview)choose.append(textEl('p','경로 미리보기 · 실제 GPS 안내 아님','route-preview-note'));if(!r.accessReview&&r.maxEstimatedSlope!=null)choose.append(textEl('p',`경사 추정 최대 ${r.maxEstimatedSlope.toFixed(1)}% · 보도 실측 아님`,'slope-summary'));if(r.restStop)choose.append(textEl('p',`☕ ${r.restStop.name} · 약 ${Math.ceil(r.restStop.firstDistance/r.p.speed)}분 뒤 휴식`,'route-description'));if(r.restStop?.evidenceNotice)choose.append(textEl('p',r.restStop.evidenceNotice,'gap-note'));choose.onclick=()=>{selected=i;renderRoutes();drawRoutes(true);c.querySelectorAll('.route-card button[aria-pressed]')[i]?.focus({preventScroll:true})};card.append(choose);if(r.comparison)card.append(textEl('p','입력한 이동 제약을 적용하지 않은 비교 경로입니다.','route-status'));const warns=textEl('div',r.messages.join(' '),'route-warnings'),limits=textEl('details','','route-limits');limits.open=false;limits.append(textEl('summary','경로 정보'),warns);if(r.accessReview)limits.append(textEl('p',`지형 추정 상단 ${r.reviewMaxScreening.toFixed(2)}% · 보도 실측 아님. 이용 경험 제보와 추정 자료가 달라 실제 노면 확인이 필요해요.`,'gap-note'));card.append(limits);if(r.connectionReview?.needsEndpointReview){const issue=r.connectionReview.destination.status==='building_overlap'?'destination':'origin',evidence=r.connectionReview[issue];const notice=textEl('p',`${issue==='destination'?'도착':'출발'} 연결 약 ${Math.round(evidence.lengthMeters)}m 중 약 ${Math.round(evidence.overlapMeters)}m가 정밀지도 건물 도형과 겹칩니다. 출입구·층위 확인 전에는 이 직선을 이동 동선으로 안내할 수 없어요.`,'route-warnings');card.append(notice);const repair=textEl('button',issue==='destination'?'도착 진입 위치를 지도에서 수정':'출발 진입 위치를 지도에서 수정','secondary');repair.type='button';repair.onclick=()=>chooseOnMap(issue);card.append(repair)}limits.append(textEl('p',`출발점→도로 약 ${Math.round(r.gaps[0])}m / 도로→목적지 약 ${Math.round(r.gaps[1])}m는 미검증 연결입니다. 연결 구간은 실제 진입 동선과 다를 수 있어요.`,'gap-note'));if(r.connectionReview?.bodyConflicts?.length)card.append(textEl('p','경로 중 건물 도형과 겹치는 구간이 있습니다. 길 찾기를 다시 실행하고 지도 위치를 확인해 주세요.','route-warnings'));if(selected===i){const go=textEl('button',isMobileUI()?'이동 순서 보기 →':'이동 순서 보기 →','route-go');go.onclick=()=>{if(isMobileUI()){setMobileMode('order');selectStage(0,true)}else showDetails()};if(isMobileUI())$('#mobile-route-action').append(go);else card.append(go);const actions=isMobileUI()?$('#mobile-route-action'):card;const reason=textEl('button','이 길을 선택한 이유','secondary route-reason-button');reason.type='button';reason.onclick=showRouteReason;actions.append(reason);if(routeSelection?.source==='Gemini'&&r.candidateId===routeSelection.selectedId)card.append(textEl('p','Gemini 추천','choice-badge'));const live=textEl('button',r.connectionReview?.needsGeometryReview?'지도 위치 확인 후 GPS 시작':r.assistancePreview?'현장 확인 후 안내':'안내 시작','navigation-start');live.disabled=!!(r.assistancePreview||r.selectionIneligible||r.connectionReview?.needsGeometryReview);live.type='button';live.onclick=startTracking;const replay=textEl('button','경로 재생','navigation-replay');replay.type='button';replay.onclick=()=>startNavigation(true);if(!live.disabled)actions.append(live);else{const track=textEl('button','GPS 위치 추적','navigation-track secondary');track.type='button';track.onclick=getPosition;actions.append(track)}actions.append(replay)}c.append(card)})}
function drawRoutes(fit){routeLayer.clearLayers();snapLayer.clearLayers();routes.forEach((r,i)=>{if(i===selected)return;L.polyline(r.coords,{color:'#8d9895',weight:5,opacity:.8,dashArray:'7 8'}).addTo(routeLayer)});const r=routes[selected];if(!r)return;L.polyline(r.coords,{color:'white',weight:12,opacity:.95}).addTo(routeLayer);L.polyline(r.coords,{color:r.assistancePreview?'#61788b':'#176d52',weight:7,opacity:.95}).addTo(routeLayer);r.edges.forEach((e,i)=>{if(e.approximateConnection){L.polyline([r.coords[i],r.coords[i+1]],{color:'#8653a3',weight:8,dashArray:'3 7'}).bindTooltip('사용자 제보 연결 가설 · 승강기 문 위치 아님 · 접근·운행 미확인').addTo(routeLayer);return}const info=e.slopeScreening,grade=E.screeningGrade(e),color=grade>(r.p.maxSlope??5)?(e.incline!=null?'#c5352f':'#b3905e'):info?.kind==='source_range'?'#d9871d':info?.kind==='structure_unresolved'||info?.kind==='no_dem'?'#8653a3':null;if(color)L.polyline([r.coords[i],r.coords[i+1]],{color,weight:8,opacity:.95}).bindTooltip(slopeDescription(e)).addTo(routeLayer)});[[origin,r.from],[r.to,destination.ll]].forEach((coords,i)=>{const overlap=r.connectionReview?.[i?'destination':'origin']?.status==='building_overlap';if(overlap)return;L.polyline(coords,{color:overlap?'#b63c32':'#cc9344',weight:3,dashArray:'4 6'}).bindTooltip(overlap?'정밀지도 건물과 겹침 · 진입 위치 재확인 필요':'도로까지 미검증 연결 · 현장에서 확인').addTo(snapLayer)});if(r.restStop&&r.connectionReview?.rest?.status!=='building_overlap')L.polyline([r.restStop.snap,r.restStop.ll],{color:'#cc9344',weight:3,dashArray:'4 6'}).addTo(snapLayer);if(fit)fitMobileAware(L.latLngBounds([...r.coords,origin,destination.ll]));buildOrder(r);renderPlanReason(r,r.p);updateRouteCallout()}
$('#fit-route').onclick=()=>{if(routes.length)drawRoutes(true);else if(transitView?.hasData())transitView.fit();else if(cityRoute)fitMobileAware(L.latLngBounds(cityRoute.coordinates));else showSeoul();if(innerWidth<=700)$('#live-map').scrollIntoView({behavior:'smooth',block:'center'})};

function clearOrder(){journeyStages=[];stageMarkers.clearLayers();stageFocus.clearLayers();$('#route-order').hidden=true;$('#order-list').replaceChildren()}
function bearing(a,b){return Math.atan2((b[1]-a[1])*Math.cos(a[0]*Math.PI/180),b[0]-a[0])*180/Math.PI}
function turnLabel(previous,coords){if(!previous||previous.length<2||coords.length<2)return '→';const delta=(bearing(coords[0],coords[1])-bearing(previous.at(-2),previous.at(-1))+540)%360-180;return Math.abs(delta)>150?'↶':delta>35?'↱':delta< -35?'↰':'↑'}
function buildOrder(r){clearOrder();const groups=[];let previous=null;for(let i=0;i<r.edges.length;i++){const e=r.edges[i],last=groups.at(-1);if(last&&!last.bench&&last.name===e.name&&last.steps===e.steps){last.length+=e.d;last.coords.push(r.coords[i+1])}else{const coords=[r.coords[i],r.coords[i+1]],arrow=turnLabel(previous,coords);groups.push({name:e.name,length:e.d,coords,steps:e.steps,approximateConnection:e.approximateConnection,arrow})}previous=[r.coords[i],r.coords[i+1]];if(r.restStop&&E.distance(r.coords[i+1],r.restStop.snap)<1&&!groups.some(g=>g.bench))groups.push({name:r.restStop.name+'에서 쉬어가기',bench:true,coords:[r.restStop.snap,r.restStop.ll],length:0,gap:r.restStop.gap})}
journeyStages=[{title:'출발 · '+originName,sub:r.connectionReview?.origin.status==='building_overlap'?'GPS 오차 또는 건물 내부 위치일 수 있어요. 출발 핀을 실제 보행로에 맞춰 주세요.':`보행로까지 약 ${Math.round(r.gaps[0])}m · 연결은 현장에서 확인`,coords:r.connectionReview?.origin.status==='building_overlap'?[origin]:[origin,r.from],kind:'start',arrow:'출'},...groups.map(g=>({...g,title:g.approximateConnection?'엘리베이터 이용':g.bench?g.name:`${g.name} 따라 ${Math.round(g.length)}m 이동`,sub:g.approximateConnection?'출입문 좌표 없음 · 점선은 접근 연결 예시':g.bench?`보행로에서 약 ${Math.round(g.gap)}m · 휴식 장소 상태 미확인`:g.steps?'계단 구간 · 주의해서 확인하세요.':`${g.arrow==='↱'?'오른쪽으로 방향 전환':g.arrow==='↰'?'왼쪽으로 방향 전환':g.arrow==='↶'?'반대 방향으로 전환':'길을 따라 이어서 이동'} · 지도 기준 안내`,kind:g.bench?'rest':'walk',arrow:g.bench?'☕':g.arrow})),{title:'도착 · '+destination.name,sub:r.connectionReview?.destination.status==='building_overlap'?'직선 연결이 건물 도형과 겹칩니다. 출입구 위치를 다시 지정하세요.':`도로에서 목적지까지 약 ${Math.round(r.gaps[1])}m · 출입구는 현장 확인`,coords:r.connectionReview?.destination.status==='building_overlap'?[destination.ll]:[r.to,destination.ll],kind:'finish',arrow:'도'}];activeStage=0;$('#route-order').hidden=false;renderOrder();journeyStages.forEach((stage,i)=>{if(stage.kind==='start'||stage.kind==='finish')return;const ll=stage.kind==='rest'?stage.coords.at(-1):stage.coords[Math.floor(stage.coords.length/2)],marker=L.marker(ll,{icon:L.divIcon({className:'order-map-marker'+(stage.kind==='rest'?' rest-marker':''),html:`<span>${i+1}</span>`,iconSize:[25,25],iconAnchor:[12,12]}),title:`${i+1}. ${stage.title}`,keyboard:true}).addTo(stageMarkers);marker.bindTooltip(`${i+1}. ${stage.title}`);marker.on('click',()=>selectStage(i,true))})}
function renderOrder(){const c=$('#order-list');c.replaceChildren();journeyStages.forEach((stage,i)=>{const li=document.createElement('li'),button=textEl('button','','order-step'+(i===activeStage?' is-current':'')+(stage.kind==='rest'?' is-rest':''));button.type='button';if(i===activeStage)button.setAttribute('aria-current','step');button.setAttribute('aria-label',`${i+1}단계. ${stage.title}. ${stage.sub}`);const number=textEl('span',String(i+1),'order-number'),body=textEl('span','','order-step-body');body.append(textEl('b',stage.title),textEl('small',stage.sub));button.append(number,body,textEl('span',stage.arrow,'order-arrow'));button.onclick=()=>selectStage(i,true);li.append(button);c.append(li)});renderMobileStage();$('#order-progress').textContent=`${activeStage+1} / ${journeyStages.length} 단계`;$('#order-prev').disabled=activeStage===0;$('#order-next').disabled=activeStage===journeyStages.length-1;$('#order-next').textContent=activeStage===journeyStages.length-2?'도착 지점 보기 →':'다음 구간 →';const row=c.children[activeStage];if(row){const rb=row.getBoundingClientRect(),cb=c.getBoundingClientRect();if(rb.top<cb.top)c.scrollTop-=cb.top-rb.top;else if(rb.bottom>cb.bottom)c.scrollTop+=rb.bottom-cb.bottom}}
function selectStage(index,fit){if(index<0||index>=journeyStages.length)return;activeStage=index;renderOrder();stageFocus.clearLayers();const stage=journeyStages[index];L.polyline(stage.coords,{color:'#fff',weight:17,opacity:1}).addTo(stageFocus);L.polyline(stage.coords,{color:'#e09a36',weight:9,opacity:1}).addTo(stageFocus);L.circleMarker(stage.coords.at(-1),{color:'white',weight:3,radius:9,fillColor:'#d18a27',fillOpacity:1}).addTo(stageFocus);if(fit)fitMobileAware(L.latLngBounds(stage.coords));if(innerWidth<=700)$('#live-map').scrollIntoView({behavior:'smooth',block:'center'})}
$('#order-prev').onclick=()=>selectStage(activeStage-1,true);$('#order-next').onclick=()=>selectStage(activeStage+1,true);

function groupSteps(r){const groups=[];for(const [index,e] of r.edges.entries()){const last=groups.at(-1);if(last&&last.id===e.id){last.length+=e.d;last.slopeEvidenceEdges.push(e);const grade=E.screeningGrade(e);if(grade>(last.screeningMax??-1)||['source_range','structure_unresolved','no_dem'].includes(e.slopeScreening?.kind)){last.slopeScreeningText=slopeDescription(e);last.screeningMax=grade??last.screeningMax}if(e.terrainSlope!=null)last.terrainSlope=Math.max(last.terrainSlope||0,e.terrainSlope)}else groups.push({id:e.id,name:e.name,length:e.d,steps:e.steps,incline:e.incline,terrainSlope:e.terrainSlope??null,slopeScreeningText:slopeDescription(e),slopeEvidenceEdges:[e],approximateConnection:e.approximateConnection});if(r.restStop&&E.distance(r.coords[index+1],r.restStop.snap)<1&&!groups.some(x=>x.bench))groups.push({id:'bench',name:r.restStop.name+'에서 쉬어가기',length:0,bench:true,gap:r.restStop.gap})}return groups}
function showDetails(){const r=routes[selected];if(!r)return;currentStep=-1;detailGroups=groupSteps(r);$('#detail-title').textContent=r.label;$('#detail-summary').textContent=`${originName} → ${destination.name} · 약 ${Math.max(1,Math.ceil((r.totalLength||r.length)/r.p.speed))}분 / ${Math.round(r.totalLength||r.length)}m`;$('#detail-dialog .demo-banner').textContent=r.assistancePreview?'경로 재생 화면 · 실제 GPS 길 안내 아님':'이동 순서를 미리 확인하는 화면';renderSteps();$('#next-step').textContent='시뮬레이션 시작 →';if(!$('#start-live')){const wrap=textEl('div','','detail-mode'),live=textEl('button','◎ GPS로 이동 확인','secondary');live.id='start-live';live.onclick=startTracking;wrap.append(live);$('#detail-dialog').append(wrap)}$('#start-live').hidden=!!(r.assistancePreview||r.selectionIneligible||r.connectionReview?.needsGeometryReview);$('#detail-dialog').showModal()}
function renderSteps(){const c=$('#steps');c.replaceChildren();detailGroups.forEach((s,i)=>{const li=textEl('li',s.approximateConnection?'엘리베이터 이용':s.bench?s.name:s.name+' 따라 약 '+Math.round(s.length)+'m',currentStep===i?'current':'');li.append(textEl('small',s.approximateConnection?'출입문 좌표·실시간 운행 정보 없음':s.bench?`보행로에서 벤치까지 약 ${Math.round(s.gap)}m · 연결과 시설 상태 미확인`:s.steps?'계단 구간 · 비교 경로 이용 주의':slopeGroupDescription(s)));c.append(li)})}
$('#next-step').onclick=()=>{currentStep++;if(currentStep>=detailGroups.length){currentStep=-1;$('#next-step').textContent='다시 체험하기 ↻';toast('시뮬레이션을 완료했어요. 실제 도착 여부를 확인한 것은 아닙니다.')}else $('#next-step').textContent=currentStep===detailGroups.length-1?'시뮬레이션 완료 ✓':'다음 구간 →';renderSteps();$('#steps .current')?.scrollIntoView({block:'nearest'})};
function stopTracking(notify=true){endNavigation();if(notify)toast('GPS 안내를 종료했어요.')}
function startTracking(){startNavigation(false)}
$('#save-route').onclick=()=>{const r=routes[selected];if(!r)return;const item={id:Date.now(),origin,originName,destination,condition:$('#condition').value,options:r.p,label:r.label};if(write('donghaeng.school.routes',[item,...read('donghaeng.school.routes')]))toast('이 브라우저에 경로 조건을 저장했어요.')};
$$('[data-view]').forEach(b=>b.onclick=()=>{if(isMobileUI())setMobileMode(b.dataset.view==='saved'?'saved':routes.length||transitResult||cityRoute?'results':'input');$$('[data-view]').forEach(x=>x.classList.toggle('active',x===b));$('#planner').hidden=b.dataset.view!=='route';$('#saved-view').hidden=b.dataset.view!=='saved';$('.intro').hidden=b.dataset.view==='saved';if(b.dataset.view==='saved')renderSaved()});
function storageRecovery(container,key,items){if(!storageIssues[key])return;const note=textEl('p','읽을 수 없는 저장 항목 '+storageIssues[key]+'개가 있어요. 정상 항목은 유지했어요.','storage-recovery'),button=textEl('button',items.length?'정상 항목만 유지':'저장 자료 초기화','secondary');button.type='button';button.onclick=()=>{if(write(key,items)){storageIssues[key]=0;key==='donghaeng.school.routes'?renderSaved():renderReports()}};container.append(note,button)}
function renderSaved(){const c=$('#saved-list'),items=read('donghaeng.school.routes');c.replaceChildren();storageRecovery(c,'donghaeng.school.routes',items);if(!items.length)c.append(textEl('p','경로 상세에서 저장하면 여기에 나타나요.','empty-note'));items.forEach(item=>{const box=textEl('div','','saved-item');box.append(textEl('b',item.destination.name),textEl('p',item.condition));const open=textEl('button','이 조건으로 다시 찾기 →');open.onclick=()=>{setOrigin(item.origin,item.originName);setDestination(item.destination);setCondition(item.condition);$('[data-view="route"]').click();$('#search').requestSubmit()};const del=textEl('button','삭제');del.onclick=()=>{if(write('donghaeng.school.routes',items.filter(x=>x.id!==item.id)))renderSaved()};box.append(open,del);c.append(box)})}
function info(title,text){$('#info-title').textContent=title;$('#info-text').textContent=text;$('#info-dialog').showModal()}
// usage-guide:start
function openUsageGuide(){
 const guide=$('#usage-guide'),fileMode=['file:','content:'].includes(location.protocol);
 const portable=fileMode&&globalThis.PortableAI?.isFile();
 $('#usage-ai-flow').textContent=portable?'AI 키를 설정하면 상태 문장과 후보별 거리·경사 요약을 Google Gemini로 직접 보내요. 키는 이 창의 메모리에서만 사용해요.':fileMode?'파일 실행에서는 기기 내 해석을 사용해요. 상태 문장을 외부 AI로 보내지 않아요.':'길 찾기를 누르면 상태 문장과 후보별 거리·경사·미확인 구간 요약을 서버를 거쳐 Google Gemini로 보내요. 서버는 상태 문장을 저장하지 않아요.';
 $('#usage-ai-boundary').textContent=fileMode&&!portable?'출발지·목적지·지도 자료도 AI로 보내지 않아요.':'좌표·목적지 이름·지도 도형은 자동으로 보내지 않아요. AI 연결에 실패하면 기기 내 해석과 알고리즘 선택을 사용해요.';
 $('#usage-precision-note').hidden=!document.getElementById('bundled-precision-map');
 guide.querySelectorAll('details').forEach(item=>item.open=false);
 guide.showModal();guide.querySelector('.usage-body').scrollTop=0;
 $('#usage-title').focus({preventScroll:true});
}
$('#about').onclick=openUsageGuide;
$('#usage-start').onclick=()=>{
 $('#usage-guide').close();
 $('[data-view="route"]').click();setMobileMode('input');
 requestAnimationFrame(()=>{
  $('#destination-query').focus({preventScroll:true});
  if(!isMobileUI())$('#destination-query').scrollIntoView({block:'nearest'});
 });
};
// usage-guide:end
$('#report-open').onclick=()=>{$('#report-place').value=destination?.name||originName;renderReports();$('#report-dialog').showModal()};$('#report-form').onsubmit=e=>{e.preventDefault();const p=$('#report-place').value.trim(),t=$('#report-text').value.trim();if(!p||!t)return toast('위치와 상세 내용을 입력해 주세요.');if(write('donghaeng.school.reports',[{place:p,text:t,type:$('#report-type').value,date:new Date().toLocaleDateString('ko-KR')},...read('donghaeng.school.reports')])){$('#report-form').reset();renderReports();toast('제보를 이 브라우저에 저장했어요. 경로에 자동 반영되지는 않습니다.')}};
function renderReports(){const c=$('#report-history'),items=read('donghaeng.school.reports');c.replaceChildren();storageRecovery(c,'donghaeng.school.reports',items);if(items.length)c.append(textEl('b','내 제보 '+items.length+'건'));items.slice(0,5).forEach(x=>c.append(textEl('p',`${x.type} · ${x.place} / ${x.text}`)))}
$$('dialog .close').forEach(b=>b.onclick=()=>b.closest('dialog').close());document.addEventListener('click',e=>{if(!e.target.closest('.destination-field'))$('#places').replaceChildren()});window.addEventListener('pagehide',()=>{clearRouteSelection();stopTracking(false)});
async function hashRoadText(text){if(!globalThis.crypto?.subtle)return null;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function loadTerrain(){try{const embedded=document.getElementById('bundled-terrain');let data;if(embedded)data=JSON.parse(embedded.textContent);else{const res=await fetch('terrain-data.json');if(!res.ok)throw Error('고도자료 로딩 실패');data=await res.json()}E.applyTerrain(graph,data);graph.meta.allowAssistancePreview=true;map.attributionControl.addAttribution('지형 © <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen/Tilezen · USGS</a>')}catch{toast('추가 고도자료를 읽지 못해 OSM 경사 표기만 사용합니다.')}}
async function init(){try{await window.DONGHAENG_DATA_READY;map=L.map('live-map',{zoomControl:false,minZoom:3,maxZoom:19}).fitBounds(CityMap.BOUNDS);map.on('dragstart',()=>{if(locationTracker?.snapshot().active){trackingFollow=false;$('#gps-tracking-follow').hidden=false}});L.control.zoom({position:'topright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);await SeoulBaseMap.create(map);routeLayer.addTo(map);snapLayer.addTo(map);stageMarkers.addTo(map);stageFocus.addTo(map);facilityController=FacilityMap.create(map,{onSelectDestination:facilityDestination,onOpen:()=>{if(isMobileUI())setSheetSize('collapsed')}});precisionController=PrecisionMap.create(map,{onOpen:()=>{if(isMobileUI())setSheetSize('collapsed');const facilities=$('.facility-control');if(facilities)facilities.open=false}});transitView=TransitUI.create({map,container:$('#routes'),fitBounds:fitMobileAware});const roadText=document.getElementById('bundled-map-data').textContent;const localData=JSON.parse(roadText);graph=E.createGraph(localData);graph.meta.graphSha256=await hashRoadText(roadText);await loadTerrain();setTimeout(()=>DONGHAENG_LOAD_DATA('bundled-terrain-evidence').then(text=>TerrainEvidence.attach(graph,JSON.parse(text))).catch(()=>toast('추가 표고 근거를 읽지 못했어요. 기존 경사 검토 자료를 사용합니다.')),1000);try{const embedded=document.getElementById('bundled-access-reports'),data=embedded?JSON.parse(embedded.textContent):await (await fetch('data/precision/access-reports.json')).json();if(data.version===1&&Array.isArray(data.reports))accessReports=data.reports}catch{accessReports=[]}routeLayer.bringToFront?.();map.on('click',ev=>{if(!pickMode)return;const ll=[ev.latlng.lat,ev.latlng.lng];if(!CityMap.inScope(ll))return toast('서울 도보 자료 범위 안에서 선택해 주세요.');if(pickMode==='origin')setOrigin(ll,'지도에서 지정한 출발지');else{const reference=entryReference;setDestination({ll,name:reference?reference.name+' · 지정 진입 위치':'지도에서 지정한 목적지',...(reference?{reference:{name:reference.name,ll:reference.ll},sourceUrl:reference.sourceUrl}:{})});entryReference=null}pickMode=null;$('#map-instruction').hidden=true;if(isMobileUI())setSheetSize('default')});$('.facility-control').addEventListener('toggle',()=>{if(isMobileUI()&&$('.facility-control').open)setSheetSize('collapsed')});await Promise.all([facilityController.ready,precisionController.ready]);if(!precisionController.getData()?.features.length)throw Error('필수 정밀지도 검증 자료를 확인하지 못했어요.');graph.meta.buildingAudit=precisionController.getAudit();facilityFeatures=facilityController.getFeatures();graph.benches=F.stopCandidates(facilityFeatures,E);graph.restPlaces=F.restCandidates(facilityFeatures,E);localDestinations=F.placeOptions(facilityFeatures,graph.places,E);cityDestinations=CityMap.places(facilityFeatures,localDestinations);showSeoul();$('#find-route').disabled=false;$('#data-note').textContent=`서울 도보는 OSM 등록 도로 참고 계산, 월곡 상세 시연은 기존 자료를 사용합니다. 서울 전역의 휴식/휠체어 접근성 검증은 미완료입니다. 지도 자료 기반 경로 · 현재 위치·사진 추정 위치·운영 상태를 구분해 안내합니다. 경사·턱·출입구 미확인 구간은 현장에서 확인하세요.`;$('#search-status').textContent='출발·목적지와 상태를 확인해 주세요.';$('#destination-status').textContent='서울 등록 시설 검색 또는 지도에서 선택';renderDashboard();$('#boot-status').hidden=true;if(new URLSearchParams(location.search).get('demo')==='luna-wheelchair'){$('#luna-origin').click();chooseDestination('school');setCondition('휠체어를 이용해요. 경사와 계단을 피해서 가고 싶어요.');$('#search').requestSubmit()}}catch(e){$('#search-status').textContent='지도 준비 실패: '+e.message+' · 새로고침으로 다시 시도해 주세요.';$('#destination-status').textContent='데이터를 불러오지 못했어요.';$('#boot-status').textContent='준비 중 오류가 발생했어요. 새로고침하거나 이용 안내를 확인해 주세요.'}}

function facilityDestination(place){if(!CityMap.inScope(place.ll)){toast('서울 도보 자료 범위 밖의 시설입니다.');return false}setDestination(place);if(isMobileUI())setMobileMode('input');else $('#search').scrollIntoView({behavior:'smooth',block:'start'});toast('목적지를 선택했어요. 내 상태에 맞는 길을 찾아보세요.');return true}
function renderDashboard(){const stats=F.dashboard(facilityFeatures,E);$('#registered-records').textContent=stats.records.toLocaleString();$('#local-rest-count').textContent=(stats.counts.bench||0)+(stats.counts.seating||0);$('#data-source-caption').textContent=`등록 시설 ${stats.records.toLocaleString()}건 · 단지 경계·제보 구역 별도 · 현재 상태 미확인`;}
function compactRouteTitle(r){if(r.variantLabel)return r.variantLabel;return r.accessReview?'육교 경유':r.assistancePreview?'대체 경로':r.comparison?'최단 경로 · 비교용':r.restStop?.kind==='shelter'?'쉼터 경유':r.restStop?'벤치 경유':'맞춤 경로'}
function renderPlanReason(r,p){
 const panel=$('#plan-reason');$('#route-evidence').hidden=false;panel.hidden=false;panel.classList.toggle('risk-preview',!!r.assistancePreview);panel.replaceChildren();
 panel.append(textEl('b',p.source==='Gemini'?'AI가 해석한 이동 조건':'기기 내 해석 · AI 서버 응답 사용 안 함'));
 const rules=[];if(p.avoidSteps)rules.push('등록 계단 제외');if(p.avoidSlope)rules.push('지형 추정 경사 고려');if(p.maxSlope!=null)rules.push('참고 상한 '+p.maxSlope+'%');if(p.rest)rules.push(p.restKind==='shelter'?'쉼터 우선':p.restKind==='bench'?'벤치 우선':'휴식 장소 우선');if(p.short)rules.push('거리 우선');
 panel.append(textEl('p',rules.join(' · ')||'기본 보행 경로'));
 if(r.restStop)panel.append(textEl('p','휴식: '+r.restStop.name));
 panel.append(textEl('small','경사는 지형 추정이며 보도 실측 아님. 미확인 경사·턱·시설 상태는 현장 확인이 필요해요.'));
 renderSlopeCoverage(panel,r);
 const button=textEl('button','자료 출처·한계 보기 ↗','terrain-source-link');button.type='button';button.onclick=()=>showSlopeEvidence(r);panel.append(button);renderMobileRouteStatus(r,p);
}

function showSlopeEvidence(r){const evidence=r.slopeEvidence||E.slopeSummary(r.edges),lines=['OSM 수치는 도로에 등록된 표기이며 현장 검증을 뜻하지 않습니다.','Tilezen은 기존 도로 창의 평균 지형 추정입니다. 원시 DEM 실효 해상도·노면 고도는 미확인입니다.','서울시 표고점·등고선은 노면 실측 경사가 아니며 수직기준·관측 정확도가 확인되지 않아 비교만 합니다.','Copernicus GLO-30은 건물·수목을 포함하는 DSM(EGM2008)으로 비교만 하며 경로 값을 대체하지 않습니다.','자료 차이·교량·고가·터널·지하·층위 불명 구간은 지형 추정을 적용하지 않습니다. 자료 차이는 범위로, 짧은 도로는 60m 방향별 지형 참고 추정으로 위험을 검토합니다. 교량·지하 등은 별도 확인 대상으로 남깁니다. 경사 회피 조건이 충족되지 않으면 독립 이동 추천과 구분한 위험 대안으로 표시합니다. 이는 추천 규칙일 뿐 노면 경사 상한 충족이나 휠체어 통행 가능·불가능의 확정 판정이 아닙니다.'];if(graph.meta.terrain?.reviewState!=='current')lines.push('현재 비교 검증 자료가 연결되지 않았습니다. 기존 참고 추정만 표시합니다.');for(const example of evidence.examples){const signed=v=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(1)+'%':'추정 없음';lines.push(`\n${example.name} · OSM way/${example.wayId}\n같은 도로 창 약 ${example.supportM||100}m 비교: Tilezen ${signed(example.signedGrades.tilezen)} / Copernicus ${signed(example.signedGrades.copernicus)} / 서울 표고점 보간 ${signed(example.signedGrades.seoul_spots)}\n차이 ${Number(example.differencePp).toFixed(1)}%p · 어느 값이 정답인지는 미확인`) }lines.push('\n5%p 차이는 검증 대상을 고르는 보수적 정책값이며 정확도 기준이 아닙니다. 서로 다른 수직기준을 보정 없이 합치지 않습니다.','\n출처: 서울특별시 · 원천 국토지리정보원 수치지형도 · 공공누리 제1유형','Mapzen/Tilezen; SRTM/GMTED2010 terrain data courtesy of the U.S. Geological Survey','produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved');if(graph.meta.terrainEvidence){const t=graph.meta.terrainEvidence;lines.push(`2026-11-05 추가 검토: 서울시 원본 표고점 ${t.selected_points}개·등고선 ${t.selected_contours}개. 도로 중점 주변 100m 근거를 대조했으며 노면 경사값으로 승격하지 않았습니다.`)}info('경사 자료의 출처와 한계',lines.join('\n\n'));for(const [label,url] of [['서울시 표고점·등고선','https://data.seoul.go.kr/dataList/OA-22241/F/1/datasetView.do'],['Copernicus DSM·이용조건','https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM'],['Tilezen 자료·출처표시','https://github.com/tilezen/joerd/blob/master/docs/attribution.md']]){const a=textEl('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';$('#info-text').append(document.createElement('br'),a)}}

function updateRouteCallout(){
const r=routes[selected],panel=$('#route-callout');if(!r){panel.hidden=true;return}
// Keep disclosure state through redraws, but start a newly calculated trip compact.
const sameRoute=panel._route===r;panel.open=sameRoute&&panel.open;panel._route=r;
panel.hidden=false;panel.replaceChildren();
const heading=textEl('summary','','callout-heading'),title=r.accessReview?'육교 경유':r.assistancePreview?'대체 경로':r.comparison?'거리 중심 비교 경로':r.restStop?'쉬어 갈 곳을 연결했어요':'선택한 경로';
heading.title=title+' · 눌러서 상세 안내 펼치기/접기';
heading.append(textEl('b',title),textEl('span',`${Math.max(1,Math.ceil((r.totalLength||r.length)/r.p.speed))}분 · ${Math.round(r.totalLength||r.length)}m`));
const content=textEl('div','','callout-content');panel.append(heading,content);
if(r.restStop){content.append(textEl('p',r.restStop.name));const why=textEl('button','휴식 장소 근거 보기 ↗');why.type='button';why.onclick=()=>facilityController.focusFeature(r.restStop.id);content.append(why)}else content.append(textEl('p',r.comparison?'입력한 접근성 조건을 적용하지 않은 비교용입니다.':'등록 정보에 근거한 경로예요. 미확인 구간도 함께 확인하세요.'));
if(routes.length>1){const basic=routes.find(x=>x.comparison),delta=basic?Math.round((r.totalLength||r.length)-(basic.totalLength||basic.length)):0;if(delta>0&&!r.comparison)content.append(textEl('small',`거리 우선 경로보다 ${delta}m 더 이동해요.`))}
content.append(textEl('small','소요 시간은 입력 상태에 따른 추정 · 실시간 교통·시설 가동 정보 아님'));
}
function chooseDestination(key){if(!graph)return;let place;if(key==='school'){const reference=localDestinations.find(p=>p.name.toLowerCase()==='fortissimo');if(reference){try{const arrival=EndpointRouting.arrivalNear(graph,reference.ll);place={name:'서울사대부중 앞',ll:arrival.ll,type:'road_arrival',sourceUrl:'https://www.openstreetmap.org/node/'+reference.id,reference:{name:reference.name,ll:reference.ll,id:reference.id,gap:arrival.referenceGap},arrivalNotice:arrival.notice};}catch(e){toast(e.message);return}}else{toast('학교 앞 기준 장소 자료가 없어요. 지도에서 도착 위치를 지정해 주세요.');return}}else if(key==='library')place=localDestinations.find(p=>p.name==='월곡꿈그림도서관');else{const id=key==='triangle'?'review:wolgok-more:elevator-crosswalk-triangle':'review:wolgok-stop-kb-202606';const f=facilityFeatures.find(f=>f.id===id||f.properties.id===id);if(f)place={name:f.properties.name,ll:[f.geometry.coordinates[1],f.geometry.coordinates[0]],facilityId:f.id}}if(place)setDestination(place);else toast('장소 자료를 아직 준비하고 있어요.')}
$$('[data-destination]').forEach(b=>b.onclick=()=>chooseDestination(b.dataset.destination));
$('#mobile-map-jump').onclick=()=>{$('#live-map').scrollIntoView({behavior:'smooth',block:'start'});map?.invalidateSize()};
$('#demo-open').onclick=()=>$('#demo-dialog').showModal();
$$('[data-demo]').forEach(b=>b.onclick=()=>{if(!graph){toast('지도 준비가 끝나면 시연할 수 있어요.');return}resetTrip();setCondition(F.SCENARIOS[b.dataset.demo].text);$('#demo-dialog').close();$('#search').requestSubmit()});
$('#present-mode').onclick=()=>{if(!graph){toast('지도 준비가 끝나면 발표 모드를 사용할 수 있어요.');return}const on=document.body.classList.toggle('is-presenting');$('#present-mode').textContent=on?'입력 화면으로 ↙':'발표 모드 ↗';if(on){$('.facility-control').open=false;if(!routes.length){resetTrip();$('#search').requestSubmit()}}$('.sidebar').scrollTop=0;requestAnimationFrame(()=>{map?.invalidateSize();$('.sidebar').scrollTop=0;if(routes.length)drawRoutes(true)})};


// Mobile app shell shares the existing route engine, forms and storage.
let mobileMode='input',sheetSize='default',sheetDrag=null,sheetGestureUntil=0;
let sheetFrame=0,sheetGeometry=null,sheetRenderedHeight=null,sheetContentTouch=null;
function isMobileUI(){return matchMedia('(max-width:700px)').matches}
function measureSheetGeometry(){
 const height=window.visualViewport?.height||innerHeight;
 document.documentElement.style.setProperty('--app-height',Math.round(height)+'px');
 document.documentElement.style.setProperty('--app-top',Math.round(window.visualViewport?.offsetTop||0)+'px');
 const editing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
 document.body.classList.toggle('keyboard-open',editing&&innerHeight-height>100);
 const header=$('.header').getBoundingClientRect().height,nav=$('.mobile-tabs').getBoundingClientRect().height,available=height-header-nav;
 const max=Math.max(64,Math.floor(available-44)),clamp=n=>Math.max(64,Math.min(max,Math.round(n)));
 return {height,nav,mode:mobileMode,points:{collapsed:64,default:clamp(Math.min(mobileMode==='order'?255:mobileMode==='results'?400:480,available*(mobileMode==='order'?.36:mobileMode==='results'?.52:.59))),expanded:clamp(available-54)}};
}
function stopSheetFrame(){cancelAnimationFrame(sheetFrame);sheetFrame=0}
function paintSheetHeight(height){
 sheetRenderedHeight=height;
 document.documentElement.style.setProperty('--sheet-height',height.toFixed(2)+'px');
 document.documentElement.style.setProperty('--mobile-nav-height',sheetGeometry.nav+'px');
 document.documentElement.style.setProperty('--map-bottom-space',(height+sheetGeometry.nav).toFixed(2)+'px');
}
function settleSheetVisibility(){document.body.classList.toggle('sheet-is-collapsed',sheetSize==='collapsed');document.body.classList.remove('sheet-dragging')}
function abortSheetDrag(){const drag=sheetDrag;sheetDrag=null;if(drag?.capture?.hasPointerCapture(drag.id))drag.capture.releasePointerCapture(drag.id);sheetContentTouch=null;document.body.classList.remove('sheet-dragging')}
function syncMobileViewport(){
 if(!isMobileUI()){stopSheetFrame();abortSheetDrag();sheetGeometry=null;sheetRenderedHeight=null;document.documentElement.style.removeProperty('--app-height');document.body.classList.remove('keyboard-open','sheet-is-collapsed');return}
 const geometry=measureSheetGeometry(),changed=!sheetGeometry||geometry.height!==sheetGeometry.height||geometry.nav!==sheetGeometry.nav||geometry.mode!==sheetGeometry.mode;
 sheetGeometry=geometry;
 if(changed){stopSheetFrame();abortSheetDrag();paintSheetHeight(geometry.points[sheetSize]);settleSheetVisibility()}
 else if(!sheetDrag&&!sheetFrame){paintSheetHeight(geometry.points[sheetSize]);settleSheetVisibility()}
}
function animateSheetHeight(target,animate=true){
 stopSheetFrame();
 const start=sheetRenderedHeight??target;
 if(!animate||matchMedia('(prefers-reduced-motion:reduce)').matches||Math.abs(target-start)<.5){paintSheetHeight(target);settleSheetVisibility();return}
 // Keep contents visible throughout the collapse; only hide them once it lands.
 document.body.classList.remove('sheet-is-collapsed');
 const began=performance.now(),duration=Math.min(360,Math.max(200,Math.abs(target-start)*.65));
 function tick(now){const t=Math.min(1,(now-began)/duration),ease=1-Math.pow(1-t,3);paintSheetHeight(start+(target-start)*ease);if(t<1)sheetFrame=requestAnimationFrame(tick);else{sheetFrame=0;paintSheetHeight(target);settleSheetVisibility()}}
 sheetFrame=requestAnimationFrame(tick);
}
function setSheetSize(size,{animate=true}={}){
 abortSheetDrag();sheetSize=size;document.body.dataset.sheetSize=size;
 $('#sheet-toggle').setAttribute('aria-expanded',size!=='collapsed');
 $('#sheet-toggle-label').textContent=size==='collapsed'?'입력·결과 펼치기 ⌃':'지도 넓게 보기 ⌄';
 if(!isMobileUI())return;
 sheetGeometry=measureSheetGeometry();animateSheetHeight(sheetGeometry.points[size],animate);
}
function beginSheetDrag(id,y,time,capture=null){
 if(!isMobileUI())return;
 stopSheetFrame();sheetGeometry=measureSheetGeometry();
 const height=$('.sidebar').getBoundingClientRect().height;
 sheetDrag={id,startY:y,y,height,startSize:sheetSize,moved:false,samples:[{y,time}],capture};
 paintSheetHeight(height);
}
function moveSheetDrag(y,time){
 const drag=sheetDrag;if(!drag)return;
 drag.y=y;drag.moved ||= Math.abs(y-drag.startY)>5;
 drag.samples.push({y,time});drag.samples=drag.samples.filter(p=>time-p.time<100);
 if(!drag.moved)return;
 document.body.classList.add('sheet-dragging');document.body.classList.remove('sheet-is-collapsed');
 // One render per frame. No layout reads in the pointermove hot path.
 stopSheetFrame();sheetFrame=requestAnimationFrame(()=>{sheetFrame=0;if(sheetDrag)paintSheetHeight(Math.max(64,Math.min(sheetGeometry.points.expanded,drag.height+drag.startY-drag.y))) });
}
function finishSheetDrag(time,cancelled=false){
 const drag=sheetDrag;if(!drag)return;
 stopSheetFrame();const moved=drag.moved;
 if(moved)paintSheetHeight(Math.max(64,Math.min(sheetGeometry.points.expanded,drag.height+drag.startY-drag.y)));
 const current=sheetRenderedHeight,first=drag.samples[0],recent=time-drag.samples.at(-1).time<90;
 const elapsed=time-first.time,velocity=recent&&elapsed>0?(drag.y-first.y)/elapsed:0;
 const points=Object.entries(sheetGeometry.points),projected=current-Math.max(-2,Math.min(2,velocity))*150;
 let target=drag.startSize;
 if(moved&&!cancelled){target=points.reduce((best,p)=>Math.abs(p[1]-projected)<Math.abs(best[1]-projected)?p:best,points[0])[0]}
 abortSheetDrag();
 if(moved)sheetGestureUntil=Date.now()+300;
 if(moved||cancelled)setSheetSize(target);else settleSheetVisibility();
}
function setMobileMode(mode){
 mobileMode=mode;document.body.dataset.mobileMode=mode;
 $('#sheet-title').textContent=mode==='navigation'?'GPS 안내':mode==='order'?'이동 순서':mode==='results'?(travelMode==='transit'?'대중교통 참고 후보':'내 상태에 맞춘 경로'):mode==='saved'?'저장한 경로':'어디로 갈까요?';
 $('#mobile-back').hidden=mode==='input';
 $$('[data-mobile-tab]').forEach(b=>{const active=b.dataset.mobileTab===(mode==='saved'?'saved':'route');if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 if(isMobileUI()){$('#planner').hidden=mode==='saved';$('#saved-view').hidden=mode!=='saved';$('.intro').hidden=mode==='saved';setSheetSize('default');$('.sheet-scroll').scrollTop=0}
}
function fitMobileAware(bounds){
 if(!map)return;
 if(isMobileUI()){syncMobileViewport();const size=map.getSize(),bottom=Math.min(size.y-100,parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map-bottom-space'))+16||180);map.fitBounds(bounds,{paddingTopLeft:[24,55],paddingBottomRight:[24,bottom],maxZoom:18})}
 else map.fitBounds(bounds,{paddingTopLeft:[45,65],paddingBottomRight:[45,285],maxZoom:18});
}
function frameVisibleLocation(ll,zoom){if(!map)return;syncMobileViewport();const bottom=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--map-bottom-space'))||0;map.setView(map.unproject(map.project(ll,zoom).add([0,bottom/2]),zoom),zoom,{animate:false})}
function renderMobileRouteStatus(r,p){const status=$('#mobile-route-status');if(!status)return;status.classList.remove('is-risk');status.classList.toggle('is-reported',!!r.assistancePreview);status.textContent=routeSelection?.source==='unavailable'?'조건 미충족 · 검토용':((routeSelection?.source==='Gemini'?'Gemini 경로 비교':'알고리즘 선택')+' · '+routes.length+'개 후보');}

function renderMobileStage(){
 const stage=journeyStages[activeStage],box=$('#mobile-stage');if(!box)return;
 box.replaceChildren();if(stage)box.append(textEl('b',stage.title),textEl('p',stage.sub));
}
function configureMobileLayout(){
 for(const selector of ['.origin-settings','.order-all'])$$(selector).forEach(e=>e.open=!isMobileUI());for(const selector of ['.examples-disclosure','#route-evidence','.route-limits'])$$(selector).forEach(e=>e.open=false);
 if(isMobileUI()){document.body.classList.remove('is-presenting');$('#present-mode').textContent='발표 모드 ↗';setMobileMode($('#saved-view').hidden?(routes.length||transitResult||cityRoute?'results':'input'):'saved')}
 else{document.body.removeAttribute('data-mobile-mode');document.body.removeAttribute('data-sheet-size')}
 syncMobileViewport();map?.invalidateSize({pan:false});if(transitView?.hasData()){transitView.fit()}else if(routes.length){renderRoutes();if(isMobileUI()&&!$('.leaflet-popup'))fitMobileAware(L.latLngBounds([...routes[selected].coords,origin,destination.ll]))}
}
$('#sheet-toggle').onclick=()=>{if(Date.now()>=sheetGestureUntil)setSheetSize(sheetSize==='collapsed'?'default':'collapsed')};
const handle=$('#sheet-toggle');
handle.addEventListener('pointerdown',ev=>{if(!isMobileUI()||!ev.isPrimary||(ev.pointerType!=='touch'&&ev.button!==0))return;beginSheetDrag(ev.pointerId,ev.clientY,ev.timeStamp,handle);handle.setPointerCapture(ev.pointerId)});
handle.addEventListener('pointermove',ev=>{if(sheetDrag?.id===ev.pointerId)moveSheetDrag(ev.clientY,ev.timeStamp)});
handle.addEventListener('pointerup',ev=>{if(sheetDrag?.id===ev.pointerId){moveSheetDrag(ev.clientY,ev.timeStamp);finishSheetDrag(ev.timeStamp)}});
for(const event of ['pointercancel','lostpointercapture'])handle.addEventListener(event,ev=>{if(sheetDrag?.id===ev.pointerId)finishSheetDrag(ev.timeStamp,true)});
// The scroll body only yields to the sheet at its top boundary. Controls retain
// their native taps, text selection, keyboard input and inner scrolling.
const sheetScroll=$('.sheet-scroll');
sheetScroll.addEventListener('touchstart',ev=>{
 if(!isMobileUI()||ev.touches.length!==1||ev.target.closest('button,a,input,textarea,select,summary,[contenteditable]')){sheetContentTouch=null;return}
 const t=ev.touches[0];sheetContentTouch={id:t.identifier,x:t.clientX,y:t.clientY,time:ev.timeStamp,atTop:sheetScroll.scrollTop<=0,locked:false};
},{passive:true});
sheetScroll.addEventListener('touchmove',ev=>{
 const touch=sheetContentTouch;if(!touch)return;
 if(ev.touches.length!==1){if(touch.locked)finishSheetDrag(ev.timeStamp,true);sheetContentTouch=null;return}
 const t=ev.touches[0];if(t.identifier!==touch.id)return;
 const dy=t.clientY-touch.y,dx=t.clientX-touch.x;
 if(!touch.locked){
  if(!touch.atTop||Math.abs(dx)>Math.abs(dy)||Math.abs(dy)<8)return;
  if(dy<0&&sheetSize==='expanded')return;
  if(sheetScroll.scrollTop>0||!ev.cancelable)return;
  touch.locked=true;beginSheetDrag('content',touch.y,touch.time);
 }
 if(ev.cancelable)ev.preventDefault();sheetScroll.scrollTop=0;moveSheetDrag(t.clientY,ev.timeStamp);
},{passive:false});
sheetScroll.addEventListener('touchend',ev=>{if(sheetContentTouch?.locked){if(ev.cancelable)ev.preventDefault();finishSheetDrag(ev.timeStamp)}sheetContentTouch=null},{passive:false});
sheetScroll.addEventListener('touchcancel',ev=>{if(sheetContentTouch?.locked)finishSheetDrag(ev.timeStamp,true);sheetContentTouch=null},{passive:true});
handle.addEventListener('keydown',ev=>{if(!isMobileUI()||!['ArrowUp','ArrowDown','Home','End'].includes(ev.key))return;ev.preventDefault();const sizes=['collapsed','default','expanded'],index=sizes.indexOf(sheetSize);setSheetSize(ev.key==='Home'?'collapsed':ev.key==='End'?'expanded':sizes[Math.max(0,Math.min(2,index+(ev.key==='ArrowUp'?1:-1)))])});
matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',ev=>{if(ev.matches&&isMobileUI()){stopSheetFrame();abortSheetDrag();setSheetSize(sheetSize,{animate:false})}});
$('#mobile-back').onclick=()=>{if(mobileMode==='navigation'){navigationSession?.pause();setMobileMode('results');return}if(mobileMode==='order'){setMobileMode('results');if(routes[selected])fitMobileAware(L.latLngBounds(routes[selected].coords))}else setMobileMode('input')};
$('#mobile-edit').onclick=()=>setMobileMode('input');
$('#mobile-save').onclick=()=>$('#save-route').click();
$('#mobile-overview').onclick=()=>{setMobileMode('results');if(routes[selected])fitMobileAware(L.latLngBounds(routes[selected].coords))};
$('#mobile-detail').onclick=showDetails;
$$('[data-mobile-tab]').forEach(b=>b.onclick=()=>{const tab=b.dataset.mobileTab;if(tab==='report'){$('#report-open').click();return}if(tab==='saved'){renderSaved();setMobileMode('saved')}else setMobileMode(navigationSession&&!['ended','arrived'].includes(navigationSession.snapshot().phase)?'navigation':routes.length||transitResult||cityRoute?'results':'input')});
$('#mobile-more').onclick=()=>$('#mobile-menu').showModal();
for(const [source,target] of [['mobile-about','about'],['mobile-demo','demo-open'],['mobile-reset','school-reset']])$('#'+source).onclick=()=>{$('#mobile-menu').close();$('#'+target).click()};
$('#mobile-map-jump').onclick=()=>{if(isMobileUI())setSheetSize('collapsed');else $('#live-map').scrollIntoView({behavior:'smooth',block:'start'});map?.invalidateSize()};
$('#search').addEventListener('focusin',ev=>{if(isMobileUI()&&ev.target.matches('input,textarea,select')){setSheetSize('expanded');requestAnimationFrame(()=>ev.target.scrollIntoView({block:'nearest'}))}});
function visualViewportChanged(){syncMobileViewport();if(isMobileUI()&&document.activeElement?.matches('input,textarea,select'))requestAnimationFrame(()=>document.activeElement?.scrollIntoView({block:'nearest'}))}
window.visualViewport?.addEventListener('resize',visualViewportChanged);window.visualViewport?.addEventListener('scroll',syncMobileViewport);
window.addEventListener('resize',syncMobileViewport);
matchMedia('(max-width:700px)').addEventListener('change',configureMobileLayout);
document.addEventListener('focusout',()=>requestAnimationFrame(syncMobileViewport));
configureMobileLayout();
PortableAI.init({onChange:()=>{cancelAnalysis();autoAnalyzedText='';profile=null;analyzed='';invalidate()}});

// Session-owned GPS: no position sample is sent to AI or the local server.
let navigationSession=null,navigationView=null,replayTimer=null,replayProgress=0,replayTime=0,navVersion=0;
function endNavigation(){document.body.classList.remove('is-navigating');if(replayTimer!==null)clearInterval(replayTimer);replayTimer=null;navigationSession?.stop();navigationView?.destroy();navigationSession=null;navigationView=null;$('#navigation-panel').hidden=true}
function startNavigation(replay=false){
 const route=routes[selected];if(!route)return;
 route.connectionReview=endpointReview(route);if(route.connectionReview.needsGeometryReview&&!replay){toast('지도 경로 또는 연결이 건물 도형과 겹쳐요. 다시 계산하고 지도 위치를 확인해 주세요.');return}
 if((route.assistancePreview||route.selectionIneligible)&&!replay){toast('접근 연결의 현장 확인이 필요해요. 우선 경로 재생을 이용해 주세요.');return}
 if(!replay&&!window.isSecureContext){toast('실제 GPS 안내는 신뢰할 수 있는 HTTPS 또는 PC localhost에서 실행해 주세요.');return}
 stopLocationTracking();endNavigation();for(const d of $$('dialog[open]'))d.close();
 const plan=NavigationPlan.create(route,{origin,destination:{...destination},profile:route.p,version:++navVersion,graphHash:graph.meta.graphSha256});
 let displayedPlanVersion=plan.version;
 const session=NavigationSession.create(plan,{onUpdate:s=>{if(navigationSession===session){const currentPlan=session.getPlan();if(s.active&&currentPlan.version!==displayedPlanVersion){displayedPlanVersion=currentPlan.version;clearRouteSelection();routeSelection={source:'algorithm',selectedId:null,decision:null,summaries:[],createdAt:new Date().toISOString(),message:'현재 위치에서 다시 계산한 경로입니다. 이전 AI 선택 설명은 적용하지 않아요.'};routes=[{...currentPlan.route,label:'현재 위치에서 다시 찾은 경로',p:{...currentPlan.profile}}];selected=0;origin=currentPlan.origin.slice();originName='재탐색 시작 위치 · GPS';$('#origin-name').textContent=originName;placePin('origin',origin,originName);renderRoutes();drawRoutes(false)}if(!s.active)stopReplay();navigationView?.render(s,currentPlan)}},reroute:async(fix,profile,context)=>{
  await new Promise(resolve=>setTimeout(resolve,0));
  const next=NavigationRouting.fromFix(E,graph,fix,context.plan.destination,profile,{...context,previousLayer:session.snapshot().match?.layer||null});
  next.connectionReview=endpointReview(next,fix.ll,context.plan.destination.ll);if(next.connectionReview.needsGeometryReview)throw Error('정밀지도 건물과 겹치는 연결입니다. 진입 위치를 확인해 주세요.');
  if(navigationSession!==session)throw Error('old navigation session');
  return NavigationPlan.create(next,{origin:fix.ll,destination:context.plan.destination,profile,version:++navVersion,graphHash:graph.meta.graphSha256});
 }});
 navigationSession=session;
 navigationView=NavigationUI.create({map,container:$('#navigation-panel'),overlay:$('#live-guidance'),onPause:()=>{stopReplay();session.pause()},onResume:()=>session.resume(),onStop:()=>{endNavigation();if(isMobileUI())setMobileMode('results')},onReroute:()=>session.requestReroute(),onRest:a=>session.rest(a),onArrival:()=>session.confirmArrival(),onReplayNext:advanceReplay,onReplayAuto:toggleReplay,onFollow:ll=>{if(isMobileUI())frameVisibleLocation(ll,map.getZoom());else map.panTo(ll,{animate:false})}});
 document.body.classList.add('is-navigating');map.setView(plan.segments[0].a,18,{animate:false});replayProgress=0;replayTime=Date.now();if(isMobileUI())setMobileMode('navigation');else $('#navigation-panel').scrollIntoView({block:'start'});
 session.start({replay});if(replay)advanceReplay();
}
function stopReplay(){if(replayTimer!==null)clearInterval(replayTimer);replayTimer=null}
function advanceReplay(){
 const session=navigationSession;if(!session||!session.snapshot().active||session.snapshot().mode!=='replay')return;
 const plan=session.getPlan(),progress=Math.min(plan.length,replayProgress),s=plan.segments.find(s=>s.end>=progress)||plan.segments.at(-1),t=s.length?(progress-s.start)/s.length:0;
 replayTime+=5000;session.accept({latitude:s.a[0]+(s.b[0]-s.a[0])*t,longitude:s.a[1]+(s.b[1]-s.a[1])*t,accuracy:5,timestamp:replayTime,speed:1,heading:s.heading},replayTime);replayProgress+=5;
 if(progress>=plan.length){session.accept({latitude:s.b[0],longitude:s.b[1],accuracy:5,timestamp:replayTime+6000,speed:0},replayTime+6000);stopReplay()}
}
function toggleReplay(){if(replayTimer!==null)stopReplay();else{advanceReplay();replayTimer=setInterval(advanceReplay,500)}}
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopReplay();navigationSession?.hidden()}});

init();

function slopeDescription(e){if(e.approximateConnection)return '사용자 제보 연결 가설 · 승강기 문 위치·접근·운행 미확인 · 지형 경사 적용 안 함';const info=e.slopeScreening,actual=E.slopeOf(e);if(e.incline!=null)return 'OSM 등록 '+e.incline.toFixed(1)+'% · 현장 미검증';if(info?.kind==='structure_unresolved')return '구조물·계단 등 · 노면 고도 별도 확인 필요';if(info?.kind==='no_dem')return '고도 자료 범위 밖 또는 결측 · 경사 미확인';if(info&&Number.isFinite(info.maxPercent)){const value=Math.abs(info.maxPercent-info.minPercent)<.05?info.maxPercent.toFixed(1):info.minPercent.toFixed(1)+'~'+info.maxPercent.toFixed(1);return (info.kind==='source_range'?'자료 간 참고 범위 ':info.kind==='neighborhood_proxy'?'주변 지형 60m 방향 추정 ':'Tilezen 도로 창 참고 추정 ')+value+'% · 노면 실측 아님'}return actual!=null?'참고 추정 '+actual.toFixed(1)+'% · 노면 미검증':'경사 자료 없음 · 현장 확인 필요'}
function renderSlopeCoverage(panel,r){const stats=r.screeningMeters;if(!stats)return;const upper=r.edges.map(E.screeningGrade).filter(Number.isFinite);if(upper.length)panel.append(textEl('p',`참고 자료 범위 상단 최대 ${Math.max(...upper).toFixed(1)}% · 실측 최대 경사 아님`));panel.append(textEl('p',`전체 ${r.edges.length}구간 검토 · 참고값 ${Math.round(stats.estimated)}m · 자료 차이 범위 ${Math.round(stats.range)}m · 구조물 ${Math.round(stats.structure)}m · 고도 결측 ${Math.round(stats.missing)}m`));if(r.accessReview){panel.append(textEl('p','이용 경험·양쪽 승강기 존재 제보를 반영한 경로입니다. 접근 좌표는 연결 가설이며, 지형 추정과 실제 노면의 차이를 확인해야 합니다.'));}else if(r.assistancePreview){panel.append(textEl('p',`노면 미확인 통과량을 먼저 줄인 뒤 최대 참고 경사를 최소화해 탐색 · 선택 상단 ${r.assistanceCeiling?.toFixed(1)??'미확인'}% · 안전 기준 충족 아님`));panel.append(textEl('strong','위험 구간이 남아 있어 이동 지원과 현장 동선 확인이 필요합니다.'));}const detail=textEl('details','','slope-coverage'),summary=textEl('summary','구간별 경사와 주의점 모두 보기');detail.append(summary);const list=textEl('ol','','slope-segments');r.edges.forEach((e,i)=>{const item=textEl('li','');item.append(textEl('b',`${i+1}. ${e.name} · ${Math.round(e.d)}m`),textEl('span',slopeDescription(e)),textEl('small',TerrainEvidence.describe(graph,e)));const button=textEl('button','지도에서 보기');button.type='button';button.onclick=()=>{if(isMobileUI())setSheetSize('collapsed');fitMobileAware(L.latLngBounds([r.coords[i],r.coords[i+1]]));if(innerWidth<=700)$('#live-map').scrollIntoView({behavior:'smooth',block:'center'})};item.append(button);list.append(item)});detail.append(list);detail.append(textEl('small',`출발 연결 ${Math.round(r.gaps[0])}m·도착 연결 ${Math.round(r.gaps[1])}m는 내장 도로망 밖 연결이며 노면 경사·진입 미검증입니다.`));panel.append(detail)}
$('#luna-origin').onclick=()=>{if(!graph)return;setOrigin([37.5995513,127.0412035],'루나밸리 서측 경계 · 시연 기준점');$('#location-status').textContent='단지 경계 기준점 · 실제 출입구 미확인';map.setView(origin,18)};

function slopeGroupDescription(s){const edges=s.slopeEvidenceEdges||[],values=edges.map(E.screeningGrade).filter(Number.isFinite),kinds=new Set(edges.map(e=>e.slopeScreening?.kind));const notes=[];if(values.length)notes.push('참고 자료 범위 상단 최대 '+Math.max(...values).toFixed(1)+'% · 실측 아님');if(kinds.has('source_range'))notes.push('자료 차이 포함');if(kinds.has('structure_unresolved'))notes.push('구조물 노면 미확인 포함');if(kinds.has('no_dem'))notes.push('고도 결측 포함');return notes.join(' · ')||'전체 구간 목록의 근거를 확인해 주세요.'}
