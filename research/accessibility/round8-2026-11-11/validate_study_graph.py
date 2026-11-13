"""Independent source conservation/geometry checks and dictionary components."""
from pathlib import Path
import collections
import gzip
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
report = json.loads((root/'study-graph-v2-results.json').read_bytes())
previous = root.parent/'round5-2026-11-11'
raw = (previous/'derived/study-map.json.gz').read_bytes()
assert hashlib.sha256(raw).hexdigest() == report['input_study_sha256']
data = json.loads(gzip.decompress(raw))
nodes = {n['id']: n for n in data['elements'] if n['type'] == 'node'}
ways = {w['id']: w for w in data['elements'] if w['type'] == 'way'}
way_ordinals = {ident: i for i, ident in enumerate(ways)}
del raw, data
recovery = json.loads((root.parent/'round7-2026-11-11/node-recovery-results.json').read_bytes())
source_nodes = root.parent/'round7-2026-11-11'/recovery['output']['path']
assert hashlib.sha256(source_nodes.read_bytes()).hexdigest() == report['input_recovered_nodes_sha256']
with gzip.open(source_nodes, 'rt') as stream:
    for line in stream:
        n = json.loads(line)
        assert [n['lon'], n['lat']] == [nodes[n['id']]['lon'], nodes[n['id']]['lat']]
        nodes[n['id']] = n

def rows(name):
    path = root/report['output_directory']/name
    assert hashlib.sha256(path.read_bytes()).hexdigest() == report['outputs'][name]['sha256']
    digest = hashlib.sha256()
    with gzip.open(path, 'rb') as stream:
        for line in stream:
            digest.update(line)
            yield json.loads(line)
    assert digest.hexdigest() == report['outputs'][name]['uncompressed_sha256']

def key(way, part):
    assert 0 <= part < len(ways[way]['nodes'])-1 and part < 2**32
    return (way_ordinals[way] << 32) | part

excluded_ways, excluded_parts = set(), set()
for item in rows('exclusions.ndjson.gz'):
    assert item['reasons']
    if item['type'] == 'way':
        assert item['id'] in ways and item['id'] not in excluded_ways
        assert item['source_tags'] == ways[item['id']]['tags']
        excluded_ways.add(item['id'])
    else:
        k = key(item['way_id'], item['part'])
        assert k not in excluded_parts
        assert item['node_ids'] == ways[item['way_id']]['nodes'][item['part']:item['part']+2]
        excluded_parts.add(k)
parent, sizes = {}, {}

def find(ident):
    if ident not in parent:
        parent[ident] = ident
        sizes[ident] = 1
    current = ident
    while current != parent[current]:
        current = parent[current]
    while ident != current:
        nxt = parent[ident]
        parent[ident] = current
        ident = nxt
    return current

seen = set()
for item in rows('candidate-segments.ndjson.gz'):
    w = ways[item['way_id']]
    k = key(w['id'], item['part'])
    assert k not in seen and k not in excluded_parts and w['id'] not in excluded_ways
    seen.add(k)
    assert item['node_ids'] == w['nodes'][item['part']:item['part']+2]
    a, b = item['node_ids']
    assert a != b
    expected = [[nodes[ident]['lon'], nodes[ident]['lat']] for ident in [a, b]]
    assert item['coordinates'] == expected and expected[0] != expected[1]
    assert item['node_wheelchair_tags'] == [nodes[ident].get('tags', {}).get('wheelchair') for ident in [a, b]]
    assert item['source_incline_raw'] == w['tags'].get('incline') and item['wheelchair_tag'] == w['tags'].get('wheelchair')
    assert item['highway'] == w['tags']['highway'] and item['steps'] == (w['tags']['highway'] == 'steps')
    assert item['field_verified'] is False and item['routing_eligible'] is False
    assert not any(k in item for k in ['weight', 'slope', 'grade', 'accessible'])
    if w['tags']['highway'] == 'cycleway':
        assert w['tags'].get('foot') in ['yes', 'designated', 'permissive', 'official']
    for ident in [a, b]:
        tags = nodes[ident].get('tags', {})
        assert tags.get('barrier') in [None, 'no'] and tags.get('highway') != 'elevator'
        assert tags.get('layer', '0') == '0' and tags.get('level') in [None, '0']
    x, y = find(a), find(b)
    if x != y:
        if sizes[x] < sizes[y]:
            x, y = y, x
        parent[y] = x
        sizes[x] += sizes.pop(y)
assert len(seen) == report['counts']['candidate_segments']
assert len(excluded_ways) == report['counts']['excluded_ways'] and len(excluded_parts) == report['counts']['excluded_node_incident_segments']
for w in ways.values():
    if w['id'] in excluded_ways:
        continue
    for i, (a, b) in enumerate(zip(w['nodes'], w['nodes'][1:])):
        if a == b or [nodes[a]['lon'], nodes[a]['lat']] == [nodes[b]['lon'], nodes[b]['lat']]:
            continue
        assert key(w['id'], i) in seen or key(w['id'], i) in excluded_parts, 'Original segment silently lost'
assert len(parent) == report['used_nodes'] and len(sizes) == report['components']
assert sorted(sizes.values(), reverse=True)[:20] == report['largest_components_nodes']
repo = root.parents[2]
assert not subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=MDTUXB', '22cd46c8506bf31979bb998d40f5c3357e89b076', '--', 'research'], cwd=repo).strip()
result = {'pass': True, 'policy_version': 2, 'source_ways': len(ways), 'source_nodes': len(nodes),
          'candidate_segments_checked': len(seen), 'excluded_ways_checked': len(excluded_ways), 'excluded_node_segments_checked': len(excluded_parts),
          'used_nodes': len(parent), 'independently_counted_components': len(sizes), 'original_coordinates_and_node_order_preserved': True,
          'no_invented_joins_or_weights': True, 'all_non_degenerate_source_segments_accounted_for': True,
          'prior_research_unchanged': True, 'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False, 'new_slope_values_promoted': 0}
(root/'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
