(function(root){'use strict';
function create({map,container,onPause,onResume,onStop,onReroute,onRest,onArrival,onReplayNext,onReplayAuto,onFollow}){
 const L=root.L,layer=L.layerGroup().addTo(map);let follow=true,rawMarker=null,accuracy=null,position=null,lastProgress=-1,routeVersion=null;
 const status=document.createElement('div');status.className='navigation-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const badge=document.createElement('small'),title=document.createElement('b'),detail=document.createElement('p'),next=document.createElement('p'),summary=document.createElement('p'),buttons=document.createElement('div');buttons.className='navigation-actions';container.replaceChildren(badge,status,summary,buttons);status.append(title,detail,next);
 function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;buttons.append(b);return b}
 const pause=button('일시정지',onPause),resume=button('다시 시작',onResume),reroute=button('현재 위치에서 다시 찾기',onReroute),rest=button('여기서 쉬기',()=>onRest('start')),skip=button('지나가기',()=>onRest('skip')),unavailable=button('휴식 장소 이용 어려움',()=>onRest('unavailable')),restResume=button('이동 재개',()=>onRest('resume')),arrival=button('도착 확인',onArrival),followButton=button('현재 위치로',()=>{follow=true;if(position)onFollow(position)}),step=button('모의 위치 한 칸 진행',onReplayNext),play=button('GPS 재생 시작/정지',onReplayAuto),stop=button('안내 종료',onStop);
 function manualMap(){follow=false;followButton.hidden=false}map.on('dragstart zoomstart',manualMap);
 function render(s,plan){
  container.hidden=false;badge.textContent=s.mode==='replay'?'모의 GPS 재생 · 실제 위치 아님':'GPS 기술 시연 · 현장 통행 미검증';
  const messages={idle:'안내 준비',waiting:'새 GPS 위치 확인 중',paused:'안내 일시정지',hidden:'화면이 숨겨져 안내가 중지됐어요. 새 위치로 다시 시작하세요.',denied:'위치 권한이 거부됐어요. 브라우저 설정을 확인해 주세요.',timeout:'위치 수신 시간이 초과됐어요.',unavailable:'GPS 위치를 확인하지 못했어요.',unsupported:'이 브라우저에서는 위치 확인을 사용할 수 없어요.',blocked:'위험 대안은 독립 이동 안내로 시작할 수 없어요. 경로 재생을 이용하세요.',rerouting:'같은 이동 조건으로 다시 찾는 중', 'reroute-failed':'연결 가능한 대체 경로를 찾지 못했어요. 이동 조건을 완화하지 않았습니다.',ended:'안내 종료',arrived:'사용자가 도착을 확인했습니다.'};
  title.textContent=messages[s.phase]||s.message||'위치를 확인하고 있어요.';
  const good=['navigating','connection-check','rest-near','resting','arrival-near'].includes(s.phase);
  detail.textContent=s.fix?`위치 정확도 약 ${Math.round(s.fix.accuracy)}m · ${s.phase==='offroute'||s.phase==='offroute-suspect'?`경로에서 약 ${Math.round(s.crossTrack||0)}m`:s.phase==='ambiguous'?'경로 후보 미확정':'위치 갱신 상태 확인'}`:'위치 데이터는 서버에 보내지 않습니다.';
  next.textContent=good&&s.event?`${s.event.name} · 다음 구간까지 약 ${Math.round(s.distanceToEvent||0)}m`:'구간·층위를 확정할 수 없을 때는 자동 진행을 보류합니다.';
  summary.textContent=`도로상 남은 거리 약 ${Math.round(s.remaining)}m · 약 ${Math.max(1,Math.ceil(s.remaining/(plan.profile.speed||65)))}분 (추정) / 출발 연결 ${Math.round(plan.gaps[0]||0)}m·도착 연결 ${Math.round(plan.gaps[1]||0)}m는 별도 미검증${plan.rest?' / 휴식 연결 별도 확인':''}${s.restOutcome==='completed'?' · 휴식 완료 확인':s.restOutcome==='skipped'?' · 휴식 지나침(완료 아님)':''}`;
  pause.hidden=!s.active;resume.hidden=s.active||['ended','arrived','blocked','unsupported'].includes(s.phase);stop.hidden=['ended','arrived'].includes(s.phase);
  reroute.hidden=!s.active||s.mode==='replay'||!['offroute','offroute-suspect','reroute-failed','waiting'].includes(s.phase);reroute.disabled=s.rerouting;
  rest.hidden=skip.hidden=unavailable.hidden=s.phase!=='rest-near';restResume.hidden=s.phase!=='resting';arrival.hidden=s.phase!=='arrival-near';step.hidden=play.hidden=s.mode!=='replay'||!s.active;followButton.hidden=follow||!position;
  if(s.fix){position=s.fix.ll;if(!rawMarker){rawMarker=L.circleMarker(position,{radius:8,color:'white',weight:3,fillColor:'#287ac4',fillOpacity:1}).addTo(layer);accuracy=L.circle(position,{radius:s.fix.accuracy,color:'#287ac4',weight:1,fillOpacity:.06,interactive:false}).addTo(layer)}rawMarker.setLatLng(position);accuracy.setLatLng(position).setRadius(s.fix.accuracy)}
  if(s.match&&good&&(Math.abs(s.progress-lastProgress)>3||routeVersion!==plan.version)){
   layer.getLayers().filter(l=>l.options?.navigationProgress).forEach(l=>layer.removeLayer(l));
   const i=s.match.index;L.polyline([...plan.segments.slice(0,i).map(x=>x.a),plan.segments[i].a,s.match.ll],{color:'#9ba8a1',weight:7,opacity:.8,interactive:false,navigationProgress:true}).addTo(layer);lastProgress=s.progress;routeVersion=plan.version;
  }
  if(s.fix&&good&&follow){onFollow(position);follow=true;followButton.hidden=true}
 }
 return {render,destroy(){map.off('dragstart zoomstart',manualMap);layer.remove();container.replaceChildren();container.hidden=true}};
}
root.NavigationUI={create};
})(typeof globalThis==='undefined'?this:globalThis);
