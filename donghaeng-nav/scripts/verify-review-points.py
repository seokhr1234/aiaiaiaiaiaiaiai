"""Independent exact-coordinate/tag/source conservation for display export."""
from pathlib import Path
import collections
import gzip
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[2]
previous = root/'research/accessibility/round7-2026-11-11'
manifest = json.loads((root/'donghaeng-nav/services/expansion/review-points-manifest.json').read_bytes())
packed = (root/'donghaeng-nav/dist'/manifest['asset']['path']).read_bytes()
assert hashlib.sha256(packed).hexdigest() == manifest['asset']['sha256']
raw = gzip.decompress(packed)
assert hashlib.sha256(raw).hexdigest() == manifest['asset']['uncompressed_sha256']
data = json.loads(raw)
recovery = json.loads((previous/'node-recovery-results.json').read_bytes())
audit = json.loads((previous/'recovered-node-audit-results.json').read_bytes())
assert hashlib.sha256((previous/recovery['output']['path']).read_bytes()).hexdigest() == data['metadata']['recovered_node_sha256']
assert hashlib.sha256((previous/audit['output']['path']).read_bytes()).hexdigest() == data['metadata']['audit_sha256']
original = {row['id']: row for row in [json.loads(line) for line in gzip.decompress((previous/recovery['output']['path']).read_bytes()).splitlines()]}
expected = {json.loads(line)['id'] for line in gzip.decompress((previous/audit['output']['path']).read_bytes()).splitlines()}
seen, counts = set(), collections.Counter()
for feature in data['features']:
    p = feature['properties']
    ident = p['osm_node_id']
    assert ident in expected and ident not in seen
    seen.add(ident)
    source = original[ident]
    assert feature['geometry'] == {'type': 'Point', 'coordinates': [source['lon'], source['lat']]}
    assert p['osm_version'] == source['version'] and p['osm_object_timestamp'] == source['timestamp']
    assert p['source_url'] == 'https://www.openstreetmap.org/node/'+str(ident)
    assert all(source['tags'][k] == v for k, v in p['source_tags'].items())
    for key in ['foot', 'access', 'wheelchair', 'barrier', 'entrance', 'width', 'kerb:height', 'incline', 'level', 'layer', 'foot:conditional', 'access:conditional']:
        if key in source['tags']:
            assert p['source_tags'][key] == source['tags'][key]
        else:
            assert key not in p['source_tags']
    assert p['field_verified'] is False and p['routing_eligible'] is False
    counts.update(p['contexts'])
assert seen == expected and len(seen) == manifest['records'] == audit['relevant_nodes']
assert dict(counts) == manifest['context_counts'] == audit['node_context']
assert data['metadata'] == manifest['metadata']
assert data['metadata']['as_of'] == recovery['source_as_of'] and data['metadata']['collected_date'] == '2026-11-11'
assert data['metadata']['reviewed_date'] == '2026-11-13' and data['metadata']['source_crs'] == 'EPSG:4326'
assert data['metadata']['coordinate_accuracy_m'] is None and data['metadata']['vertical_datum'] is None
lock = json.loads((root/'donghaeng-nav/dist/runtime-integrity.json').read_bytes())
for d in lock['data']:
    p = root/'donghaeng-nav/dist'/d['path']
    assert p.read_bytes() == subprocess.check_output(['git', 'show', '88b78a22647b192d81418567a572f66c6faabdb7:'+str(p.relative_to(root))], cwd=root)
assert not subprocess.check_output(['git', 'diff', '--name-only', '88b78a22647b192d81418567a572f66c6faabdb7', '--', 'research'], cwd=root).strip()
report = {'pass': True, 'verified_date_kst': '2026-11-13', 'records_checked': len(seen), 'context_counts': dict(counts),
          'all_original_node_ids_coordinates_tags_and_edit_times_preserved': True, 'missing_tags_not_filled': True,
          'source_date_and_collection_and_review_dates_separated': True, 'original_nine_datasets_byte_identical': True,
          'prior_research_unchanged': True, 'display_only': True, 'field_verified': False, 'routing_eligible': False, 'new_slope_values_promoted': 0}
(root/'donghaeng-nav/docs/review-points-source-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
