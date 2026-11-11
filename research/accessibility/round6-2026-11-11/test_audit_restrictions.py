"""Topology is a review signal, never a pedestrian or accessibility permit."""
from copy import deepcopy
from audit_restrictions import audit_relation

ways = {10: {'nodes': [1, 2], 'tags': {'highway': 'footway', 'layer': '0'}},
        11: {'nodes': [2, 3], 'tags': {'highway': 'footway', 'layer': '1'}},
        12: {'nodes': [3, 4], 'tags': {'foot': 'no'}},
        13: {'nodes': [8, 9], 'tags': {}},
        14: {'nodes': [1, 2, 3], 'tags': {'access': 'private'}}}
nodes = set(range(1, 10))
relation = {'id': 100, 'tags': {'type': 'restriction', 'restriction': 'no_left_turn'},
            'members': [{'type': 'w', 'ref': 10, 'role': 'from'},
                        {'type': 'n', 'ref': 2, 'role': 'via'},
                        {'type': 'w', 'ref': 11, 'role': 'to'}]}
original = deepcopy(relation)
plain = audit_relation(relation, ways, nodes)
assert plain['topology'] == 'shared_endpoint_node' and not plain['structural_flags']
assert plain['pedestrian_scope'] == 'unspecified_pedestrian_scope'
assert not plain['routing_eligible'] and not plain['field_verified']
assert plain['member_way_context'][1]['tags']['layer'] == '1'
assert relation == original

foot = deepcopy(relation)
foot['tags'].update({'restriction:foot:conditional': 'no_left_turn @ (Mo-Fr)', 'except': 'bus; foot'})
reviewed = audit_relation(foot, ways, nodes)
assert reviewed['pedestrian_scope'] == 'explicit_foot_tag'
assert reviewed['except_modes'] == ['bus', 'foot'] and reviewed['conditional_keys'] == ['restriction:foot:conditional']
assert not reviewed['routing_eligible']  # no conditional evaluation or permission

bad = deepcopy(relation)
bad['members'][2]['ref'] = 999
assert 'unresolved_member' in audit_relation(bad, ways, nodes)['structural_flags']
bad['members'][2]['ref'] = 13
assert 'via_node_not_on_from_or_to' in audit_relation(bad, ways, nodes)['structural_flags']
bad['members'][2]['ref'] = 14
assert 'via_node_requires_way_split' in audit_relation(bad, ways, nodes)['structural_flags']
bad['members'][1]['role'] = 'via@(8:00-9:00)'
flags = audit_relation(bad, ways, nodes)['structural_flags']
assert 'unsupported_member_role' in flags and 'missing_via_role' in flags

chain = deepcopy(relation)
chain['members'][1] = {'type': 'w', 'ref': 11, 'role': 'via'}
chain['members'][2]['ref'] = 12
assert audit_relation(chain, ways, nodes)['topology'] == 'shared_node_way_chain'
chain['members'][2]['ref'] = 13
assert 'via_way_chain_disconnected' in audit_relation(chain, ways, nodes)['structural_flags']
chain['members'].pop()
assert 'missing_to_role' in audit_relation(chain, ways, nodes)['structural_flags']
print('PASS: missing roles/references, interior splits, disjoint via ways, conditional/except foot, layer context, immutable input, no permission inference')
