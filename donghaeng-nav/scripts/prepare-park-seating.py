"""Merge cached official park seating; same-name references near existing seating are held as duplicates."""
from pathlib import Path
import json,re,math
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';d=r/'park-seating'
p=r/'seoul-facilities.geojson';a=json.loads(p.read_text());base=[f for f in a['features'] if not f['properties']['id'].startswith('standard:park:')];inc=json.loads((d/'facilities.geojson').read_text())['features'];added=[];duplicates=[]
def simple(n):return re.sub(r'어린이공원|근린공원|소공원|공원|[^가-힣A-Za-z0-9]','',n.split('·')[0])
for f in inc:
 name=simple(f['properties']['original_facility_name']);c=f['geometry']['coordinates'];match=None
 for b in base:
  if b['properties']['kind']!='seating' or b['geometry']['type']!='Point' or simple(b['properties'].get('name',''))!=name:continue
  z=b['geometry']['coordinates']
  if math.hypot((c[0]-z[0])*88000,(c[1]-z[1])*111200)<80:match=b;break
 if match:duplicates.append({'park_id':f['properties']['id'],'existing_id':match['properties']['id']})
 else:added.append(f)
a['features']=base+added;p.write_text(json.dumps(a,ensure_ascii=False,separators=(',',':')))
s=d/'summary.json';report=json.loads(s.read_text());report.update(new_map_features=len(added),duplicate_references=len(duplicates),duplicates=duplicates);s.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
s=r/'summary.json';report=json.loads(s.read_text());report['park_seating_inventory']={'source_records':len(inc),'new_map_features':len(added),'held_records':json.loads((d/'summary.json').read_text())['held_records'],'new_individual_bench_coordinates':0};s.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
print('공원 의자·벤치 공식 자료',len(inc),'건 · 새 시설',len(added),'곳 · 중복',len(duplicates),'곳')
