"""Export registered road-reference points for display only, not route inputs.

Consumes preserved round7 audits/recovered original nodes. Existing runtime
datasets and research artifacts are never rewritten. Exact hashes and dates are
retained separately from this export's preparation date.
"""
from pathlib import Path
import collections
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT/'research/accessibility/round7-2026-11-11'
OUTPUT = ROOT/'donghaeng-nav/dist/data/review/connection-points.geojson.gz'
MANIFEST = ROOT/'donghaeng-nav/services/expansion/review-points-manifest.json'
KEYS = ['name', 'highway', 'barrier', 'entrance', 'kerb', 'kerb:height', 'width', 'maxwidth:physical', 'foot', 'access',
        'foot:conditional', 'access:conditional', 'foot:forward', 'foot:backward', 'oneway:foot', 'wheelchair',
        'wheelchair:conditional', 'crossing', 'crossing:signals', 'crossing:markings', 'tactile_paving',
        'layer', 'level', 'bridge', 'tunnel', 'indoor', 'location', 'conveying', 'opening_hours', 'incline']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load_checked(report_name):
    report = json.loads((SOURCE/report_name).read_bytes())
    packed = (SOURCE/report['output']['path']).read_bytes()
    assert sha(packed) == report['output']['sha256']
    raw = gzip.decompress(packed)
    assert sha(raw) == report['output']['uncompressed_sha256']
    return report, [json.loads(line) for line in raw.splitlines()]


def prepare():
    assert not OUTPUT.exists() and not MANIFEST.exists(), 'Preserve previous registered display export; use a new version path'
    audit, selected = load_checked('recovered-node-audit-results.json')
    recovery, originals = load_checked('node-recovery-results.json')
    assert audit['source_pbf_sha256'] == recovery['source_pbf_sha256']
    identities = {item['id'] for item in selected}
    assert len(identities) == len(selected) == audit['relevant_nodes']
    features, seen, counts = [], set(), collections.Counter()
    for original in originals:
        if original['id'] not in identities:
            continue
        assert original['id'] not in seen
        seen.add(original['id'])
        t = original['tags']
        contexts = [k for k, yes in [('barrier', bool(t.get('barrier'))), ('crossing', t.get('highway') == 'crossing'),
                                    ('elevator', t.get('highway') == 'elevator'), ('entrance', bool(t.get('entrance'))),
                                    ('kerb', 'kerb' in t or 'kerb:height' in t)] if yes]
        assert contexts
        counts.update(contexts)
        primary = next(k for k in ['elevator', 'kerb', 'entrance', 'barrier', 'crossing'] if k in contexts)
        features.append({'type': 'Feature', 'id': 'osm-node-'+str(original['id']),
                         'geometry': {'type': 'Point', 'coordinates': [original['lon'], original['lat']]},
                         'properties': {'kind': primary, 'contexts': contexts, 'name': t.get('name'),
                                        'osm_node_id': original['id'], 'osm_version': original['version'],
                                        'osm_object_timestamp': original['timestamp'],
                                        'source_url': 'https://www.openstreetmap.org/node/'+str(original['id']),
                                        'source_tags': {k: t[k] for k in KEYS if k in t},
                                        'coordinate_role': 'osm_registered_reference_not_verified_connection',
                                        'field_verified': False, 'routing_eligible': False}})
    assert seen == identities and dict(counts) == audit['node_context']
    features.sort(key=lambda f: f['properties']['osm_node_id'])
    xs = [f['geometry']['coordinates'][0] for f in features]
    ys = [f['geometry']['coordinates'][1] for f in features]
    meta = {'schema': 'donghaeng-review-points-v1', 'provider': 'OpenStreetMap contributors / Geofabrik',
            'source_url': 'https://download.geofabrik.de/asia/south-korea.html', 'as_of': recovery['source_as_of'],
            'collected_date': recovery['original_collected_date_kst'], 'reviewed_date': '2026-11-13',
            'source_crs': 'EPSG:4326', 'vertical_datum': None, 'coordinate_accuracy_m': None,
            'license': 'ODbL-1.0', 'source_pbf_sha256': recovery['source_pbf_sha256'],
            'recovered_node_sha256': recovery['output']['sha256'], 'audit_sha256': audit['output']['sha256'],
            'source_study_bbox': [126.7, 37.38, 127.3, 37.78], 'data_bounds': [min(xs), min(ys), max(xs), max(ys)],
            'scope': 'Registered barrier/crossing/elevator/entrance/kerb nodes referenced by study ways; not a complete Seoul facility survey',
            'field_verified': False, 'routing_eligible': False, 'new_slope_values_promoted': 0}
    data = {'type': 'FeatureCollection', 'metadata': meta, 'features': features}
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    assert len(raw) < 32*1024*1024
    packed = gzip.compress(raw, compresslevel=6, mtime=0)
    manifest = {'schema': meta['schema'], 'dataset_version': 'osm-review-'+sha(raw), 'records': len(features),
                'context_counts': dict(counts), 'metadata': meta,
                'asset': {'path': 'data/review/connection-points.geojson.gz', 'sha256': sha(packed),
                          'uncompressed_sha256': sha(raw), 'bytes': len(packed), 'uncompressed_bytes': len(raw)},
                'display_only': True, 'field_verified': False, 'routing_eligible': False}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(packed)
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    public_path = ROOT/'donghaeng-nav/services/expansion/public-coverage.mjs'
    public = json.loads(public_path.read_text().strip().removeprefix('export default ').removesuffix(';'))
    public['reviewPoints'] = {'records': manifest['records'], 'contexts': manifest['context_counts'], 'datasetVersion': manifest['dataset_version'],
                              'sourceAsOf': meta['as_of'], 'collectedDate': meta['collected_date'], 'reviewedDate': meta['reviewed_date'],
                              'sourceCrs': meta['source_crs'], 'scope': meta['scope'], 'state': 'registered_display_data',
                              'storage': 'bundled_review', 'fieldVerified': False, 'routingEligible': False}
    public['notice'] = 'OSM 등록 접속점은 이 화면에서 검토할 수 있습니다. 보행 계산·기존 시설/정밀자료 조회는 자료 서버 연결이 필요해요.'
    public_path.write_text('export default '+json.dumps(public, ensure_ascii=False, separators=(',', ':'))+';\n')
    report = {'pass': True, 'prepared_date_kst': '2026-11-13', 'records': len(features), 'contexts': dict(counts),
              'dataset_version': manifest['dataset_version'], 'asset': manifest['asset'], 'metadata': meta,
              'all_reviewed_ids_covered_once': True, 'original_coordinates_preserved': True,
              'original_research_modified': False, 'original_nine_runtime_datasets_modified': False,
              'active_routing_changed': False, 'field_verified': False}
    (ROOT/'donghaeng-nav/docs/review-points-preparation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'records': len(features), 'asset': manifest['asset'], 'data_bounds': meta['data_bounds']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    prepare()
