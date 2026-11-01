"""Merge cached official facility evidence; never invent individual bench coordinates."""
from pathlib import Path
import json,re,math
from collections import Counter
root=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';folder=root/'additional'
if not (folder/'official-facilities.geojson').exists():raise SystemExit('추가 공식자료가 없습니다.')
data=json.loads((root/'seoul-facilities.geojson').read_text());incoming=json.loads((folder/'official-facilities.geojson').read_text())['features'];prefix=('official:sd:','official:gangnam:')
base=[f for f in data['features'] if not f['properties']['id'].startswith(prefix)]
for f in base:
 p=f['properties'];p.pop('additional_official_evidence',None)
def coord(f):return f['properties'].get('display_coordinates') or (f['geometry']['coordinates'] if f['geometry']['type']=='Point' else None)
def distance(a,b):return math.hypot((a[0]-b[0])*88000,(a[1]-b[1])*111000)
def ref(p):
 m=re.search(r'\((\d{5})\)',p.get('original_facility_name',p.get('name','')));r=p.get('osm_tags',{}).get('ref','');return m[1] if m else r if re.fullmatch(r'\d{5}',r) else None
def simple(s):return re.sub(r'\([^)]*\)|[^가-힣A-Za-z0-9]','',s)
merged=[];added=[]
for f in incoming:
 p=f['properties'];c=coord(f);matches=[]
 if p.get('source_category')=='G0105':
  for old in base:
   op=old['properties'];oc=coord(old)
   if op['kind']!='seating' or not oc:continue
   d=distance(c,oc)
   if (ref(p) and ref(p)==ref(op) and d<=80) or (d<=12 and simple(p.get('original_facility_name',''))==simple(op.get('name',''))):matches.append((d,old))
 if matches:
  _,old=min(matches,key=lambda x:x[0]);old['properties'].setdefault('additional_official_evidence',[]).append(p);merged.append({'official_id':p['id'],'existing_id':old['properties']['id'],'distance_m':round(distance(c,coord(old)),1)})
 else:base.append(f);added.append(f)
data['features']=base;(root/'seoul-facilities.geojson').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
report={'date':'2026-10-29','raw_records':{'seongdong_cooling_heating_chair_sites':164,'seongdong_smart_shelters':56,'gangnam_bench_installation_addresses':30,'gangnam_original_installation_count':33},'accepted_source_records':len(incoming),'new_map_features':len(added),'new_by_kind':dict(Counter(f['properties']['kind'] for f in added)),'existing_features_enriched':len(merged),'coordinate_conflicts_held':2,'gangnam_address_references_resolved':15,'gangnam_unresolved_addresses':15,'new_individual_bench_surveyed_coordinates':0,'merged':merged}
(folder/'summary.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('추가 공식자료:',len(incoming),'건 · 새 위치',len(added),'곳 · 기존 시설 근거 보강',len(merged),'건 · 좌표 충돌 보류 2건')
