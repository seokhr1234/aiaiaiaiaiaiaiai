from pathlib import Path
import re, json, gzip, base64, hashlib, shutil, tempfile
import runpy
runpy.run_path(str(Path(__file__).resolve().parent/"prepare-terrain.py"),run_name="__main__")
runpy.run_path(str(Path(__file__).resolve().parent/"prepare-facilities.py"),run_name="__main__")
base=Path(__file__).resolve().parent.parent/'dist'
html=(base/'index.html').read_text().replace('href="./"','href="#"')
for name in ['leaflet.css','style.css']:
 css=(base/name).read_text()
 css=re.sub(r'@import\s+url\([^)]*\)\s*;','',css)
 html=html.replace(f'<link rel="stylesheet" href="{name}">','<style>'+css+'</style>')
def inline_json(id,path):
 data=path.read_bytes()
 # Data stays lossless; native browser decompression removes the need for a server.
 encoded=base64.b64encode(gzip.compress(data,compresslevel=6,mtime=0)).decode()
 return '<script id="'+id+'" type="application/octet-stream" data-encoding="gzip-base64">'+encoded+'</script>'

html=html.replace('<script src="leaflet.js"></script>',inline_json('bundled-map-data',base/'map-data.json')+inline_json('bundled-map-context',base/'map-context.json')+'<script>'+(base/'leaflet.js').read_text().replace('</script','<\\/script')+'</script>')
html=html.replace('<script src="seoul-base.js"></script>',inline_json('bundled-seoul-base',base/'data/accessibility/seoul/seoul-base.json')+'<script>'+(base/'seoul-base.js').read_text().replace('</script','<\\/script')+'</script>')
html=html.replace('<script src="final-model.js"></script>','<script>'+(base/'final-model.js').read_text().replace('</script','<\\/script')+'</script>')
html=html.replace('<script src="engine.js"></script>',inline_json('bundled-terrain',base/'terrain-data.json')+'<script>'+(base/'engine.js').read_text().replace('</script','<\\/script')+'</script>')
html=html.replace('<script src="facilities.js"></script>',inline_json('bundled-facilities-seoul',base/'data/accessibility/seoul/seoul-facilities.geojson')+'<script>'+(base/'facilities.js').read_text().replace('</script','<\\/script')+'</script>')

html=html.replace('<script src="condition-ai.js"></script>','<script>'+(base/'condition-ai.js').read_text().replace('</script','<\\/script')+'</script>')
app=(base/'app.js').read_text()
old="const response=await fetch('map-data.json');if(!response.ok)throw Error('도로 데이터 로딩 실패');const roadText=await response.text();graph=E.createGraph(JSON.parse(roadText));graph.meta.graphSha256=await hashRoadText(roadText);"
assert old in app
app=app.replace(old,"const roadText=document.getElementById('bundled-map-data').textContent;const localData=JSON.parse(roadText);graph=E.createGraph(localData);graph.meta.graphSha256=await hashRoadText(roadText);")
bootstrap="""<script>window.DONGHAENG_DATA_READY=(async()=>{const entries=[...document.querySelectorAll('script[data-encoding=\"gzip-base64\"]')];if(!window.DecompressionStream)throw Error('Chrome 또는 Edge의 최신 브라우저에서 열어 주세요.');for(let i=0;i<entries.length;i++){const el=entries[i],status=document.getElementById('boot-status');if(status)status.textContent='월곡역과 서울 자료를 준비하는 중… '+(i+1)+' / '+entries.length;const bytes=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));el.textContent=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();el.type='application/json';el.removeAttribute('data-encoding')}})();</script>"""
html=html.replace('<script src="app.js"></script>',bootstrap+'<script>'+app.replace('</script','<\\/script')+'</script>')
out=base.parent.parent/'동행길-시연.html';out.write_text(html,encoding='utf-8',newline='\n')
final=base.parent.parent/'동행길-최종.html';final.write_text(html,encoding='utf-8',newline='\n')
(base.parent.parent/'동행길-전달용.html').write_text(html,encoding='utf-8',newline='\n')
assert 'bundled-facilities-seoul' in html
assert 'bundled-seoul-base' in html
assert 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' in html
assert 'drawEmbeddedMap' not in html
assert 'seoul-base-canvas' not in html
assert '<script src=' not in html
assert '500;600;700;800&display' not in html
assert '--green:#176d52' in html
print(out, out.stat().st_size)
Path(tempfile.gettempdir(),'donghaeng-standalone-app.js').write_text(app,encoding='utf-8')

source=base.parent/'data/accessibility/seoul/seoul-facilities.geojson'
features=json.loads(source.read_text())['features']
from collections import Counter
manifest={'version':'2026-11-01-sheet-motion','facility_records':len(features),'counts':dict(Counter(f['properties']['kind'] for f in features)),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'terrain':json.loads((base/'terrain-data.json').read_text())['meta'],'html_sha256':hashlib.sha256(html.encode()).hexdigest(),'html_bytes':len(html.encode()),'external_requests_required':False,'online_basemap':'OpenStreetMap raster tiles via Leaflet; HTTP(S) only','offline_basemap':'Embedded OSM snapshot via Leaflet GridLayer; file mode or connection failure','optional_condition_api':'Gemini via local server; condition text only','external_deployment':False}
(base.parent/'docs/final-build.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,ensure_ascii=False))
