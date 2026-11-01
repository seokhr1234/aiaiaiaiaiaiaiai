"""Merge photo-confirmed bench objects with explicit estimated location accuracy."""
from pathlib import Path
import json,math
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';d=r/'photo-benches';p=r/'seoul-facilities.geojson';a=json.loads(p.read_text());base=[f for f in a['features'] if not f['properties']['id'].startswith('photo:bench:')];incoming=json.loads((d/'benches.geojson').read_text())['features'];accepted=[]
for f in incoming:
 c=f['geometry']['coordinates']
 matches=[b for b in base if b['properties']['kind']=='bench' and b['geometry']['type']=='Point' and math.hypot((b['geometry']['coordinates'][0]-c[0])*88000,(b['geometry']['coordinates'][1]-c[1])*111200)<30]
 if matches:raise SystemExit('사진 벤치와 기존 벤치가 30m 안에 겹침: 중복 대조 필요')
 accepted.append(f)
a['features']=base+accepted;p.write_text(json.dumps(a,ensure_ascii=False,separators=(',',':')));s=r/'summary.json';report=json.loads(s.read_text());report['photo_benches']={'new_bench_objects':len(accepted),'new_bus_stop_records':0,'coordinate_accuracy_m':30,'field_surveyed_coordinates':0};s.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')));print('정류장 제외 사진 확인 벤치',len(accepted),'개 · 추정 위치 오차 약30m')
