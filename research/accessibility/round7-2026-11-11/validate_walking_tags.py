"""Independent conservation/hash and unknown-value checks for the tag audit."""
from pathlib import Path
import collections
import gzip
import hashlib
import json
import math
import subprocess

root = Path(__file__).resolve().parent
report = json.loads((root/'walking-tag-results.json').read_bytes())
source_path = root.parent/'round5-2026-11-11/derived/study-map.json.gz'
packed_source = source_path.read_bytes()
assert hashlib.sha256(packed_source).hexdigest() == report['input_sha256']
source_data = json.loads(gzip.decompress(packed_source))
original = {}
for item in source_data['elements']:
    t = item.get('tags', {})
    if (item['type'] == 'way' and 'highway' in t) or (item['type'] == 'node' and (t.get('barrier') or t.get('entrance') or t.get('highway') in ['crossing', 'elevator'] or 'kerb' in t or 'kerb:height' in t)):
        original[item['type'], item['id']] = t
del source_data, packed_source
packed = (root/report['output']['path']).read_bytes()
assert hashlib.sha256(packed).hexdigest() == report['output']['sha256']
seen = set()
digest = hashlib.sha256()
objects, feet, wheels = collections.Counter(), collections.Counter(), collections.Counter()
way_counts = {k: collections.Counter() for k in ['width', 'kerb_height', 'incline']}
node_counts = {k: collections.Counter() for k in ['width', 'kerb_height', 'incline', 'wheelchair_rule']}
node_raw_presence = collections.Counter()
with gzip.open(root/report['output']['path'], 'rb') as stream:
    for line in stream:
        digest.update(line)
        row = json.loads(line)
        ident = row['type'], row['id']
        assert ident not in seen and ident in original
        seen.add(ident)
        t = original[ident]
        assert all(t[k] == v for k, v in row['tags'].items())
        assert row['field_verified'] is False and row['routing_eligible'] is False
        objects[row['type']] += 1
        for key, tag, numeric in [('width', 'width', 'meters'), ('kerb_height', 'kerb:height', 'meters'), ('incline', 'incline', 'value')]:
            value = row[key]
            assert value['raw'] == t.get(tag)
            if tag not in t:
                assert value['state'] == 'missing' and value[numeric] is None
            if value[numeric] is not None:
                assert value['state'] == 'registered_numeric' and math.isfinite(value[numeric])
            if row['type'] == 'way':
                way_counts[key][value['state']] += 1
            else:
                node_counts[key][value['state']] += 1
        if row['type'] == 'way':
            feet[row['foot_rule']['state']] += 1
            wheels[row['wheelchair_rule']] += 1
        else:
            node_counts['wheelchair_rule'][row['wheelchair_rule']] += 1
            node_raw_presence.update(k for k in t if k in ['kerb', 'kerb:height', 'width', 'incline', 'wheelchair'])
assert seen == set(original) and len(seen) == report['rows']
assert dict(objects) == report['objects'] and dict(feet) == report['foot_rules'] and dict(wheels) == report['wheelchair_rules']
assert all(dict(v) == report[k] for k, v in way_counts.items())
assert digest.hexdigest() == report['output']['uncompressed_sha256']
repo = root.parents[2]
assert not subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=MDTUXB', '1030164d7e2ec5878340e7326f79af58ea59fc4d', '--', 'research'], cwd=repo).strip()
validation = {'pass': True, 'rows': len(seen), 'source_highway_ways': objects['way'], 'relevant_road_reference_nodes': objects['node'],
              'all_source_objects_covered_once': True, 'input_and_output_hashes_verified': True,
              'missing_attributes_remain_null': True, 'source_tag_values_preserved': True,
              'node_attribute_inventory': {k: dict(v) for k, v in node_counts.items()}, 'node_raw_tag_presence': dict(node_raw_presence),
              'prior_tracked_research_unchanged': True, 'field_verified': False, 'routing_eligible': False, 'new_slope_values_promoted': 0}
(root/'validation.json').write_text(json.dumps(validation, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(validation, ensure_ascii=False, indent=2))
