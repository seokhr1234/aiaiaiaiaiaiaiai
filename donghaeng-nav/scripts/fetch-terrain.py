"""Fetch only six cached public terrain tiles covering the existing Wolgok demo bbox.
No user GPS or state is sent. This is an explicit data refresh, not an app request.
"""
from pathlib import Path
import math,urllib.request,json,hashlib,datetime,time
root=Path(__file__).resolve().parent.parent
folder=root/'data/terrain';z=14
folder.mkdir(parents=True,exist_ok=True)
def point(lat,lon):return ((lon+180)/360*2**z,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z)
a=point(37.611,127.020);b=point(37.580,127.058);records=[]
for x in range(math.floor(a[0]),math.floor(b[0])+1):
 for y in range(math.floor(a[1]),math.floor(b[1])+1):
  p=folder/'tiles'/str(z)/str(x)/(str(y)+'.png');p.parent.mkdir(parents=True,exist_ok=True);url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
  if not p.exists():
   req=urllib.request.Request(url,headers={'User-Agent':'Donghaeng-Wolgok-local-data-preparation/1.0'})
   with urllib.request.urlopen(req,timeout=30) as res:raw=res.read()
   if not raw.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid terrain tile')
   p.write_bytes(raw);time.sleep(.2)
  records.append({'z':z,'x':x,'y':y,'url':url,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
(folder/'tile-audit.json').write_text(json.dumps({'fetched_date':'2026-10-31','source':'Mapzen/Tilezen Terrain Tiles on AWS','source_url':'https://registry.opendata.aws/terrain-tiles/','attribution_url':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md','coverage':{'south':37.580,'west':127.020,'north':37.611,'east':127.058},'tiles':records},ensure_ascii=False,indent=2)+'\n')
print('공개 지형 타일 확보:',len(records),'장 (기존 도로망 지역만, 캐시 재사용)')
