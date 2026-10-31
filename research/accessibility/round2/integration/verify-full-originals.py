"""Verify restored original data against the previously imported compact bundle.

Does not execute code from the archive. Requires openpyxl, pyshp, pyproj, shapely.
Usage: python verify-full-originals.py --root /path/to/restored
"""
import argparse
import csv
import hashlib
import io
import json
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

import shapefile
from openpyxl import load_workbook
from pyproj import CRS, Geod, Transformer
from shapely.geometry import Point, box, shape
from shapely.ops import transform

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
args = parser.parse_args()
RAW = args.root.resolve()
ROUND2 = Path(__file__).resolve().parent.parent
COMPACT = ROUND2 / 'acquired-2026-10-31'
RESULT = {'checked_on': '2026-10-31', 'status': 'passed', 'raw_root': str(RAW)}

def load(path):
    return json.loads(path.read_text())

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

manifest = load(RAW / 'research-resumed/artifact-manifest.json')
for r in manifest['files']:
    p = RAW / r['archive_path']
    assert p.resolve().is_relative_to(RAW)
    assert p.stat().st_size == r['bytes'] and digest(p) == r['sha256'], r['archive_path']
RESULT['original_manifest_files_verified'] = len(manifest['files'])
logs = load(RAW / 'research-resumed/request-log.json')
body_count = 0
for r in logs:
    if r.get('body_path'):
        p = RAW.joinpath(*PurePosixPath(r['body_path']).relative_to('/workspace').parts)
        assert p.resolve().is_relative_to(RAW)
        assert p.stat().st_size == r['bytes'] and digest(p) == r['sha256']
        body_count += 1
RESULT['http_bodies_hash_verified'] = body_count

shared = []
for p in (COMPACT / 'analysis').rglob('*'):
    if p.is_file():
        original = RAW / 'research-resumed' / p.relative_to(COMPACT)
        if original.exists():
            assert digest(p) == digest(original), str(p)
            shared.append(str(p.relative_to(COMPACT)))
RESULT['compact_analysis_files_byte_identical'] = shared

downloads = RAW / 'research-downloads'
archives = [downloads / 'terrain/oa22241/oa22241-seq2.zip',
            downloads / 'sidewalk/OA-22240.xlsx', downloads / 'sidewalk/OA-23081.xlsx']
for p in archives:
    with zipfile.ZipFile(p) as z:
        assert z.testzip() is None, str(p)
RESULT['nested_archive_crc_verified'] = len(archives)

geod = Geod(ellps='WGS84')
center = [127.038992, 37.5950991]
with (downloads / 'sidewalk/OA-22906-recheck.csv').open(encoding='cp949', newline='') as f:
    rows = list(csv.DictReader(f))
assert len(rows) == 40282
assert all(None not in r and all(v is not None for v in r.values()) for r in rows)
selected = []
missing = []
for line, row in enumerate(rows, 2):
    if not row['경도'] or not row['위도']:
        missing.append(line)
        continue
    distance = geod.inv(*center, float(row['경도']), float(row['위도']))[2]
    if distance <= 2000:
        selected.append((line, row))
derived = load(COMPACT / 'analysis/crossings-school-2km.json')
assert len(selected) == len(derived) == 1260
derived_by_line = {r['source_row_1based']: r for r in derived}
assert len(derived_by_line) == len(selected)
assert set(derived_by_line) == {line for line, _ in selected}
for line, row in selected:
    record = derived_by_line[line]
    assert all(record[k] == v for k, v in row.items())
RESULT['crossings_source'] = {
    'complete_rows': len(rows), 'blank_coordinate_lines': missing,
    'selected_2km_rows': len(selected), 'source_fields_match_compact': True,
}

book = load_workbook(downloads / 'sidewalk/OA-22240.xlsx', read_only=True, data_only=True)
sheet = book['특별시도 보도 세부현황(2025)']
iterator = sheet.iter_rows(values_only=True)
headers = next(iterator)[:14]
detail = [dict(zip(headers, r[:14])) for r in iterator if isinstance(r[0], (int, float))]
candidates = [r for r in detail if r['노선명'] == '월곡로']
assert candidates == load(COMPACT / 'analysis/sidewalk-road-name-candidates.json')
RESULT['sidewalk_source'] = {'detail_rows': len(detail), 'candidate_rows': len(candidates),
                            'compact_candidate_rows_match': True}
book.close()
book = load_workbook(downloads / 'sidewalk/OA-23081.xlsx', read_only=True, data_only=True)
iterator = book.active.iter_rows(values_only=True)
headers = next(iterator)
all_crossings = [dict(zip(headers, r)) for r in iterator]
by_id = {}
for row in all_crossings:
    by_id.setdefault(row['횡단보도관리번호'], []).append(row)
join = load(COMPACT / 'analysis/crossings-identifier-join.json')
for r in join:
    assert by_id.get(r['management_id'], []) == r['xlsx_matches']
RESULT['crossing_workbook'] = {'rows': len(all_crossings), 'joined_rows': sum(bool(r['xlsx_matches']) for r in join),
                              'compact_join_matches_source': True}
book.close()

cross = downloads / 'crosscheck'
current = {e['id']: e for e in load(cross / 'ways-current.json')['elements']}
baseline = load(ROUND2 / 'crosscheck/local-evidence.json')
snapshot = load(ROUND2.parents[2] / 'donghaeng-nav/dist/map-data.json')
old = {(e['type'], e['id']): e for e in snapshot['elements']}
current_nodes = {}
for file in cross.glob('route-nodes-*.json'):
    current_nodes.update({e['id']: e for e in load(file)['elements']})
for way in current.values():
    source = old[('way', way['id'])]
    assert way.get('tags', {}) == source.get('tags', {})
    assert way['nodes'] == source['nodes']
    history = load(cross / f"way-{way['id']}-history.json")['elements']
    assert history[-1]['version'] == way['version']
for feature in load(COMPACT / 'analysis/current-route-segments.geojson')['features']:
    props = feature['properties']
    way = current[props['way_id']]
    pairs = [(current_nodes[a], current_nodes[b]) for a, b in zip(way['nodes'], way['nodes'][1:])]
    coords = feature['geometry']['coordinates']
    assert any(coords == [[a['lon'], a['lat']], [b['lon'], b['lat']]] or
               coords == [[b['lon'], b['lat']], [a['lon'], a['lat']]] for a, b in pairs)
RESULT['osm_originals'] = {'ways_compared': len(current), 'unchanged_tags_and_node_order': True,
                          'history_current_versions_match': True, 'compact_segments_are_current_adjacent_pairs': True}

utm = Transformer.from_crs(4326, 32652, always_xy=True)
back = Transformer.from_crs(32652, 4326, always_xy=True)
circle = Point(*utm.transform(*center)).buffer(2000, quad_segs=64)
terrain = []
with zipfile.ZipFile(archives[0]) as z:
    for code in ('N3L_F001', 'N3P_F002'):
        stem = next(n[:-4] for n in z.namelist() if n.endswith(code + '.shp'))
        crs = CRS.from_wkt(z.read(stem + '.prj').decode('utf-8-sig'))
        assert crs.to_epsg() == 5174
        to_utm = Transformer.from_crs(crs, 32652, always_xy=True)
        from_utm = Transformer.from_crs(32652, crs, always_xy=True)
        raw_bounds = transform(from_utm.transform, circle).bounds
        raw_region = box(*raw_bounds)
        reader = shapefile.Reader(shp=io.BytesIO(z.read(stem + '.shp')),
                                  shx=io.BytesIO(z.read(stem + '.shx')),
                                  dbf=io.BytesIO(z.read(stem + '.dbf')), encoding='cp949')
        target = load(COMPACT / f'analysis/terrain/{code}-school-2km.geojson')['features']
        selected_by_id = {f['properties']['record_index_1based']: f for f in target}
        found = set()
        largest_difference = 0.0
        for index, record in enumerate(reader.iterShapeRecords(), 1):
            if record.shape.shapeType == shapefile.NULL:
                continue
            raw_geometry = shape(record.shape.__geo_interface__)
            if not raw_geometry.intersects(raw_region):
                continue
            projected = transform(to_utm.transform, raw_geometry)
            if not projected.intersects(circle):
                continue
            assert index in selected_by_id, (code, index)
            found.add(index)
            feature = selected_by_id[index]
            assert record.record.as_dict() == feature['properties']['source_attributes']
            expected = projected.intersection(circle)
            actual = transform(utm.transform, shape(feature['geometry']))
            difference = expected.hausdorff_distance(actual)
            largest_difference = max(largest_difference, difference)
            assert difference < 0.01, (code, index, difference)
        assert found == set(selected_by_id), (code, len(found), len(selected_by_id))
        terrain.append({'layer': code, 'source_records': len(reader), 'source_epsg': crs.to_epsg(),
                        'selected_records_reproduced': len(found), 'largest_geometry_difference_m': largest_difference,
                        'source_fields_match': True, 'vertical_unit': 'not independently established'})
        reader.close()
RESULT['terrain_originals'] = terrain
RESULT['limitations'] = ['No live API requests repeated in this environment.',
                         'File identity and source/derived consistency do not establish field accessibility.',
                         'Vertical height unit/datum and pedestrian-surface slope remain unverified.']
(ROUND2 / 'full-original-validation.json').write_text(json.dumps(RESULT, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(RESULT, ensure_ascii=False, indent=2))
