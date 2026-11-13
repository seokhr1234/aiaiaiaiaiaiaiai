"""No connection across invented coordinates, permissions, barriers or levels."""
from copy import deepcopy
from build_study_graph import build, way_exclusions, node_exclusions

def node(ident, tags=None):
    return {'type': 'node', 'id': ident, 'lat': 37.6, 'lon': 127+ident*.001, 'tags': tags or {}}

def way(ident, refs, tags=None):
    return {'type': 'way', 'id': ident, 'nodes': refs, 'tags': {'highway': 'footway', **(tags or {})}}

assert not way_exclusions({'highway': 'footway', 'access': 'private', 'foot': 'yes'})
assert way_exclusions({'highway': 'footway', 'access': 'yes', 'foot': 'no'})
assert way_exclusions({'highway': 'cycleway', 'access': 'yes'})
assert not way_exclusions({'highway': 'cycleway', 'foot': 'yes'})
assert way_exclusions({'highway': 'footway', 'foot': 'use_sidepath'})
assert way_exclusions({'highway': 'footway', 'access:conditional': 'no @ (night)'})
assert way_exclusions({'highway': 'footway', 'oneway:foot': 'yes'})
assert not way_exclusions({'highway': 'footway', 'oneway': 'yes'})
assert way_exclusions({'highway': 'footway', 'area': 'yes'})
for tags in [{'barrier': 'kerb', 'kerb': 'lowered'}, {'barrier': 'gate', 'foot': 'yes'}, {'foot': 'no'},
             {'highway': 'elevator'}, {'layer': '-1'}, {'bridge': 'yes'}, {'indoor': 'yes'}, {'location': 'underground'}]:
    assert node_exclusions(tags)
assert not node_exclusions({'access': 'private', 'foot': 'yes', 'barrier': 'no'})
nodes = {i: node(i) for i in range(1, 9)}
nodes[3]['tags'] = {'barrier': 'bollard'}
nodes[5]['lon'] = nodes[1]['lon']  # equal coordinates, distinct IDs must not join
nodes[6]['tags'] = {'wheelchair': 'no'}
ways = [way(10, [1, 2, 3, 4]), way(11, [5, 6]), way(12, [7, 8], {'bridge': 'yes'})]
before = deepcopy((nodes, ways))
edges, excluded = [], []
result = build(nodes, ways, edges.append, excluded.append)
assert len(edges) == 2 and result['components'] == 2 and result['used_nodes'] == 4
assert edges[1]['node_wheelchair_tags'] == [None, 'no']
assert result['counts']['excluded_node_incident_segments'] == 2 and result['counts']['excluded_ways'] == 1
assert all(not row['field_verified'] and not row['routing_eligible'] for row in edges)
assert (nodes, ways) == before
for invalid in [[way(99, [1, 999])], [ways[0], ways[0]]]:
    emitted = []
    try:
        build(nodes, invalid, emitted.append, lambda row: None)
    except ValueError:
        assert not emitted
    else:
        raise AssertionError('Missing node or duplicate way must not create a partial success')
print('PASS: no coordinate snapping or barrier/layer bridge, explicit foot on cycleways, condition/direction holds, original wheelchair tags, immutable source, missing/duplicate input rejection')
