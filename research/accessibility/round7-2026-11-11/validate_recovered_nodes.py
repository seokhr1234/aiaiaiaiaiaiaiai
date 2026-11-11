"""Conserve recovered original tags/coordinates and relevant node coverage."""
from pathlib import Path
import collections
import gzip
import hashlib
import json

root = Path(__file__).resolve().parent
recovery = json.loads((root/'node-recovery-results.json').read_bytes())
audit = json.loads((root/'recovered-node-audit-results.json').read_bytes())
data = json.load(gzip.open(root.parent/'round5-2026-11-11/derived/study-map.json.gz', 'rt'))
original = {n['id']: n for n in data['elements'] if n['type'] == 'node'}
del data
recovered, raw_digest, new_tags = {}, hashlib.sha256(), 0
packed = (root/recovery['output']['path']).read_bytes()
assert hashlib.sha256(packed).hexdigest() == recovery['output']['sha256']
with gzip.open(root/recovery['output']['path'], 'rb') as stream:
    for line in stream:
        raw_digest.update(line)
        item = json.loads(line)
        assert item['id'] not in recovered and item['id'] in original and item['tags']
        previous = original[item['id']]
        assert previous['lon'] == item['lon'] and previous['lat'] == item['lat']
        if previous.get('tags'):
            assert previous['tags'] == item['tags']
        else:
            new_tags += 1
        recovered[item['id']] = item
assert raw_digest.hexdigest() == recovery['output']['uncompressed_sha256']
assert len(recovered) == recovery['tagged_nodes_emitted']
assert new_tags == recovery['tagged_nodes_missing_from_intermediate']
assert len(original) == recovery['road_nodes_expected'] == recovery['road_nodes_found']
assert all(n['id'] in recovered for n in original.values() if n.get('tags'))
expected = {ident for ident, n in recovered.items() if n['tags'].get('barrier') or n['tags'].get('entrance') or n['tags'].get('highway') in ['crossing', 'elevator'] or 'kerb' in n['tags'] or 'kerb:height' in n['tags']}
seen, digest = set(), hashlib.sha256()
states = {k: collections.Counter() for k in ['foot_rule', 'wheelchair_rule', 'width', 'kerb_height', 'incline']}
assert hashlib.sha256((root/audit['output']['path']).read_bytes()).hexdigest() == audit['output']['sha256']
with gzip.open(root/audit['output']['path'], 'rb') as stream:
    for line in stream:
        digest.update(line)
        row = json.loads(line)
        assert row['id'] in expected and row['id'] not in seen
        seen.add(row['id'])
        source_tags = recovered[row['id']]['tags']
        assert all(source_tags[k] == v for k, v in row['tags'].items())
        for key, tag, value_key in [('width', 'width', 'meters'), ('kerb_height', 'kerb:height', 'meters'), ('incline', 'incline', 'value')]:
            assert row[key]['raw'] == source_tags.get(tag)
            if tag not in source_tags:
                assert row[key][value_key] is None and row[key]['state'] == 'missing'
            states[key][row[key]['state']] += 1
        states['foot_rule'][row['foot_rule']['state']] += 1
        states['wheelchair_rule'][row['wheelchair_rule']] += 1
        assert row['field_verified'] is False and row['routing_eligible'] is False
assert digest.hexdigest() == audit['output']['uncompressed_sha256']
assert seen == expected and len(seen) == audit['relevant_nodes']
assert all(dict(counts) == audit[key] for key, counts in states.items())
result = {'pass': True, 'road_reference_nodes': len(original), 'tagged_original_nodes_preserved': recovery['originally_tagged_nodes'],
          'additional_tagged_nodes_recovered': new_tags, 'all_tagged_recovery_rows': len(recovered), 'relevant_nodes_audited': len(seen),
          'source_coordinates_and_retained_tags_unchanged': True, 'hashes_and_counts_verified': True,
          'complete_relevant_recovered_node_coverage': True, 'missing_physical_attributes_remain_null': True,
          'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False, 'new_slope_values_promoted': 0}
(root/'recovered-node-validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
