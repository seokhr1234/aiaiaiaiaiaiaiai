"""Attach apartment context and explicit user-reported areas without inventing bench points."""
from pathlib import Path
import json,math
from collections import Counter
root=Path(__file__).resolve().parent.parent/'data/accessibility/seoul';folder=root/'apartments'
def read(p):return json.loads(p.read_text())
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
if not (folder/'apartment-areas.geojson').exists():raise SystemExit('아파트 경계 자료가 없습니다.')
data=read(root/'seoul-facilities.geojson');features=[f for f in data['features'] if f['properties']['kind'] not in ('complex','apartment')];areas=read(folder/'apartment-areas.geojson')['features'];reports=read(folder/'apartment-reports.geojson')['features'];grid={};counts={}
def polygons(g):return [g['coordinates']] if g['type']=='Polygon' else g['coordinates']
def inside_ring(c,r):
 x,y=c;inside=False
 for i,a in enumerate(r):
  b=r[i-1]
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def contains(c,g):return any(inside_ring(c,p[0]) and not any(inside_ring(c,h) for h in p[1:]) for p in polygons(g))
for i,f in enumerate(areas):
 cs=[p for poly in polygons(f['geometry']) for ring in poly for p in ring];b=[min(p[0] for p in cs),min(p[1] for p in cs),max(p[0] for p in cs),max(p[1] for p in cs)]
 for x in range(math.floor(b[0]*100),math.floor(b[2]*100)+1):
  for y in range(math.floor(b[1]*100),math.floor(b[3]*100)+1):grid.setdefault((x,y),[]).append(i)
for f in features:
 p=f['properties']
 if p['kind'] not in ('bench','seating') or p.get('coordinate_role')=='public_space_parcel_reference':continue
 c=p.get('display_coordinates') or (f['geometry']['coordinates'] if f['geometry']['type']=='Point' else None)
 if not c:continue
 for i in grid.get((math.floor(c[0]*100),math.floor(c[1]*100)),[]):
  a=areas[i]['properties']
  if not contains(c,areas[i]['geometry']):continue
  old_notice=p.get('notice')
  p.update({'apartment_name':a['name'],'apartment_id':a['id'],'apartment_boundary_source':a['source_url'],'context':'apartment_polygon','apartment_access':'unknown','notice':'아파트 경계 내 등록 위치 · 실제 단지 내부 여부와 외부인 이용 가능 여부 미확인'})
  if p.get('source_category') in ('street_public_space_historical','street_pocket_area'):
   p['notice']=old_notice+' 주거지 경계와 겹쳐도 이용 가능 여부는 별도 확인이 필요합니다.'
  if p.get('coordinate_role')=='photo_estimated_bench_location':
   p['notice']='사진 확인 고정 벤치 · 위치는 약 30m 오차의 추정치이며 실측 아님. 공원 내 시설로, 주거지 경계에 포함되더라도 아파트 전용 벤치라는 뜻은 아닙니다.'
  if p.get('coordinate_role')=='provider_triangulated_bench_estimate':
   p['notice']=old_notice+' 아파트 경계와 겹치는 등록 위치이며 단지 전용 벤치라는 뜻은 아닙니다.'
  if p.get('park_inventory'):
   p['apartment_access']='public_park_inventory_not_residents_only'
   p['notice']='공식 공원 보유시설: '+p['original_facility_description']+' · 공원 대표 좌표이며 벤치별 위치·현존 개수 미확인. 주거지 경계 안의 공원 기준 위치로, 아파트 전용 시설이라는 뜻은 아닙니다.'
  if not p.get('name'):p['name']=a['name']+' · '+('벤치' if p['kind']=='bench' else '의자 있는 시설')
  count=counts.setdefault(a['id'],{'name':a['name'],'bench':0,'seating':0});count[p['kind']]+=1;break
for f in areas:
 p=f['properties'];c=counts.get(p['id'],{});p.update(mapped_bench_count=c.get('bench',0),mapped_seating_count=c.get('seating',0))
physical_total=len(features);data['features']=features+areas+reports;write(root/'seoul-facilities.geojson',data)
summary=read(root/'summary.json');summary.update(updated_date='2026-10-29',counts=dict(Counter(f['properties']['kind'] for f in data['features'])),total=len(data['features']),mapped_features_excluding_apartment_overlays=physical_total,apartment_overlays={'complex_boundaries':len(areas),'user_reported_seating_areas':len(reports),'new_individual_bench_coordinates':0});write(root/'summary.json',summary)
summary=read(folder/'summary.json');summary.update(complex_polygons=len(areas),complexes_with_mapped_seating=len(counts),mapped_benches_in_complexes=sum(c['bench'] for c in counts.values()),mapped_seating_facilities_in_complexes=sum(c['seating'] for c in counts.values()),complexes=counts,total_features_with_complex_boundaries=len(data['features']));write(folder/'summary.json',summary)
print('아파트 경계',len(areas),'· 기존 벤치',summary['mapped_benches_in_complexes'],'· 기존 의자 시설',summary['mapped_seating_facilities_in_complexes'],'· 사용자 제보 구역',len(reports),'(개별 벤치 좌표 추가 0)')
