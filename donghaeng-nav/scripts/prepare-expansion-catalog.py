"""Create a reproducible catalog from preserved runtime and new request manifests."""
from pathlib import Path
import collections
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'donghaeng-nav/dist'
DOCS = ROOT / 'donghaeng-nav/docs'
lock = json.loads((BASE / 'runtime-integrity.json').read_text())
datasets = []
for item in lock['data']:
    raw = (BASE / item['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == item['sha256'], item['path']
    data = json.loads(raw)
    datasets.append({**item, 'runtime_unchanged': True, 'metadata': data.get('metadata', data.get('meta', {}))})
precision = json.loads((BASE / 'data/precision/precision-map.geojson').read_text())
by_sheet = collections.defaultdict(list)
for feature in precision['features']:
    by_sheet[str(feature['properties'].get('sheet_id', 'unknown'))].append(feature)


def points(coords):
    if isinstance(coords[0], (float, int)):
        yield coords
    else:
        for child in coords:
            yield from points(child)


sheets = []
for source in precision['metadata']['sources']:
    features = by_sheet[source['sheet_id']]
    coords = [p for f in features for p in points(f['geometry']['coordinates'])]
    sheets.append({**source, 'display_feature_count': len(features),
                   'display_extent': [min(p[0] for p in coords), min(p[1] for p in coords), max(p[0] for p in coords), max(p[1] for p in coords)] if coords else None,
                   'extent_role': 'bounds of retained display features, not complete sheet coverage',
                   'field_verified': False, 'original_reacquired_this_round': False})
research = ROOT / 'research/accessibility/round5-2026-11-11'
requests = []
for p in sorted((research / 'raw').glob('*/request.json')):
    d = json.loads(p.read_text())
    requests.append({k: d.get(k) for k in ['id','url','http_status','bytes','sha256','transport_result','requested_at_utc','completed_at_utc','source_as_of','source_crs','vertical_datum','field_verified']})
result = {'version': 1, 'reviewed_date_kst': '2026-11-11', 'baseline_commit': '373c51208d81b17257c930c328dfa75748253f0e',
          'datasets': datasets, 'precision_sheets': sheets, 'public_requests': requests,
          'acquisition_status': {'ngii_citywide_precision': 'not_acquired', 'ngii_originals_reacquired': False,
                                 'transit_authenticated_call': False, 'transit_contract_verified': False,
                                 'tile_production_contract': False, 'physical_gps_verified': False,
                                 'new_slope_values_promoted': 0}}
if (research / 'osm-extract-results.json').exists():
    result['osm_study_extraction'] = json.loads((research / 'osm-extract-results.json').read_text())
if (research / 'osm-relations-results.json').exists():
    relations = json.loads((research / 'osm-relations-results.json').read_text())
    result['osm_study_relations'] = {k:v for k,v in relations.items() if k != 'unresolved'}
(DOCS / 'seoul-source-catalog.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
meta = precision['metadata']
terrain_meta = json.loads((BASE/'terrain-data.json').read_text())['meta']
version = hashlib.sha256(json.dumps([[d['id'],d['sha256']] for d in lock['data']],separators=(',',':')).encode()).hexdigest()
public = {'schema':'donghaeng-coverage-v1','datasetVersion':version,
          'graphVersion':next(d['sha256'] for d in lock['data'] if d['id']=='bundled-map-data'),
          'walking':{'bounds':terrain_meta['coverage'],'state':'backend_not_connected','serviceAvailable':False,'citywide':False,'fieldVerified':False},
          'precision':{'sheets':len(sheets),'features':len(precision['features']),'sourceAsOf':meta['as_of'],'sourceCrs':meta['source_crs'],'verticalDatum':meta['vertical_datum'],'citywide':False,'fieldVerified':False},
          'facilities':{'records':len(json.loads((BASE/'data/accessibility/seoul/seoul-facilities.geojson').read_text())['features']),'scope':'Seoul registered records'},'transit':{'state':'not_configured','citywide':False},
          'newSlopeValuesPromoted':0,'notice':'기본 프로그램의 자료 범위입니다. 확장 화면의 보행 계산·영역 조회는 자료 서버 연결이 필요해요.'}
(ROOT/'donghaeng-nav/services/expansion/public-coverage.mjs').write_text('export default '+json.dumps(public,ensure_ascii=False,separators=(',',':'))+';\n')
print(json.dumps({'datasets': len(datasets), 'sheets': len(sheets), 'public_requests': len(requests), 'runtime_replaced': False}))
