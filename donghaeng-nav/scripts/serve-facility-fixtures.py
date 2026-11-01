"""Local-only UI fixtures: /failure/, /empty/, /partial/, /overlap/.
/overlap/ uses synthetic identical coordinates; canonical data files are never edited.
"""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import json
root=Path(__file__).resolve().parent.parent/'dist'
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  mode,_,relative=self.path.lstrip('/').partition('/')
  if mode in ['failure','empty','partial','overlap']:
   if relative.split('?')[0].endswith('.geojson'):
    if mode=='overlap':
     data={'type':'FeatureCollection','features':[]}
     if 'seoul/seoul-facilities.geojson' in relative:
      original=json.loads((root/'data/accessibility/seoul/seoul-facilities.geojson').read_text())
      for f in original['features'][:3]:
       f['geometry']['coordinates']=[127.0412576,37.5954369]
       data['features'].append(f)
     payload=json.dumps(data).encode()
     self.send_response(200);self.send_header('Content-type','application/json');self.end_headers();self.wfile.write(payload);return
    if mode=='empty':
     payload=b'{"type":"FeatureCollection","features":[]}'
     self.send_response(200);self.send_header('Content-type','application/json');self.end_headers();self.wfile.write(payload);return
    if mode=='failure' or 'seoul/seoul-facilities.geojson' in relative:
     self.send_error(503,'Intentional test failure');return
   self.path='/'+relative
  return super().do_GET()
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
ThreadingHTTPServer(('127.0.0.1',4175),Handler).serve_forever()
