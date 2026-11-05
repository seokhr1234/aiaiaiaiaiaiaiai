#!/usr/bin/env python3
"""Reconcile preserved round4 HTTP bytes with the supplied commit, research only.

Dependencies: pyproj, pyshp, numpy. Writes only this round's analysis directory.
No runtime data, slope weights, old research, or original responses are modified.
"""
from collections import Counter, defaultdict
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
from pyproj import CRS, Transformer
import shapefile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = HERE / 'analysis'
OUT.mkdir(exist_ok=True)
BBOX = [127.017, 37.577, 127.061, 37.614]


def read(path):
    return json.loads(Path(path).read_text())


def raw(name):
    return HERE / 'raw' / name / 'response.bin'


def save(name, value):
    options = {'separators': (',', ':')} if name.endswith('.geojson') else {'indent': 2}
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, **options)+'\n')


def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def rowkey(row):
    return (row['쉼터명칭'].strip(), row['도로명주소'].strip(), float(row['경도']), float(row['위도']))


def norm(text):
    return re.sub(r'[^가-힣a-zA-Z0-9]', '', text)


def shelters():
    rows = list(csv.DictReader(io.StringIO(raw('seoul-shelter-csv').read_bytes().decode('cp949'))))
    old = read(REPO / 'donghaeng-nav/dist/data/accessibility/seoul/seoul-facilities.geojson')['features']
    old = [f for f in old if f['properties']['id'].startswith('seoul:cooling:')]
    bykey = {rowkey(r): r for r in rows}
    oldkey = {rowkey(f['properties']['official_fields']): f for f in old}
    assert len(bykey) == len(rows), 'Duplicates require manual review'
    assert len(oldkey) == len(old)
    api = read(raw('seoul-shelter-sample-http'))['TbGtnHwcwP']
    assert api['RESULT']['CODE'] == 'INFO-000'
    sheet_total = int(re.search(r'totalCount:\s*(\d+)', raw('seoul-shelter-total').read_text())[1])
    changed = [{'key': list(k), 'old_id': oldkey[k]['properties']['id'],
                'changes': {f: {'before': oldkey[k]['properties']['official_fields'].get(f), 'after': bykey[k].get(f)}
                            for f in bykey[k].keys() | oldkey[k]['properties']['official_fields'].keys()
                            if bykey[k].get(f) != oldkey[k]['properties']['official_fields'].get(f)}}
               for k in sorted(bykey.keys() & oldkey.keys())
               if bykey[k] != oldkey[k]['properties']['official_fields']]
    # EPSG:5186 is explicitly labelled by the source; lon/lat datum is checked
    # numerically for compatibility with EPSG:4326, not asserted as source metadata.
    to_wgs = Transformer.from_crs(5186, 4326, always_xy=True)
    metric = Transformer.from_crs(4326, 32652, always_xy=True)
    residuals = []
    invalid = []
    for i, r in enumerate(rows):
        try:
            lon, lat = float(r['경도']), float(r['위도'])
            assert np.isfinite([lon, lat]).all() and -180 <= lon <= 180 and -90 <= lat <= 90
            x, y = metric.transform(lon, lat)
            tx, ty = metric.transform(*to_wgs.transform(float(r['X좌표(EPSG:5186)']), float(r['Y좌표(EPSG:5186)'])))
            residuals.append(float(np.hypot(x-tx, y-ty)))
        except (ValueError, AssertionError):
            invalid.append(i+2)
    reconciliation = []
    for notice in read(HERE / 'notice-transcription.json')['notices']:
        for entry in notice['rows']:
            name = norm(entry['name'])
            candidates = [r for r in rows if r['위치코드'].startswith('11290')
                          and (name in norm(r['쉼터명칭']) or norm(r['쉼터명칭']) in name)]
            reconciliation.append({**entry, 'notice_published': notice['published_date'],
                'notice_image': notice['image_id'], 'match_method': 'normalized name containment within Seongbuk; candidates only',
                'csv_candidates': candidates, 'field_verified': False,
                'decision': 'hold for source/date/address/identity confirmation; no runtime edits'})
    save('notice-csv-reconciliation.json', reconciliation)
    save('shelter-diff.json', {
        'source': 'OA-21065', 'collected_date_kst': '2026-11-05',
        'source_facility_years': dict(Counter(r['시설년도'] for r in rows)),
        'catalog_data_updated': '2026-11-05', 'catalog_metadata_modified': '2026-08-11',
        'row_effective_or_survey_dates': None,
        'csv_rows': len(rows), 'api_total': api['list_total_count'], 'sheet_total': sheet_total,
        'api_sample_rows': len(api['row']), 'full_api_acquired': False,
        'full_public_csv_acquired': len(rows) == api['list_total_count'] == sheet_total,
        'old_runtime_records': len(old), 'new_keys': [bykey[k] for k in sorted(bykey.keys()-oldkey.keys())],
        'old_keys_not_in_new_csv': [oldkey[k] for k in sorted(oldkey.keys()-bykey.keys())],
        'changed_official_fields': changed,
        'seongbuk_rows': sum(r['위치코드'].startswith('11290') for r in rows),
        'bbox_rows': sum(BBOX[0] <= float(r['경도']) <= BBOX[2] and BBOX[1] <= float(r['위도']) <= BBOX[3] for r in rows),
        'source_projected_crs': 'EPSG:5186 (explicit source labels)',
        'source_lonlat_datum': None, 'analysis_lonlat_interpretation': 'EPSG:4326; numeric compatibility checked',
        'projected_lonlat_residual_m_max': max(residuals), 'invalid_coordinate_row_numbers': invalid,
        'coordinate_role': 'facility reference, not an entrance or individual seat',
        'field_verified': False, 'runtime_changes': 0})
    assert len(rows) == api['list_total_count'] == sheet_total


def key(e):
    return (e['type'], e['id'])


def xml_elements(path):
    root = ET.parse(path).getroot()
    result = []
    for el in root:
        if el.tag not in ('node', 'way', 'relation'):
            continue
        e = {'type': el.tag, 'id': int(el.attrib['id']),
             'version': int(el.attrib['version']), 'timestamp': el.get('timestamp'),
             'tags': {t.get('k'): t.get('v') for t in el.findall('tag')}}
        if el.tag == 'node':
            e.update(lon=float(el.get('lon')), lat=float(el.get('lat')))
        elif el.tag == 'way':
            e['nodes'] = [int(n.get('ref')) for n in el.findall('nd')]
        else:
            e['members'] = [{'type': m.get('type'), 'ref': int(m.get('ref')), 'role': m.get('role')} for m in el.findall('member')]
        result.append(e)
    return result


def osm():
    old = read(REPO / 'donghaeng-nav/dist/map-data.json')
    fresh = read(raw('overpass-map-comparable'))
    inclines = read(raw('overpass-incline'))
    assert not fresh.get('remark') and not inclines.get('remark'), 'Overpass partial/error result'
    a = {key(e): e for e in fresh['elements']}
    b = {key(e): e for e in old['elements']}
    # Recursive output repeats already selected nodes; the first output of
    # some nodes lacks metadata. Verify semantic equality before deduplication.
    for dataset in (old, fresh):
        seen = {}
        for e in dataset['elements']:
            content = {f: e.get(f, {} if f == 'tags' else None)
                       for f in ('lat', 'lon', 'tags', 'nodes', 'members')}
            assert key(e) not in seen or seen[key(e)] == content
            seen[key(e)] = content
    changed = []
    for k in sorted(a.keys() & b.keys()):
        differences = {f: {'before': b[k].get(f, {} if f == 'tags' else None),
                           'after': a[k].get(f, {} if f == 'tags' else None)}
                       for f in ('lat', 'lon', 'tags', 'nodes', 'members')
                       if b[k].get(f, {} if f == 'tags' else None) != a[k].get(f, {} if f == 'tags' else None)}
        if differences:
            changed.append({'type': k[0], 'id': k[1], 'version': a[k].get('version'),
                            'last_edit': a[k].get('timestamp'), 'changes': differences})
    merged = {}
    conflicting = []
    for path in sorted((HERE / 'raw').glob('osm-map-*-*/response.bin')):
        for e in xml_elements(path):
            k = key(e)
            if k in merged and merged[k] != e:
                conflicting.append({'type': k[0], 'id': k[1], 'earlier': merged[k]['version'], 'later': e['version']})
            if k not in merged or e['version'] >= merged[k]['version']:
                merged[k] = e
    old_access = read(REPO / 'research/accessibility/round2/acquired-2026-10-31/analysis/osm-access-features.json')
    access_review = []
    for e in old_access:
        n = merged.get((e['osm_type'], e['osm_id']))
        access_review.append({'type': e['osm_type'], 'id': e['osm_id'],
            'before_version': e['version'], 'after_version': n.get('version') if n else None,
            'status': 'not_in_response; deletion not established' if not n else
                      'unchanged_version_and_tags' if n['version'] == e['version'] and n['tags'] == e['tags'] else 'changed',
            'tags_before': e['tags'], 'tags_after': n['tags'] if n else None})
    save('osm-access-diff.json', access_review)
    fields = ('type', 'id', 'version', 'timestamp', 'tags', 'nodes', 'geometry')
    selected = [{**{k: e[k] for k in fields if k in e}, 'field_verified': False, 'routing_eligible': False} for e in inclines['elements']]
    save('osm-inclines.json', {'bbox': BBOX, 'source_crs': 'EPSG:4326 (OSM)',
         'database_timestamp': inclines['osm3s']['timestamp_osm_base'], 'elements': selected,
         'note': 'up/down/yes are not numeric grades; numeric values are mapper registrations, not field measurements by this project'})
    save('osm-diff.json', {
        'collected_date_kst': '2026-11-05', 'source_crs': 'EPSG:4326 (OSM)',
        'comparison_query': 'same selection as donghaeng-nav/scripts/fetch-map.py; meta output added',
        'old_database_timestamp': old['osm3s']['timestamp_osm_base'],
        'new_database_timestamp': fresh['osm3s']['timestamp_osm_base'],
        'duplicate_output_entries_before': len(old['elements'])-len(b),
        'duplicate_output_entries_after': len(fresh['elements'])-len(a),
        'counts_before': dict(Counter(e['type'] for e in b.values())),
        'counts_after': dict(Counter(e['type'] for e in a.values())),
        'added_to_query_result': [{'type': k[0], 'id': k[1]} for k in sorted(a.keys()-b.keys())],
        'no_longer_in_query_result': [{'type': k[0], 'id': k[1]} for k in sorted(b.keys()-a.keys())],
        'membership_change_not_proof_of_creation_or_deletion': True,
        'changed_existing': changed,
        'four_map_tiles_unique_counts': dict(Counter(e['type'] for e in merged.values())),
        'four_map_tiles_cross_response_conflicts': conflicting,
        'four_map_tiles_snapshot_note': 'four separate live API responses, not one atomic snapshot; support elements may lie outside bbox; relation member completeness not guaranteed',
        'old_access_comparison_counts': dict(Counter(e['status'] for e in access_review)),
        'incline_count_in_wider_bbox': len(selected),
        'incline_value_counts': dict(Counter(e['tags']['incline'] for e in selected)),
        'field_verified': False, 'runtime_changes': 0, 'new_slope_values_promoted': 0})


def terrain_features(archive_id):
    result = []
    metadata = []
    with zipfile.ZipFile(raw(archive_id)) as z:
        assert z.testzip() is None
        for name in [n for n in z.namelist() if n.endswith('.shp')]:
            prefix = name[:-4]
            kind = 'spot' if 'N3P_F002' in name else 'contour'
            crs = CRS.from_wkt(z.read(prefix+'.prj').decode())
            assert crs.to_epsg() == 5174
            tf = Transformer.from_crs(crs, 4326, always_xy=True)
            inv = Transformer.from_crs(4326, crs, always_xy=True)
            xs, ys = inv.transform([BBOX[0], BBOX[0], BBOX[2], BBOX[2]], [BBOX[1], BBOX[3], BBOX[1], BBOX[3]])
            coarse = (min(xs)-10, min(ys)-10, max(xs)+10, max(ys)+10)
            reader = shapefile.Reader(shp=io.BytesIO(z.read(name)), dbf=io.BytesIO(z.read(prefix+'.dbf')),
                                     shx=io.BytesIO(z.read(prefix+'.shx')), encoding='cp949')
            xml = z.read(name+'.xml').decode(errors='replace') if name+'.xml' in z.namelist() else ''
            selected = 0
            for sr in reader.iterShapeRecords(bbox=coarse):
                coords = np.asarray(sr.shape.points)[:, :2]
                lons, lats = tf.transform(coords[:, 0], coords[:, 1])
                if not np.any((BBOX[0] <= lons) & (lons <= BBOX[2]) & (BBOX[1] <= lats) & (lats <= BBOX[3])):
                    continue
                record = sr.record.as_dict()
                assert np.isfinite(record['HEIGHT'])
                points = np.column_stack((lons, lats)).tolist()
                if kind == 'spot':
                    geometry = {'type': 'Point', 'coordinates': points[0]}
                else:
                    parts = list(sr.shape.parts) + [len(points)]
                    geometry = {'type': 'MultiLineString', 'coordinates': [points[parts[i]:parts[i+1]] for i in range(len(parts)-1)]}
                result.append({'type': 'Feature', 'geometry': geometry, 'properties': {
                    'source_id': record['UFID'], 'kind': kind, 'source_height': record['HEIGHT'],
                    'source_archive': archive_id, 'source_crs': 'EPSG:5174',
                    'vertical_datum': None, 'height_unit_independently_verified': False,
                    'field_verified': False, 'routing_eligible': False}})
                selected += 1
            metadata.append({'layer': name, 'kind': kind, 'source_records': len(reader), 'selected': selected,
                'prj_epsg': crs.to_epsg(), 'projected_coordinate_unit': crs.axis_info[0].unit_name,
                'xml_process_dates': sorted(set(re.findall(r'Date="(\d{8})"', xml))),
                'process_dates_not_survey_dates': True})
    return result, metadata


def terrain():
    summary = []
    original = read(REPO / 'research/accessibility/round3-2026-11-05/terrain-source-features.geojson')['features']
    base = {(f['properties']['kind'], f['properties']['source_id']): f for f in original}
    for archive_id in ('seoul-terrain-zip1', 'seoul-terrain-zip2-get'):
        features, metadata = terrain_features(archive_id)
        save(archive_id+'-selected.geojson', {'type': 'FeatureCollection', 'features': features})
        current = {(f['properties']['kind'], f['properties']['source_id']): f for f in features}
        assert len(current) == len(features) and len(base) == len(original), 'Duplicate source identifiers'
        common = current.keys() & base.keys()
        height_changes = [{'kind': k[0], 'source_id': k[1], 'before': base[k]['properties']['source_height'],
                           'after': current[k]['properties']['source_height']} for k in sorted(common)
                          if base[k]['properties']['source_height'] != current[k]['properties']['source_height']]
        geom_changes = []
        for k in sorted(common):
            aa = current[k]['geometry']['coordinates']
            bb = base[k]['geometry']['coordinates']
            if current[k]['geometry']['type'] == 'MultiLineString':
                structure_equal = list(map(len, aa)) == list(map(len, bb))
                aa = [point for part in aa for point in part]
                bb = [point for part in bb for point in part]
            else:
                structure_equal = True
            aa, bb = np.asarray(aa), np.asarray(bb)
            if not structure_equal or aa.shape != bb.shape or not np.allclose(aa, bb, rtol=0, atol=1e-10):
                geom_changes.append({'kind': k[0], 'source_id': k[1]})
        summary.append({'archive_id': archive_id, 'bytes': raw(archive_id).stat().st_size, 'sha256': digest(raw(archive_id)),
            'identical_to_prior_seq2_archive': digest(raw(archive_id)) == '4fbe3c7e061b5974e7403ec116855304ed8ae321eebcc0d12c31ca8fb7be30bf',
            'layers': metadata, 'selection': 'same round3 bbox and vertex-in-bbox rule; crossing-only lines can be missed',
            'selected_counts': dict(Counter(f['properties']['kind'] for f in features)),
            'common_identifiers_with_round3': len(common), 'height_changes_on_common_ids': height_changes,
            'geometry_changes_on_common_ids': geom_changes,
            'only_in_this_selected_archive': [{'kind': k[0], 'id': k[1]} for k in sorted(current.keys()-base.keys())],
            'round3_ids_absent_from_this_selection': [{'kind': k[0], 'id': k[1]} for k in sorted(base.keys()-current.keys())],
            'higher_precision_or_newer_survey_established': False})
        # UFIDs differ completely between seq1 and seq2. A second comparison
        # uses mutual nearest spot pairs, without treating them as the same
        # surveyed feature or assuming a common vertical datum.
        spots = [f for f in features if f['properties']['kind'] == 'spot']
        previous = [f for f in original if f['properties']['kind'] == 'spot']
        metric = Transformer.from_crs(4326, 32652, always_xy=True)
        def xy(items):
            ll = np.array([f['geometry']['coordinates'] for f in items])
            return np.column_stack(metric.transform(ll[:, 0], ll[:, 1]))
        delta = xy(spots)[:, None, :] - xy(previous)[None, :, :]
        distances = np.linalg.norm(delta, axis=2)
        nearest = distances.argmin(axis=1)
        reverse = distances.argmin(axis=0)
        pairs = []
        for i, j in enumerate(nearest):
            if reverse[j] == i and distances[i, j] <= 1:
                p, q = spots[i]['properties'], previous[j]['properties']
                pairs.append({'this_source_id': p['source_id'], 'round3_source_id': q['source_id'],
                    'horizontal_distance_m': float(distances[i, j]),
                    'this_HEIGHT': p['source_height'], 'round3_HEIGHT': q['source_height'],
                    'raw_HEIGHT_difference': p['source_height']-q['source_height']})
        summary[-1]['mutual_nearest_spot_pairs_within_1m'] = len(pairs)
        summary[-1]['spatial_pair_note'] = 'Proximity is not verified identity; HEIGHT units and common vertical datum unconfirmed. No averaging, merging, or slope derivation.'
        save(archive_id+'-spot-proximity.json', pairs)
    save('terrain-comparison.json', {'bbox': BBOX, 'display_crs': 'EPSG:4326', 'archives': summary,
        'source_catalog_claim': '2023 NGII topographic maps, not a slope SHP',
        'seq1_file_updated': '2023-12-26', 'seq2_file_updated': '2025-03-20',
        'per_feature_survey_date': None, 'vertical_datum': None, 'field_verified': False,
        'high_resolution_new_original_acquired': False, 'new_slope_values_promoted': 0,
        'note': 'Different counts/density and filename are not evidence of greater accuracy. No road-surface slope was derived.'})


def inventory():
    requests = []
    for f in sorted((HERE / 'raw').glob('*/request.json')):
        r = read(f)
        if r.get('response_path'):
            assert digest(HERE/r['response_path']) == r['sha256']
            assert (HERE/r['response_path']).stat().st_size == r['bytes']
        requests.append(r)
    save('network-attempts.json', requests)
    save('network-summary.json', {'attempts': len(requests),
        'http_status_counts': dict(Counter(str(r.get('http_status')) for r in requests)),
        'note': 'Includes HTTP error bodies and transport failures. HTTP 200 is not automatically dataset acquisition.',
        'first_request_kst': min(r['requested_at_kst'] for r in requests),
        'last_request_kst': max(r['requested_at_kst'] for r in requests)})


if __name__ == '__main__':
    inventory()
    shelters()
    osm()
    terrain()
    print('Research reconciliation completed; runtime and previous research untouched.')
