(function(root){'use strict';
function create(map,{onOpen=()=>{}}={}){
 const L=root.L,doc=document,control=L.control({position:'topleft'}),box=doc.createElement('details');box.className='map-layers-control';
 const summary=doc.createElement('summary');summary.textContent='시설·지도';box.append(summary);
 const body=doc.createElement('div');body.className='map-layers-body';box.append(body);
 const tabs=doc.createElement('div');tabs.className='map-layer-tabs';tabs.role='tablist';tabs.setAttribute('aria-label','지도 표시');body.append(tabs);
 const originals=[doc.querySelector('.facility-control'),doc.querySelector('.precision-control')];
 const panels=[],buttons=[];let active=0;
 for(const [i,name] of ['시설','경사','지도 자료'].entries()){
  const button=doc.createElement('button');button.type='button';button.role='tab';button.id='map-layer-tab-'+i;button.textContent=name;button.setAttribute('aria-controls','map-layer-panel-'+i);tabs.append(button);buttons.push(button);
  const panel=doc.createElement('div');panel.id='map-layer-panel-'+i;panel.role='tabpanel';panel.setAttribute('aria-labelledby',button.id);body.append(panel);panels.push(panel);
  button.onclick=()=>select(i);button.onkeydown=e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();select(e.key==='Home'?0:e.key==='End'?2:(active+(e.key==='ArrowRight'?1:2))%3);buttons[active].focus()}};
 }
 panels[0].append(originals[0]);panels[2].append(originals[1]);
 function sync(){panels.forEach((p,i)=>{p.hidden=i!==active;buttons[i].setAttribute('aria-selected',String(i===active));buttons[i].tabIndex=i===active?0:-1});originals[0].open=box.open&&active===0;originals[1].open=box.open&&active===2;}
 function select(i){active=i;sync()}
 box.addEventListener('toggle',()=>{sync();if(box.open)onOpen()});
 originals.forEach((child,j)=>child.addEventListener('toggle',()=>{if(!child.open&&box.open&&active===(j===0?0:2))box.open=false}));
 const slope = panels[1];
 const label = doc.createElement('label');
 label.className = 'map-slope-toggle';
 const enabled = doc.createElement('input');
 enabled.type = 'checkbox';
 enabled.id = 'slope-steep';
 label.append(enabled, doc.createTextNode('급경사 표시'));
 const legend = doc.createElement('p');
 legend.className = 'map-slope-key';
 legend.textContent = '10% 이상';
 const status = doc.createElement('p');
 status.className = 'map-slope-status';
 status.role = 'status';
 const note = doc.createElement('p');
 note.className = 'map-slope-note';
 note.textContent = '등록값과 약 30m 해상도의 지형 자료를 사용해요. 지도에서 표시되지 않은 길의 경사는 확인이 필요해요.';
 const source = doc.createElement('details');
 source.className = 'map-slope-note';
 const sourceTitle = doc.createElement('summary');
 sourceTitle.textContent = '자료 출처';
 const credit = doc.createElement('p');
 const attribution = doc.createElement('a');
 attribution.href = 'https://registry.opendata.aws/copernicus-dem/';
 attribution.textContent = 'Copernicus DEM GLO-30';
 attribution.target = '_blank';
 attribution.rel = 'noopener noreferrer';
 const osm = doc.createElement('a');
 osm.href = 'https://www.openstreetmap.org/copyright';
 osm.target = '_blank';
 osm.rel = 'noopener noreferrer';
 osm.textContent = '© OpenStreetMap contributors (ODbL)';
 const license = doc.createElement('p');
 license.textContent = 'Copernicus 프로그램 운영 기관은 이 자료의 이용에 책임을 지지 않습니다.';
 source.append(sourceTitle, attribution, credit, license, osm);
 const retry = doc.createElement('button');
 retry.type = 'button';
 retry.textContent = '다시 불러오기';
 retry.hidden = true;
 slope.append(label, legend, status, retry, note, source);

 const minZoom = 14;
 map.createPane('slope-review');
 const pane = map.getPane('slope-review');
 pane.style.zIndex = '380';
 pane.style.pointerEvents = 'none';
 const renderer = L.canvas({pane: 'slope-review'});
 const lines = L.polyline([], {
  pane: 'slope-review', renderer, interactive: false,
  color: '#cd3e3e', opacity: .82, weight: 3.5, smoothFactor: 0,
 });
 let data = null;
 let loading = false;
 let failed = false;
 let disposed = false;
 let visible = 0;

 async function load() {
  if (data || loading || disposed) return;
  loading = true;
  failed = false;
  render();
  try {
   const loaded = JSON.parse(await root.DONGHAENG_LOAD_DATA('bundled-seoul-slopes'));
   if (loaded.schema !== 'steep-roads-v1' || loaded.metadata?.display_only !== true ||
       loaded.metadata.field_verified !== false || loaded.metadata.routing_eligible !== false ||
       loaded.metadata.threshold_percent !== 10 || !Array.isArray(loaded.segments)) {
    throw new Error('경사 자료 형식이 다릅니다.');
   }
   data = loaded;
   credit.textContent = data.metadata.attribution;
  } catch {
   failed = true;
  } finally {
   loading = false;
   render();
  }
 }

 function render() {
  if (disposed) return;
  visible = 0;
  retry.hidden = !enabled.checked || !failed;
  status.hidden = !enabled.checked;
  const zoomed = map.getZoom() >= minZoom;
  if (!enabled.checked || !data || !zoomed) {
   lines.remove();
  } else {
   const bounds = map.getBounds().pad(.05);
   const west = bounds.getWest(), east = bounds.getEast();
   const south = bounds.getSouth(), north = bounds.getNorth();
   const paths = [];
   for (const [lonA, latA, lonB, latB, grade] of data.segments) {
    if (grade < 10 || Math.max(lonA, lonB) < west || Math.min(lonA, lonB) > east ||
        Math.max(latA, latB) < south || Math.min(latA, latB) > north) continue;
    paths.push([[latA, lonA], [latB, lonB]]);
   }
   visible = paths.length;
   lines.setLatLngs(paths);
   if (visible && !map.hasLayer(lines)) lines.addTo(map);
   if (!visible) lines.remove();
  }
  status.textContent = loading ? '경사 자료를 불러오는 중…' :
   failed ? '경사 자료를 불러오지 못했어요.' :
   !zoomed ? '지도를 확대하면 급경사가 표시돼요.' :
   !visible ? '이 화면에 표시할 급경사 자료가 없어요.' : '';
  status.hidden = !enabled.checked || !status.textContent;
 }

 enabled.addEventListener('change', () => {
  if (enabled.checked && !data) load();
  else render();
 });
 retry.addEventListener('click', load);
 map.on('moveend', render);
 control.onAdd = () => {
  L.DomEvent.disableClickPropagation(box);
  L.DomEvent.disableScrollPropagation(box);
  return box;
 };
 control.addTo(map);
 sync();
 render();
 return {
  open(tab = 0) { box.open = true; select(tab); },
  snapshot: () => ({tab: active, open: box.open, loaded: !!data, count: data?.segments.length || 0, visible}),
  destroy() {
   disposed = true;
   map.off('moveend', render);
   lines.remove();
   if (map.hasLayer(renderer)) renderer.remove();
   control.remove();
  },
 };
}
root.MapLayers={create};
})(globalThis);
