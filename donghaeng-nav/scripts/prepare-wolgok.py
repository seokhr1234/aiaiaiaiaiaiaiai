"""Idempotently merge photo-observed Wolgok seating references; never create individual bench coordinates."""
from pathlib import Path
import json
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul'
p=r/'seoul-facilities.geojson'
d=json.loads(p.read_text());local=json.loads((r/'wolgok/observed-seating.geojson').read_text())
d['features']=[f for f in d['features'] if not f['properties'].get('id','').startswith('review:wolgok-more:')]+local['features']
for f in d['features']:
 if f['properties'].get('id')=='review:wolgok-stop-kb-202606':
  f['properties']['coordinate_source_url']='https://data.seoul.go.kr/dataList/OA-15067/S/1/datasetView.do'
  f['properties']['coordinate_crosscheck']='2026-10-29 서울시 공식 08133 정류장 좌표 일치 확인'
p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')))
s=r/'summary.json';a=json.loads(s.read_text());a['wolgok_additional_review']={'new_seating_locations':len(local['features']),'photo_observed_locations':4,'user_reported_locations_with_partial_photo':0,'new_individual_bench_coordinates':0,'imagery_date':'2026-06','review_date':'2026-10-29','coverage_issue_resolved':False};s.write_text(json.dumps(a,ensure_ascii=False,separators=(',',':')))
print('월곡역 추가 의자 장소',len(local['features']),'· 사진 확인 4 / 잘못 식별한 출구 제보 철회 · 개별 벤치 좌표 추가 0')
