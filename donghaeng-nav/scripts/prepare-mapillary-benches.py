"""Merge image-reviewed Mapillary bench points and preserve their estimated positions."""
import json,math,collections
from pathlib import Path
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';d=r/'mapillary-benches';p=r/'seoul-facilities.geojson';data=json.loads(p.read_text());base=[f for f in data['features'] if not f['properties']['id'].startswith('mapillary:bench:')];incoming=json.loads((d/'benches.geojson').read_text())['features'];accepted=[];held=[]
for f in incoming:
 c=f['geometry']['coordinates'];matches=[]
 for b in base:
  if b['properties']['kind']!='bench' or b['geometry']['type']!='Point':continue
  a=b['geometry']['coordinates']
  if math.hypot((a[0]-c[0])*88250,(a[1]-c[1])*111000)<15:matches.append(b['properties']['id'])
 if matches:held.append({'id':f['properties']['id'],'reason':'existing_bench_within_15m','matches':matches})
 else:accepted.append(f)
data['features']=base+accepted;p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));report=json.loads((d/'summary.json').read_text());report.update(new_map_features=len(accepted),additional_held_near_existing=held);(d/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));s=r/'summary.json';summary=json.loads(s.read_text());summary['mapillary_photo_review']={'source_bench_records_inside_seoul':258,'photo_reviewed':89,'new_bench_points':len(accepted),'coordinate_accuracy':'provider estimate, unknown physical accuracy','field_verified':False};s.write_text(json.dumps(summary,ensure_ascii=False,indent=2));print('Mapillary 사진 대조 벤치',len(accepted),'추가 · 근접 중복 보류',len(held))
