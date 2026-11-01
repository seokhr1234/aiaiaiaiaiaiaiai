"""Extract mapped access/rest facilities inside verified Seoul OSM boundary.
Requires osmium, shapely. Inputs are dated Geofabrik PBF + public boundary XML.
"""
from pathlib import Path
import osmium, json, csv, math, hashlib, xml.etree.ElementTree as ET
from shapely.geometry import Point,LineString,Polygon,mapping,shape
from shapely.ops import polygonize,unary_union
from collections import Counter
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--raw',type=Path,required=True,help='folder with dated PBF, seoul-boundary.osm, seoul-cooling-shelters.csv')
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--legacy-root',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args();raw=args.raw;out=args.output;out.mkdir(parents=True,exist_ok=True);P=out

r=ET.parse(raw/'seoul-boundary.osm').getroot();nodes={e.get('id'):(float(e.get('lon')),float(e.get('lat'))) for e in r.findall('node')};ways={e.get('id'):[nodes[n.get('ref')] for n in e.findall('nd')] for e in r.findall('way')};rel=next(e for e in r.findall('relation') if e.get('id')=='2297418');tags={t.get('k'):t.get('v') for t in rel.findall('tag')};assert tags['ISO3166-2']=='KR-11'
outer=[LineString(ways[m.get('ref')]) for m in rel.findall('member') if m.get('type')=='way' and m.get('role')=='outer'];boundary=unary_union(list(polygonize(unary_union(outer))));assert boundary.is_valid and not boundary.is_empty
(out/'seoul-boundary.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[{'type':'Feature','geometry':mapping(boundary),'properties':{'name':'서울특별시','source_url':'https://www.openstreetmap.org/relation/2297418','license':'ODbL-1.0'}}]},ensure_ascii=False))
features=[];skipped=Counter();seen=set()
def kind(t):
 if t.get('highway')=='steps':return 'escalator' if t.get('conveying') in ('yes','forward','backward','reversible') else 'stairs'
 if t.get('highway')=='elevator':return 'elevator'
 if t.get('amenity')=='bench':return 'bench'
 if t.get('bench')=='yes' or t.get('leisure')=='picnic_table':return 'seating'
 if t.get('amenity')=='shelter' and t.get('shelter_type') in ('picnic_shelter','gazebo'):return 'shelter'
 return None
class Handler(osmium.SimpleHandler):
 def node(self,o):
  t=dict(o.tags);k=kind(t)
  if not k:return
  if not o.location.valid():skipped['invalid_location']+=1;return
  self.add(o,t,k,Point(o.location.lon,o.location.lat),'node')
 def way(self,o):
  t=dict(o.tags);k=kind(t)
  if not k:return
  try:cs=[(n.lon,n.lat) for n in o.nodes]
  except osmium.InvalidLocationError:skipped['missing_way_nodes']+=1;return
  if len(cs)<2:return
  if not any(126.75<=x<=127.20 and 37.41<=y<=37.71 for x,y in cs):return
  closed=cs[0]==cs[-1] and len(cs)>=4 and k not in ('stairs','escalator')
  self.add(o,t,k,Polygon(cs) if closed else LineString(cs),'way')
 def add(self,o,t,k,g,typ):
  if not boundary.intersects(g):return
  if t.get('disused')=='yes' or t.get('abandoned')=='yes' or t.get('construction')=='yes':skipped['inactive']+=1;return
  oid=f'{typ}/{o.id}';seen.add(oid)
  a=g if g.geom_type=='Point' else g.interpolate(.5,normalized=True) if g.geom_type=='LineString' else g.representative_point()
  p={'id':'osm:'+oid,'osm_id':oid,'kind':k,'name':t.get('name:ko',t.get('name','')),'source':'OpenStreetMap / Geofabrik','source_url':'https://www.openstreetmap.org/'+oid,'source_snapshot':'2026-10-27 (Geofabrik 배포본)','retrieved_date':'2026-10-28','last_osm_edit':o.timestamp.isoformat(),'osm_tags':t,'field_verified':False,'operational_status':'unknown','license':'ODbL-1.0','access':t.get('access','unknown'),'display_coordinates':[round(a.x,7),round(a.y,7)],'coordinate_role':'mapped_point' if g.geom_type=='Point' else 'mapped_geometry_representative_point'}
  if k=='seating':p.update({'bench_presence':'mapped_yes' if t.get('bench')=='yes' else 'picnic_table_mapped','individual_bench_count':None,'coordinate_role':'facility_reference_not_individual_bench','notice':'의자 있는 시설의 기준 위치 · 벤치 개수/정확한 위치 미확인'})
  if k=='shelter':p['notice']='야외 쉼터 · 의자/운영 상태 미확인'
  if t.get('access') in ('private','customers','no','residents'):p['notice']='출입 제한 가능 · 이용 자격 확인 필요'
  features.append({'type':'Feature','geometry':mapping(g),'properties':p})
h=Handler();h.apply_file(str(raw/'south-korea-261027.osm.pbf'),locations=True,idx='sparse_file_array,'+str(P/'locations.idx'),filters=[osmium.filter.TagFilter(('amenity','bench'),('bench','yes'),('highway','steps'),('highway','elevator'),('amenity','shelter'),('leisure','picnic_table'))]);print('OSM',Counter(f['properties']['kind'] for f in features),flush=True)
# Preserve prior local reviewed bench evidence only if distinct OSM IDs.
base=args.legacy_root/'data/accessibility'
legacy=json.loads((base/'benches/expanded/benches-expanded.geojson').read_text())
for f in legacy['features']:
 oid=f['properties']['id'].replace('osm:','')
 if oid in seen:continue
 if boundary.covers(shape(f['geometry'])):
  f['properties']['legacy_snapshot_only']=True;f['properties']['notice']='이전 지도 추출 자료 · 최신 원본에서 재확인 안 됨';features.append(f);seen.add(oid)
review=json.loads((base/'benches/wolgok-audit/wolgok-additional-seating-evidence.geojson').read_text())
for f in review['features']:
 p=f['properties'];oid=p['id'].replace('osm:','')
 if oid in seen:continue
 p['kind']='seating';p.update({'source':'카카오맵 거리뷰 · 화면 대조','source_snapshot':'2026-06 촬영 · 2026-10-28 대조','license':'카카오맵 제공자 약관 적용'}) if p['id']=='review:wolgok-stop-kb-202606' else None;p['coordinate_role']=p.get('seat_location_role');p['notice']='정류장 기준 위치 · 벤치 정확한 좌표 미확인';features.append(f);seen.add(oid)
rows=list(csv.DictReader((raw/'seoul-cooling-shelters.csv').open(encoding='cp949')));official_seen=set();official_count=0;latest_year=max(r['시설년도'] for r in rows)
for row in rows:
 if row['시설년도']!=latest_year:skipped['older_shelter_year']+=1;continue
 try:lon=float(row['경도']);lat=float(row['위도'])
 except ValueError:skipped['official_missing_coordinates']+=1;continue
 if not (-180<=lon<=180 and -90<=lat<=90) or not boundary.covers(Point(lon,lat)):skipped['official_outside_boundary']+=1;continue
 key=(row['쉼터명칭'].strip(),row['도로명주소'].strip(),lon,lat)
 if key in official_seen:skipped['official_duplicate']+=1;continue
 official_seen.add(key);oid='seoul:cooling:'+hashlib.sha256('|'.join(map(str,key)).encode()).hexdigest()[:16];hours=' '.join(filter(None,[row['기본운영_요일'],row['기본운영_시작시간']+'~'+row['기본운영_종료시간']]))
 p={'id':oid,'kind':'shelter','name':row['쉼터명칭'],'source':'서울특별시 · 무더위쉼터','source_url':'https://data.seoul.go.kr/dataList/OA-21065/S/1/datasetView.do','source_snapshot':'2026년도 공개 자료 · 2026-10-28 수집','retrieved_date':'2026-10-28','license':'공공누리 제1유형 · 서울특별시 출처표시','field_verified':False,'operational_status':'unknown','coordinate_role':'facility_reference','shelter_type':'cooling','address':row['도로명주소'],'facility_type':row['시설구분1']+' / '+row['시설구분2'],'opening_hours':hours,'extended_operation':row['연장운영_운영여부'],'additional_operation':row['추가운영_운영여부'],'district_code':row['위치코드'][:5],'notice':'무더위쉼터 지정 시설 · 계절/운영시간/이용 대상 확인 필요','official_fields':row}
 features.append({'type':'Feature','geometry':{'type':'Point','coordinates':[lon,lat]},'properties':p});official_count+=1
features.sort(key=lambda f:(f['properties']['kind'],f['properties']['id']))
counts=dict(Counter(f['properties']['kind'] for f in features));collection={'type':'FeatureCollection','name':'서울 휴식·이동 편의시설','attribution':'© OpenStreetMap contributors (ODbL) · 서울특별시 (공공누리 제1유형)','features':features}
(out/'seoul-facilities.geojson').write_text(json.dumps(collection,ensure_ascii=False,separators=(',',':')))
summary={'collected_date':'2026-10-28','osm_distribution':'https://download.geofabrik.de/asia/south-korea-261027.osm.pbf','boundary_source':'https://www.openstreetmap.org/relation/2297418','boundary_filter':'point covers / line or polygon intersects Seoul administrative boundary','counts':counts,'total':len(features),'official_shelter_rows':len(rows),'official_shelters_included':official_count,'skipped':dict(skipped),'completeness':'공개 지도 등록분과 확보한 공식 자료. 서울 전체 실물 전수조사 아님.','field_verified':False}
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
