from pathlib import Path
import re
base=Path(__file__).resolve().parent.parent/'dist'
html=(base/'index.html').read_text().replace('href="./"','href="#"')
for name in ['leaflet.css','style.css']:
 css=(base/name).read_text()
 css=re.sub(r'@import\s+url\([^)]*\)\s*;','',css)
 html=html.replace(f'<link rel="stylesheet" href="{name}">','<style>'+css+'</style>')
html=html.replace('</head>','''<style>
#live-map{background:#f2f1e9}.local-label{background:none;border:0;white-space:nowrap;pointer-events:none;color:#6b7168;font-size:11px;line-height:1.5;text-shadow:0 1px 2px white,1px 0 2px white,-1px 0 2px white,0 -1px 2px white;font-weight:500;text-align:center}.local-label.place-label{font-weight:700;color:#35583e;font-size:12px}.local-badge{position:absolute;z-index:401;top:70px;left:20px;background:#fffef3eb;border:1px solid #e2e5d3;border-radius:6px;color:#7a845d;padding:6px 10px;font-size:10px;pointer-events:none}.map-panel .leaflet-control-attribution{background:#ffffffde}.local-label.school-label{color:#176d52;font-weight:800;font-size:13px}
</style></head>''')
html=html.replace('<div id="live-map"></div>','<div id="live-map"></div><span class="local-badge">내장 지도 · 인터넷 없이 표시</span>')
def inline_json(id,path):return '<script id="'+id+'" type="application/json">'+path.read_text().replace('</','<\\/')+'</script>'
html=html.replace('<script src="leaflet.js"></script>',inline_json('bundled-map-data',base/'map-data.json')+inline_json('bundled-map-context',base/'map-context.json')+'<script>'+(base/'leaflet.js').read_text().replace('</script','<\\/script')+'</script>')
html=html.replace('<script src="engine.js"></script>','<script>'+(base/'engine.js').read_text().replace('</script','<\\/script')+'</script>')
app=(base/'app.js').read_text()
a=app.index("L.tileLayer('https://tile.openstreetmap.org")
b=app.index('routeLayer.addTo(map)',a)
app=app[:a]+'''map.attributionControl.addAttribution('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · 내장 벡터 지도');'''+app[b:]
old="const response=await fetch('map-data.json');if(!response.ok)throw Error('도로 데이터 로딩 실패');graph=E.createGraph(await response.json());"
assert old in app
app=app.replace(old,"const localData=JSON.parse(document.getElementById('bundled-map-data').textContent);graph=E.createGraph(localData);")
a=app.index('const renderer=L.canvas({padding:.3});')
b=app.index('routeLayer.bringToFront?.();',a)
app=app[:a]+"drawEmbeddedMap(localData,JSON.parse(document.getElementById('bundled-map-context').textContent));"+app[b:]
app=app.replace('지도 타일은 OpenStreetMap 서버에서 받습니다.','배경 지도도 파일에 포함된 OpenStreetMap 데이터로 그리므로 인터넷 없이 표시됩니다.')
renderer=r'''
function drawEmbeddedMap(roads,context){
map.createPane('embeddedBase');map.getPane('embeddedBase').style.zIndex='250';map.getPane('embeddedBase').style.pointerEvents='none';
map.createPane('embeddedLabels');map.getPane('embeddedLabels').style.zIndex='350';map.getPane('embeddedLabels').style.pointerEvents='none';
const canvas=L.canvas({pane:'embeddedBase',padding:.5}),nodes=new Map([...roads.elements,...context.elements].filter(e=>e.type==='node').map(e=>[e.id,[e.lat,e.lon]]));
const polygons=context.elements.filter(e=>e.type==='way'&&e.nodes&&e.nodes.length>3),labels=[],roadLayers=[],labelLayer=L.layerGroup().addTo(map);
const points=w=>w.nodes.map(id=>nodes.get(id)).filter(Boolean);
function addLabel(ll,text,kind='',priority=0){labels.push({ll,text,kind,priority})}
for(const w of polygons.filter(w=>!w.tags?.building)){const t=w.tags||{},p=points(w);if(p.length<3)continue;const green=t.leisure==='park'||['forest','grass','meadow','recreation_ground','village_green'].includes(t.landuse);L.polygon(p,{renderer:canvas,color:green?'#c3d2ad':'#e5e2d7',weight:1,fillColor:green?'#d9e4c9':'#eae8df',fillOpacity:1,interactive:false}).addTo(map);if(t.name&&green)addLabel(L.latLngBounds(p).getCenter(),t.name,'place-label',3)}
for(const w of polygons.filter(w=>w.tags?.building)){const p=points(w),t=w.tags||{};if(p.length<3)continue;L.polygon(p,{renderer:canvas,color:'#d9d7cb',weight:.7,fillColor:t.amenity==='school'?'#d6e4d3':'#e3e1d8',fillOpacity:.95,interactive:false}).addTo(map);if(t.name&&t.amenity==='school')addLabel(L.latLngBounds(p).getCenter(),t.name,'place-label',4)}
const named=new Map();
for(const w of roads.elements){if(w.type!=='way'||!w.tags?.highway||!w.nodes)continue;const p=points(w),t=w.tags;if(p.length<2)continue;const major=['trunk','primary','secondary','tertiary'].includes(t.highway),walking=['footway','path','pedestrian','steps'].includes(t.highway);let width=major?10:walking?2.5:5;const casing=L.polyline(p,{renderer:canvas,color:major?'#d1ccbc':'#dcdad0',weight:width+2,opacity:1,interactive:false}).addTo(map),line=L.polyline(p,{renderer:canvas,color:t.highway==='steps'?'#c4ac80':major?'#fff7d8':'#fffef9',weight:width,opacity:1,dashArray:t.highway==='steps'?'3 4':null,interactive:false}).addTo(map);roadLayers.push({casing,line,width});if(t.name){let length=0;for(let i=1;i<p.length;i++)length+=E.distance(p[i-1],p[i]);if(!named.has(t.name)||named.get(t.name).length<length)named.set(t.name,{ll:p[Math.floor(p.length/2)],length,major})}}
for(const [name,w] of named)if(w.length>65)addLabel(w.ll,name,'',w.major?2:0);
addLabel(E.school,'서울사대부중','school-label',10);addLabel([37.5933894,127.0382436],'서울사대부고','place-label',7);addLabel([37.5949157,127.0350147],'숭례초등학교','place-label',6);
function update(){const z=map.getZoom(),scale=Math.max(.45,Math.min(2.3,2**((z-16)*.6)));for(const r of roadLayers){r.casing.setStyle({weight:r.width*scale+2});r.line.setStyle({weight:r.width*scale})}labelLayer.clearLayers();const occupied=[];for(const l of [...labels].sort((a,b)=>b.priority-a.priority)){if(z<16&&l.priority<2||z<17&&l.priority<1)continue;const point=map.latLngToContainerPoint(l.ll),size=map.getSize();if(point.x<30||point.y<30||point.x>size.x-30||point.y>size.y-30)continue;const width=Math.min(210,l.text.length*11+14);if(occupied.some(p=>Math.abs(p.x-point.x)<(p.w+width)/2&&Math.abs(p.y-point.y)<35))continue;occupied.push({x:point.x,y:point.y,w:width});const span=document.createElement('span');span.textContent=l.text;L.marker(l.ll,{pane:'embeddedLabels',interactive:false,icon:L.divIcon({className:'local-label '+l.kind,html:span,iconSize:[width,24],iconAnchor:[width/2,12]})}).addTo(labelLayer)}}
map.on('zoomend moveend resize',update);update();
}
'''
app=app.replace('async function init(){',renderer+'\nasync function init(){')
html=html.replace('<script src="app.js"></script>','<script>'+app.replace('</script','<\\/script')+'</script>')
out=base.parent.parent/'동행길-시연.html';out.write_text(html)
assert 'tile.openstreetmap.org/' not in html
assert '500;600;700;800&display' not in html
assert '--green:#176d52' in html
print(out, out.stat().st_size)
Path('/private/tmp/donghaeng-standalone-app.js').write_text(app)
