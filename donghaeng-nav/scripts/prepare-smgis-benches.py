"""Merge reviewed official bench installation points without multiplying grouped seats."""
import json,math
from pathlib import Path
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';d=r/'survey-20261029';p=r/'seoul-facilities.geojson';data=json.loads(p.read_text());base=[f for f in data['features'] if not f['properties']['id'].startswith('smgis:bench:')];incoming=json.loads((d/'official-bench-sites.geojson').read_text())['features'];accepted=[];held=[]
for f in incoming:
 c=f['geometry']['coordinates'];matches=[]
 for b in base:
  if b['properties']['kind']!='bench' or b['geometry']['type']!='Point':continue
  a=b['geometry']['coordinates']
  if math.hypot((a[0]-c[0])*88000,(a[1]-c[1])*111000)<15:matches.append(b['properties']['id'])
 if matches:held.append({'id':f['properties']['id'],'reason':'existing_bench_within_15m','matches':matches})
 else:accepted.append(f)
data['features']=base+accepted;p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
report={'reviewed_official_installation_points':len(incoming),'new_official_installation_points':len(accepted),'held_possible_duplicates':held,'new_individual_bench_count':None,'note':'Installation locations may contain multiple benches. Their physical bench count and exact per-bench coordinates are not provided.'};(d/'official-merge-summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('공식 벤치 설치 지점',len(accepted),'추가 · 기존 벤치 근접 보류',len(held))
