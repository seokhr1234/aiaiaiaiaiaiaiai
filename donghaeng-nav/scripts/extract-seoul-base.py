from pathlib import Path
import osmium,json
from collections import Counter
from shapely.geometry import shape,Point,LineString,Polygon,box,mapping
import argparse,tempfile
parser=argparse.ArgumentParser(description='Extract offline Seoul basemap from the dated public OSM PBF.')
parser.add_argument('--pbf',type=Path,required=True)
parser.add_argument('--boundary',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();index_path=Path(tempfile.mktemp(prefix='seoul-base-locations-',suffix='.idx'));boundary=shape(json.loads(args.boundary.read_text())['features'][0]['geometry']).buffer(.012);features=[]
zooms={'motorway':10,'trunk':10,'primary':11,'secondary':12,'tertiary':13,'unclassified':15,'residential':15,'living_street':16,'service':17,'pedestrian':16,'footway':17,'path':17,'cycleway':16,'steps':18}
class Base(osmium.SimpleHandler):
 def node(self,o):
  t=dict(o.tags);name=t.get('name:ko',t.get('name',''))
  if not name:return
  place=t.get('place');station=t.get('railway')=='station'
  if not station and place not in ('city','borough','suburb','quarter','neighbourhood'):return
  if not o.location.valid():return
  x,y=o.location.lon,o.location.lat
  if not boundary.covers(Point(x,y)):return
  z=14 if station else 11 if place in ('city','borough','suburb') else 15
  features.append({'k':'station' if station else 'label','n':name,'z':z,'c':[round(x,6),round(y,6)],'b':[x,y,x,y]})
 def way(self,o):
  t=dict(o.tags);hw=t.get('highway');n=t.get('natural');lu=t.get('landuse');le=t.get('leisure');ww=t.get('waterway')
  if hw in zooms:k='road';z=zooms[hw]
  elif n=='water' or lu=='reservoir' or ww=='riverbank':k='water';z=10
  elif n in ('wood','scrub') or lu in ('forest','grass','recreation_ground') or le in ('park','garden'):k='green';z=10 if n=='wood' or lu=='forest' else 13
  elif ww in ('river','stream'):k='river';z=11 if ww=='river' else 15
  else:return
  try:cs=[(a.lon,a.lat) for a in o.nodes]
  except osmium.InvalidLocationError:return
  if len(cs)<2:return
  xs=[p[0] for p in cs];ys=[p[1] for p in cs];b=[min(xs),min(ys),max(xs),max(ys)]
  if b[2]<126.74 or b[0]>127.21 or b[3]<37.39 or b[1]>37.73:return
  polygon=k in ('green','water') and len(cs)>=4 and cs[0]==cs[-1]
  if k in ('green','water') and not polygon:return
  g=Polygon(cs) if polygon else LineString(cs)
  if not g.is_valid:g=g.buffer(0) if polygon else g
  if g.is_empty or not g.intersects(boundary):return
  g=g.simplify(.000015 if hw in ('path','steps','footway') else .00004,preserve_topology=True)
  if g.geom_type not in ('LineString','Polygon'):return
  coords=list(g.exterior.coords) if polygon else list(g.coords)
  f={'k':k,'z':z,'c':[[round(x,6),round(y,6)] for x,y in coords],'b':[round(v,6) for v in g.bounds]}
  if hw:f['h']=hw
  if polygon:f['p']=1
  name=t.get('name:ko',t.get('name',''))
  if name:f['n']=name
  features.append(f)
h=Base();h.apply_file(str(args.pbf),locations=True,idx='sparse_file_array,'+str(index_path),filters=[osmium.filter.KeyFilter('highway','natural','landuse','leisure','waterway','place','railway')])
# Seoul boundary gives an orientation outline even at very small zoom.
outline=shape(json.loads(args.boundary.read_text())['features'][0]['geometry'])
for poly in getattr(outline,'geoms',[outline]):
 g=poly.simplify(.00015);features.append({'k':'boundary','z':9,'c':[[round(x,6),round(y,6)] for x,y in g.exterior.coords],'b':list(g.bounds),'p':1})
counts=dict(Counter(f['k'] for f in features));result={'source':'© OpenStreetMap contributors, ODbL 1.0','snapshot':'2026-10-27','source_url':'https://download.geofabrik.de/asia/south-korea-261027.osm.pbf','counts':counts,'features':features};args.output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')));print(counts, 'bytes',args.output.stat().st_size,flush=True)

index_path.unlink(missing_ok=True)
