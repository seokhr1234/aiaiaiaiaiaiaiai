"""Permission evidence and physical uncertainty must remain separate."""
from copy import deepcopy
from audit_walking_tags import audit, incline_tag, length_tag, permission_tags

assert permission_tags({'access': 'no', 'foot': 'yes'})['state'] == 'positive_tag'
assert permission_tags({'access': 'yes', 'foot': 'no'})['state'] == 'denied_tag'
assert permission_tags({'access': 'private'})['state'] == 'limited_tag'
assert permission_tags({'foot': 'use_sidepath'})['state'] == 'sidepath_tag'
assert permission_tags({'foot': 'yes?', 'access': 'yes'})['state'] == 'unknown_tag_value'
assert permission_tags({'oneway': 'yes'})['state'] == 'no_registered_rule'
assert not permission_tags({'oneway': 'yes'})['directional_keys']
assert permission_tags({'oneway:foot': 'yes'})['requires_conditional_or_direction_review']
assert permission_tags({'foot': 'yes', 'access:conditional': 'no @ (night)'})['requires_conditional_or_direction_review']
assert length_tag(None)['meters'] is None
assert length_tag('unknown')['meters'] is None
assert length_tag('-1')['state'] == 'invalid'
assert length_tag('90 cm')['meters'] == .9
assert length_tag('900 mm')['meters'] == .9
assert length_tag('0')['meters'] == 0  # a registered zero remains distinct from missing
assert length_tag('1.2-1.8')['state'] == 'unparsed'
assert length_tag('3 feet')['state'] == 'unparsed'
assert incline_tag(None)['value'] is None
assert incline_tag('up')['value'] is None and incline_tag('down')['state'] == 'direction_only'
assert incline_tag('-5%')['value'] == -5 and incline_tag('-5%')['unit'] == 'percent'
assert incline_tag('3°')['value'] == 3 and incline_tag('3°')['unit'] == 'degrees'
assert incline_tag('5')['unit'] == 'unspecified'  # no invented physical measurement/unit
assert incline_tag('NaN')['value'] is None and incline_tag('6;8%')['value'] is None
source = {'type': 'way', 'id': 1, 'nodes': [1, 2], 'tags': {'highway': 'steps', 'wheelchair': 'yes', 'foot': 'no', 'bridge': 'yes'}}
before = deepcopy(source)
result = audit(source)
assert result['foot_rule']['state'] == 'denied_tag'
assert 'steps_and_wheelchair_positive_tag_requires_review' in result['review_flags']
assert result['width']['meters'] is None and result['incline']['value'] is None
assert not result['field_verified'] and not result['routing_eligible']
assert source == before
print('PASS: specific/generic tag claims, no vehicle one-way inference, conditions/directions held for review, missing vs zero, units/signs/ranges, conflicting steps tags, immutable input and no promotion')
