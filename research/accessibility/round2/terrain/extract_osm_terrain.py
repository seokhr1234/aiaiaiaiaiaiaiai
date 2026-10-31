#!/usr/bin/env python3
"""Extract existing OSM terrain caveats. This is a local snapshot audit, not a new survey."""
import json,hashlib,datetime,math,collections
from pathlib import Path
root=Path(__file__).resolve().parents[4]
p=root/'donghaeng-nav/dist/map-data.json';out=Path(__file__).parent
src=json.loads(p.read_text());nodes={e['id']:e for e in src['elements'] if e['type']=='node'}
def distance(a,b):
 r=math.pi/180;return math.hypot((a[0]-b[0])*math.cos((a[1]+b[1])*r/2),a[1]-b[1])*111195
center=(127.038992,37.5950991);features=[];counts=collections.Counter();inc=collections.Counter()
for e in src['elements']:
 t=e.get('tags',{});flags={k:t[k] for k in ('incline','ele','bridge','tunnel','layer','cutting','embankment') if k in t}
 if not flags:continue
 coords=[[nodes[n]['lon'],nodes[n]['lat']] for n in e.get('nodes',[]) if n in nodes]
 if e['type']=='node':coords=[[e['lon'],e['lat']]]
 if not coords or min(distance(x,center) for x in coords)>2000:continue
 counts.update(flags.keys())
 if 'incline' in flags:inc[flags['incline']]+=1
 geom={'type':'Point','coordinates':coords[0]} if e['type']=='node' else {'type':'LineString','coordinates':coords}
 features.append({'type':'Feature','id':e['type']+'/'+str(e['id']),'geometry':geom,'properties':{'osm_type':e['type'],'osm_id':e['id'],'osm_url':f"https://www.openstreetmap.org/{e['type']}/{e['id']}",'tags':t,'dem_sampling_requires_review':any(k in flags for k in ('bridge','tunnel','layer','cutting')),'incline_numeric_percent':None,'evidence_type':'existing_osm_snapshot','field_verified':False}})
q=out/'osm-terrain-caveats-school-2km.geojson';q.write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
r={'source':str(p.relative_to(root)),'source_sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest(),'source_timestamp':src.get('osm3s',{}).get('timestamp_osm_base'),'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'selection':'feature has at least one vertex within 2000m, approximate local distance; not precise clipping','feature_count':len(features),'tag_counts':dict(counts),'incline_values':dict(inc),'note':'Incline direction labels are not measured numeric slopes; layer tags are not vertical heights. All features may include non-walkable roads.','output_bytes':q.stat().st_size,'output_sha256':hashlib.file_digest(q.open('rb'),'sha256').hexdigest()}
(out/'osm-terrain-summary.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False,indent=2))
