"""Build an offline evidence viewer from the existing OSM snapshot; no network."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[3]
DIST = PROJECT / 'donghaeng-nav' / 'dist'
evidence = json.loads((HERE.parent / 'crosscheck/local-evidence.geojson').read_text())
snapshot = json.loads((DIST / 'map-data.json').read_text())
nodes = {e['id']: [e['lon'], e['lat']] for e in snapshot['elements'] if e['type'] == 'node'}
roads = []
for element in snapshot['elements']:
    if element['type'] != 'way' or not element.get('tags', {}).get('highway'):
        continue
    coords = [nodes[n] for n in element.get('nodes', []) if n in nodes]
    if len(coords) >= 2:
        roads.append(coords)

template = r'''<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>동행길 · 접근성 근거 검토 지도</title>
<style>__LEAFLET_CSS__</style>
<style>
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,sans-serif;color:#203039}
header{padding:16px 22px;border-bottom:1px solid #d4ddd9;background:#fff}h1{margin:0;font-size:21px}
header p{margin:5px 0 0;color:#52636a;font-size:13px}main{display:grid;grid-template-columns:310px 1fr;height:calc(100vh - 112px);min-height:500px}
aside{padding:18px;overflow:auto;background:#f6f8f7}#map{background:#eef1ec}label{display:block;padding:6px 0}input{margin-right:8px}
button,select{font:inherit;padding:7px;width:100%;margin:7px 0}button{background:white;border:1px solid #abbdb4;border-radius:5px;cursor:pointer}
.key{display:inline-block;width:25px;height:4px;vertical-align:middle;margin-right:6px}.note{font-size:12px;color:#536369}pre{max-width:320px;max-height:260px;overflow:auto;font-size:11px;white-space:pre-wrap}
.leaflet-popup-content{max-width:340px}.status{padding:10px;background:#fff4dc;border-left:3px solid #b77b1e;font-size:13px}
@media(max-width:700px){main{grid-template-columns:1fr;height:auto}aside{max-height:270px}#map{height:65vh;min-height:420px}header{padding:12px}}
</style>
<header><h1>동행길 · 접근성 근거 검토 지도</h1><p>2차 조사 · 기존 OSM 저장본 2026-10-28 · 새 현장 측정값 없음 · 인터넷 연결 없이 열람</p></header>
<main><aside><div class="status">이 지도는 조사 대상의 위치를 검토합니다. 색은 근거 종류를 뜻하며 통행 가능 등급이 아닙니다.</div>
<div id="controls"></div><button id="fit">두 경로 전체 보기</button>
<label for="object">원본 객체 찾아보기</label><select id="object"><option value="">선택하세요</option></select>
<p class="note">경로는 실제 사용한 부분 간선만 표시합니다. 원본 way는 일부만 지나가더라도 전체 선형을 표시하므로 별도 선택해 비교하세요.</p>
<p class="note">회색 배경선: 저장된 도로 원본. 보도와 차도 분리, 턱, 출입 허가, 현재 공사 상태는 검증되지 않았습니다.</p>
<p class="note">출처: © OpenStreetMap contributors, ODbL 1.0. Leaflet BSD-2-Clause 라이선스는 저장소 donghaeng-nav/dist/LEAFLET-LICENSE.txt에 있습니다.</p>
<p class="note">재생성: python3 research/accessibility/round2/integration/build-review-map.py</p>
</aside><div id="map" aria-label="접근성 근거 검토 지도"></div></main>
<script>__LEAFLET_JS__</script><script>
'use strict';
const evidence=__EVIDENCE__, roads=__ROADS__;
const map=L.map('map',{preferCanvas:true}).setView([37.596,127.040],17);
map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · ODbL 1.0 · 저장본');
const groups={};
function group(key,label,color,enabled=true){const layer=L.layerGroup();if(enabled)layer.addTo(map);groups[key]={layer,label,color};return layer;}
group('base','저장된 배경 도로','#c9d0cb');group('school','학교 경계','#798878');
group('shortest','거리 우선 경로 · 약 674m','#16829b');group('benchRoute','벤치 경유 경로 · 약 958m','#5d61bd');
group('structures','교량·지하 구간 · 원본 way 전체','#b06030');group('sources','경로의 원본 way 전체','#7e8589',false);
group('connections','미검증 직선 연결','#c94b62');group('points','정류장·벤치','#564838');
const renderer=L.canvas({padding:.5});
for(const coords of roads)L.polyline(coords.map(c=>[c[1],c[0]]),{renderer,color:'#c9d0cb',weight:1,opacity:.65,interactive:false}).addTo(groups.base.layer);
const lookup=[];const bounds=L.latLngBounds([]);
function popup(f){const box=document.createElement('div'),title=document.createElement('b');title.textContent=f.properties.tags?.name||f.properties.name||f.properties.kind;box.append(title);const pre=document.createElement('pre');pre.textContent=JSON.stringify(f.properties,null,2);box.append(pre);if(f.properties.osm_id){const a=document.createElement('a');a.textContent='OSM 원본 열기 (인터넷 필요)';a.href='https://www.openstreetmap.org/'+(f.properties.osm_type||'way')+'/'+f.properties.osm_id;a.target='_blank';a.rel='noopener noreferrer';box.append(a)}return box}
for(const f of evidence.features){const p=f.properties,t=p.tags||{};let key='points';if(p.kind==='school_boundary')key='school';else if(p.kind==='calculated_route')key=p.name==='shortest'?'shortest':'benchRoute';else if(p.kind.includes('snap'))key='connections';else if(p.kind==='route_source_way')key=(t.bridge==='yes'||t.tunnel==='yes')?'structures':'sources';
 const color=groups[key].color;const layer=L.geoJSON(f,{style:{color,weight:key==='connections'?3:key==='structures'?6:key==='sources'?3:4,opacity:key==='structures'?.65:.9,fillOpacity:.06,dashArray:key==='connections'?'5 6':null},pointToLayer:(_,ll)=>L.circleMarker(ll,{radius:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1})}).bindPopup(()=>popup(f));layer.addTo(groups[key].layer);
 if(p.kind==='calculated_route')bounds.extend(layer.getBounds());
 const name=(t.name||p.name||p.kind)+(p.osm_id?' · '+p.osm_id:'');lookup.push({layer,key,name});
}
for(const [key,g] of Object.entries(groups)){const label=document.createElement('label'),check=document.createElement('input'),span=document.createElement('span');check.type='checkbox';check.checked=map.hasLayer(g.layer);check.onchange=()=>check.checked?g.layer.addTo(map):map.removeLayer(g.layer);span.className='key';span.style.background=g.color;label.append(check,span,document.createTextNode(g.label));document.getElementById('controls').append(label);g.check=check;}
const select=document.getElementById('object');lookup.forEach((entry,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=entry.name;select.append(option)});
select.onchange=()=>{if(select.value==='')return;const item=lookup[Number(select.value)],g=groups[item.key];g.layer.addTo(map);g.check.checked=true;const b=item.layer.getBounds();if(b.isValid())map.fitBounds(b.pad(.2),{maxZoom:19});item.layer.eachLayer(l=>l.openPopup());};
document.getElementById('fit').onclick=()=>map.fitBounds(bounds.pad(.2));map.fitBounds(bounds.pad(.2));
</script></html>'''

def embedded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')

html = template.replace('__LEAFLET_CSS__', (DIST/'leaflet.css').read_text())
html = html.replace('__LEAFLET_JS__', (DIST/'leaflet.js').read_text().replace('</script', '<\\/script'))
html = html.replace('__EVIDENCE__', embedded(evidence)).replace('__ROADS__', embedded(roads))
output = HERE / 'review-map.html'
output.write_text(html, encoding='utf-8')
print(output, output.stat().st_size)
