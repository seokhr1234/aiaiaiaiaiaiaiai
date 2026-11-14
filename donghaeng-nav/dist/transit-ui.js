(function(root){'use strict';
const names={walk:'도보',bus:'버스',subway:'지하철'},point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const finite=v=>Number.isFinite(v)&&v>=0&&v<=10000000;
function validate(data,expected={}){
 if(data?.schema!=='donghaeng-transit-v1'||data.fieldVerified!==false||!['review_only','no_provider_candidate'].includes(data.state)||!Array.isArray(data.candidates)||data.candidates.length>100)throw Error('대중교통 결과 형식을 확인하지 못했어요.');
 if(data.state==='no_provider_candidate'&&data.candidates.length||data.state==='review_only'&&!data.candidates.length)throw Error('대중교통 결과 상태를 확인하지 못했어요.');
 const seen=new Set();for(const c of data.candidates){
  if(!/^T\d{1,3}$/.test(c.id)||seen.has(c.id)||c.state!=='review_only'||c.fieldVerified!==false||c.timeFeasibility!=='unknown'||!Array.isArray(c.legs)||!c.legs.length||c.legs.length>60)throw Error('대중교통 후보의 검토 상태를 확인하지 못했어요.');seen.add(c.id);
  for(const key of ['wheelchair','avoidSteps','avoidSlope','rest','restKind','restMinutes','maxSlope'])if(expected[key]!==undefined&&c.profile?.[key]!==expected[key])throw Error('대중교통 후보의 이동 조건이 바뀌었어요. 다시 검색해 주세요.');
  for(const key of ['providerTotalMinutes','fareWon'])if(c[key]!=null&&!finite(c[key]))throw Error('대중교통 예상 시간·요금 형식을 확인하지 못했어요.');
  for(const l of c.legs){if(!names[l.mode]||!point(l.from)||!point(l.to)||!finite(l.providerMinutes)||!Array.isArray(l.lines)||l.lines.length>20||l.lines.some(x=>x.name!=null&&typeof x.name!=='string'))throw Error('승하차 위치·노선 정보를 확인하지 못했어요.');if(l.stationCount!=null&&(!finite(l.stationCount)||!Number.isInteger(l.stationCount)))throw Error('정차 정보를 확인하지 못했어요.')}
  if(!c.legs.some(l=>l.mode!=='walk'))throw Error('대중교통 구간이 없는 후보입니다.');
 }return data;
}
function toApiProfile(profile){const keys=['wheelchair','avoidSteps','avoidSlope','rest','short','recognized','raw','source','restKind','restMinutes','maxSlope','speed'];return Object.fromEntries(keys.filter(key=>profile[key]!==undefined).map(key=>[key,profile[key]]))}
function lineName(leg){const labels=leg.lines.map(l=>l.name).filter(Boolean);return labels.length?labels.join(' / '):names[leg.mode]+' 노선명 미확인'}
function summary(c){const vehicles=c.legs.filter(l=>l.mode!=='walk'),walk=c.legs.filter(l=>l.mode==='walk').reduce((n,l)=>n+l.providerMinutes,0);return {minutes:c.providerTotalMinutes,walkMinutes:walk,transfers:Math.max(0,vehicles.length-1),lines:vehicles.map(lineName),fare:c.fareWon??null}}
function observedTime(value){const at=Date.parse(value);return Number.isFinite(at)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(at):'미확인'}
function create({map,container,fitBounds,onSelect=()=>{}}){
 const L=root.L,doc=container.ownerDocument,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n},layer=L.layerGroup().addTo(map);let active=false,result=null,selectedId=null,refs=[];
 if(!map.getPane('transit-references'))map.createPane('transit-references').style.zIndex='680';
 function clear(){layer.clearLayers();refs=[];result=null;selectedId=null;if(active)container.replaceChildren();active=false}
 function fit(){if(refs.length)fitBounds(L.latLngBounds(refs))}
 function sourcePoints(candidate){
  layer.clearLayers();refs=[];const groups=new Map();
  candidate.legs.forEach((leg,index)=>{if(leg.mode==='walk')return;for(const [role,ll,name,id] of [['승차',leg.from,leg.fromName,leg.fromId],['하차',leg.to,leg.toName,leg.toId]]){const key=ll.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push({role,ll,name,id,index,mode:leg.mode,line:lineName(leg)})}});
  const markers=new Map();for(const [key,items] of groups){const first=items[0],label=items.length>1?String(items.length):first.role==='승차'?'승':'하',icon=L.divIcon({className:'transit-stop transit-'+first.mode,html:'<span>'+label+'</span>',iconSize:[32,32],iconAnchor:[16,16]});const marker=L.marker(first.ll,{pane:'transit-references',icon,keyboard:true,bubblingMouseEvents:false,title:items.map(i=>names[i.mode]+' '+i.role+' · '+(i.name||'이름 미등록')).join(' / ')}).addTo(layer).bindPopup(()=>{const box=el('section');box.append(el('b','업체 승하차 참고 위치'),el('p','실제 출입구·보도 편·층위 연결은 미확인입니다.'));for(const item of items)box.append(el('p',(item.index+1)+'. '+item.line+' '+item.role+' · '+(item.name||'이름 미등록')),el('p','업체 지점 ID: '+(item.id??'미등록')));if(items.length>1)box.append(el('p','같은 표시 좌표의 기록을 묶었습니다. 실제 환승 연결을 확인한 것은 아닙니다.'));return box});markers.set(key,marker);refs.push(first.ll)}return markers;
 }
 function select(id,{fitMap=true,focus=false}={}){
  const c=result.candidates.find(c=>c.id===id);if(!c)return;selectedId=id;const markers=sourcePoints(c);renderCards(markers);if(fitMap)fit();if(focus)container.querySelector('[data-candidate-id="'+id+'"]')?.focus({preventScroll:true});onSelect(c);
 }
 function renderCards(markers){
  container.replaceChildren();const note=el('p','대중교통 참고 후보입니다. 실제 안내 시작 불가 · 요청한 계단·경사·휠체어·휴식 조건과 출입구·역내 이동·환승 시각은 아직 검증되지 않았어요.','transit-reference-note');container.append(note);
  container.append(el('p','지도에는 선택한 후보의 승하차 참고점만 표시합니다. 이동 경로선과 도보 연결은 아직 확인되지 않았어요.','gap-note'));
  if(result.rejected>0)container.append(el('p','위치·구간 정보를 확인할 수 없는 일부 후보는 표시에서 제외했습니다.','gap-note'));
  if(result.candidates.length>5)container.append(el('p','업체가 반환한 순서의 첫 5개 후보를 표시합니다.','gap-note'));
  for(const c of result.candidates.slice(0,5)){
   const chosen=c.id===selectedId,s=summary(c),card=el('article',null,'route-card transit-card'+(chosen?' selected':'')),choose=el('button',null,'transit-candidate secondary');choose.type='button';choose.dataset.candidateId=c.id;choose.setAttribute('aria-pressed',String(chosen));choose.append(el('b','참고 후보 '+c.id),el('span',(s.minutes==null?'총 예상시간 미확인':s.minutes+'분 · 업체 예상')+' · 환승 '+s.transfers+'회'),el('span',s.lines.join(' → ')));choose.onclick=()=>select(c.id,{focus:true});card.append(choose,el('p','도보 약 '+s.walkMinutes+'분 · '+(s.fare==null?'요금 미확인':s.fare.toLocaleString('ko-KR')+'원 · 업체 참고 요금'),'transit-meta'));
   if(chosen){const list=el('ol',null,'transit-legs');c.legs.forEach((leg,index)=>{
    const item=el('li',null,'transit-leg transit-leg-'+leg.mode);if(leg.mode==='walk')item.append(el('b','도보 · 업체 예상 '+leg.providerMinutes+'분'),el('p','실제 보행 동선·턱·경사·휴식 접속은 미확인입니다.','gap-note'));
    else {item.append(el('b',lineName(leg)+' · '+names[leg.mode]),el('p',(leg.fromName||'승차 지점명 미확인')+' → '+(leg.toName||'하차 지점명 미확인')),el('p','업체 예상 '+leg.providerMinutes+'분'+(leg.stationCount==null?' · 정차 정보 미확인':' · 정차 수 '+leg.stationCount+'(업체)')));const show=el('button','승하차 참고점 보기','secondary transit-reference-button');show.type='button';show.onclick=()=>{fitBounds(L.latLngBounds([leg.from,leg.to]));markers.get(leg.from.join(','))?.openPopup()};item.append(show)}list.append(item)});card.append(list,el('p','조회 시각(한국): '+observedTime(result.observedAt)+' · 실제 운행편·막차·현재 승강기 상태는 확인되지 않았어요.','gap-note'))}
   container.append(card);
  }
 }
 return {show(data,profile){validate(data,profile);clear();result=data;active=true;if(!data.candidates.length){container.append(el('p','제공업체에서 참고 후보를 받지 못했어요. 다른 출발·도착 위치로 확인해 주세요.','empty-note'));return}select(data.candidates[0].id)},clear,fit,hasData:()=>active,selected:()=>selectedId,destroy(){clear();layer.remove()}};
}
const api={validate,toApiProfile,summary,lineName,observedTime,create};if(typeof module!=='undefined')module.exports=api;else root.TransitUI=api;
})(typeof globalThis==='undefined'?this:globalThis);
