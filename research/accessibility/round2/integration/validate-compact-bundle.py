"""Independently verify the uploaded derived bundle, without remote API calls.

Requires pyproj and shapely. Supply them through the environment or PYTHONPATH.
Raw HTTP bodies and source GIS archives are not included in the compact bundle.
"""
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from pyproj import Geod, Transformer
from shapely.geometry import shape
from shapely.ops import transform, unary_union

ROOT = Path(__file__).resolve().parent.parent
BUNDLE = ROOT / 'acquired-2026-10-31'
SUMMARY = json.loads((BUNDLE / 'analysis/summary.json').read_text())
CHECKS = {}

def load(name):
    return json.loads((BUNDLE / name).read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

verified = []
for line in (BUNDLE / 'SHA256SUMS.txt').read_text().splitlines():
    if not line.strip():
        continue
    digest, name = line.split(maxsplit=1)
    path = BUNDLE / name.lstrip('*')
    assert path.resolve().is_relative_to(BUNDLE.resolve())
    assert sha(path) == digest, name
    verified.append(name)
manifest = load('artifact-manifest.json')
for record in manifest['files']:
    path = BUNDLE / record['path']
    assert path.stat().st_size == record['bytes'], str(path)
    assert sha(path) == record['sha256'], str(path)
CHECKS['sha256sum_files_verified'] = len(verified)
CHECKS['manifest_files_verified'] = len(manifest['files'])

feature_counts = {}
geometry_counts = Counter()
for path in sorted((BUNDLE / 'analysis').rglob('*.geojson')):
    data = json.loads(path.read_text())
    assert data['type'] == 'FeatureCollection'
    features = data['features']
    feature_counts[str(path.relative_to(BUNDLE))] = len(features)
    with path.with_suffix('.csv').open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    assert len(rows) == len(features), str(path)
    for feature, row in zip(features, rows):
        geometry = shape(feature['geometry'])
        assert geometry.is_valid and not geometry.is_empty, str(path)
        x1, y1, x2, y2 = geometry.bounds
        assert 124 < x1 <= x2 < 132 and 33 < y1 <= y2 < 39
        assert feature['properties']['field_verified'] is False
        assert row['geometry_type'] == geometry.geom_type
        if geometry.geom_type == 'Point':
            assert abs(float(row['longitude']) - geometry.x) < 1e-10
            assert abs(float(row['latitude']) - geometry.y) < 1e-10
        geometry_counts[geometry.geom_type] += 1
CHECKS['geojson_csv_feature_counts'] = feature_counts
CHECKS['geometry_types'] = dict(geometry_counts)

logs = load('request-log.json')
CHECKS['request_count'] = len(logs)
CHECKS['http_status_counts'] = dict(Counter(str(r['http_status']) for r in logs))
CHECKS['request_classifications'] = dict(Counter(r['classification'] for r in logs))
assert len(logs) == load('acquisition-summary.json')['attempts']
assert CHECKS['http_status_counts']['200'] == 43

geod = Geod(ellps='WGS84')
project = Transformer.from_crs(4326, 32652, always_xy=True).transform
segments = load('analysis/current-route-segments.geojson')['features']
route_geometry = unary_union([transform(project, shape(f['geometry'])) for f in segments])
route_lengths = defaultdict(float)
route_counts = Counter()
for f in segments:
    coords = f['geometry']['coordinates']
    route_lengths[f['properties']['route']] += sum(
        geod.inv(*a, *b)[2] for a, b in zip(coords, coords[1:])
    )
    route_counts[f['properties']['route']] += 1
for r in SUMMARY['osm_routes']['routes']:
    assert abs(route_lengths[r['name']] - r['current_geometry_length_m']) < 1e-6
CHECKS['route_lengths_m_recalculated'] = dict(route_lengths)
CHECKS['route_segment_counts'] = dict(route_counts)

crossings = load('analysis/crossings-school-2km.geojson')['features']
center = SUMMARY['center_lonlat']
districts = Counter()
signals = Counter()
audible = Counter()
raised = Counter()
near = []
max_distance = 0
for f in crossings:
    p = f['properties']
    coords = f['geometry']['coordinates']
    distance = geod.inv(*center, *coords)[2]
    assert distance <= 2000 + 0.01
    assert abs(distance - p['distance_to_school_m']) <= 0.011
    route_distance = transform(project, shape(f['geometry'])).distance(route_geometry)
    assert abs(route_distance - p['distance_to_route_m']) <= 0.011
    districts[p['시군구명']] += 1
    signals[p['보행등유무']] += 1
    audible[p['음향신호기설치여부']] += 1
    raised[p['고원식횡단보도유무']] += 1
    max_distance = max(max_distance, distance)
    if route_distance <= 20:
        near.append({'management_id': p['횡단보도관리번호'],
                     'source_row_1based': p['source_row_1based'],
                     'address': p['소재지지번주소'],
                     'longitude': coords[0], 'latitude': coords[1],
                     'distance_to_route_m': round(route_distance, 2),
                     'pedestrian_signal': p['보행등유무'],
                     'audible_signal': p['음향신호기설치여부'],
                     'match_status': 'proximity_candidate_only',
                     'field_verified': False})
cs = SUMMARY['crossings_csv']
assert dict(districts) == cs['districts']
assert dict(signals) == cs['pedestrian_signals']
assert dict(audible) == cs['audible_signals']
assert dict(raised) == cs['raised_crossings']
assert len(near) == cs['within_20m_of_route'] == 15
join = load('analysis/crossings-identifier-join.json')
assert len(join) == len(crossings)
assert sum(bool(r['xlsx_matches']) for r in join) == 608
assert not any(r['signal_disagreement'] for r in join)
CHECKS['crossings_recalculated'] = {
    'count': len(crossings), 'districts': dict(districts),
    'pedestrian_signals': dict(signals), 'audible_signals': dict(audible),
    'raised_crossings': dict(raised), 'maximum_school_distance_m': max_distance,
    'within_20m_of_route': len(near), 'matched_ids': 608,
}

terrain = []
for code in ('N3L_F001', 'N3P_F002'):
    features = load(f'analysis/terrain/{code}-school-2km.geojson')['features']
    heights = [f['properties']['source_attributes']['HEIGHT'] for f in features]
    for f in features:
        assert f['properties']['derived_slope_pct'] is None
    terrain.append({'layer': code, 'count': len(features),
                    'HEIGHT_min': min(heights), 'HEIGHT_max': max(heights),
                    'vertical_unit': 'not independently established'})
CHECKS['terrain_attributes'] = terrain

sidewalk = load('analysis/sidewalk-road-name-candidates.json')
assert len(sidewalk) == 6
CHECKS['sidewalk_rows'] = len(sidewalk)
CHECKS['school_named_sidewalk_widths_m'] = {
    str(r['연번']): r['폭(m)'] for r in sidewalk if '서울사대부중' in r['구간(위치)']
}
assert CHECKS['school_named_sidewalk_widths_m'] == {
    '4318': 3.2, '4319': 3, '4322': 3.2, '4323': 3.2,
}
near.sort(key=lambda r: r['distance_to_route_m'])
with (ROOT / 'route-crossing-candidates.csv').open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=list(near[0]), lineterminator='\n')
    writer.writeheader()
    writer.writerows(near)

result = {
    'checked_on': '2026-10-31', 'status': 'passed',
    'scope': 'Actual compact files independently read and recalculated in this workspace.',
    'checks': CHECKS,
    'not_reverified_here': [
        'Raw HTTP body hashes and GIS/XLSX/full CSV archives: not included.',
        'Original source CRS selection/transform and full-source completeness.',
        'Live facility operation and field measurements.',
    ],
}
(ROOT / 'compact-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
