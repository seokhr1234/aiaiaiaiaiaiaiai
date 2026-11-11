"""Structural review of retained OSM restrictions; no routing authorization.

Member recovery only resolves listed IDs. It cannot invent missing roles or a
discarded member, interpret a conditional restriction, or verify a crossing.
"""
from pathlib import Path
import collections
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent/'round5-2026-11-11'


def audit_relation(relation, ways, nodes):
    tags = relation['tags']
    members = relation['members']
    groups = {role: [m for m in members if m['role'] == role] for role in ['from', 'via', 'to']}
    flags = []
    if any(m['role'] not in groups for m in members):
        flags.append('unsupported_member_role')
    if any(m['type'] != 'w' for role in ['from', 'to'] for m in groups[role]):
        flags.append('unsupported_from_to_type')
    if any(m['type'] not in ['n', 'w'] for m in groups['via']):
        flags.append('unsupported_via_type')
    available = {'n': nodes, 'w': ways}
    missing = [m for m in members if m['type'] not in available or m['ref'] not in available[m['type']]]
    if missing:
        flags.append('unresolved_member')
    for role in ['from', 'via', 'to']:
        if not groups[role]:
            flags.append('missing_'+role+'_role')
    if len(groups['from']) > 1 or len(groups['to']) > 1:
        flags.append('multiple_from_or_to_requires_review')
    topology = 'not_checked'
    simple = (not flags and len(groups['from']) == len(groups['to']) == 1)
    via = groups['via']
    if simple and len(via) == 1 and via[0]['type'] == 'n':
        ident = via[0]['ref']
        endpoints = [ways[groups[role][0]['ref']]['nodes'] for role in ['from', 'to']]
        if any(ident not in ns for ns in endpoints):
            flags.append('via_node_not_on_from_or_to')
            topology = 'disconnected_by_node_id'
        elif any(ident not in [ns[0], ns[-1]] for ns in endpoints):
            flags.append('via_node_requires_way_split')
            topology = 'shared_interior_node'
        else:
            topology = 'shared_endpoint_node'
    elif simple and all(m['type'] == 'w' for m in via):
        chain = [groups['from'][0], *via, groups['to'][0]]
        ns = [ways[m['ref']]['nodes'] for m in chain]
        joins = [set(a) & set(b) for a, b in zip(ns, ns[1:])]
        if any(not j for j in joins):
            flags.append('via_way_chain_disconnected')
            topology = 'disconnected_by_node_id'
        elif any(len(j) != 1 for j in joins):
            flags.append('ambiguous_shared_nodes')
            topology = 'multiple_shared_nodes'
        else:
            junctions = [next(iter(j)) for j in joins]
            if any(junctions[i-1] == junctions[i] for i in range(1, len(junctions))):
                flags.append('via_way_same_entry_and_exit_node')
            if any(junctions[i] not in [ns[i][0], ns[i][-1]] or junctions[i] not in [ns[i+1][0], ns[i+1][-1]] for i in range(len(junctions))):
                flags.append('via_way_requires_way_split')
            topology = 'shared_node_way_chain'
    elif simple:
        flags.append('mixed_or_multiple_via_nodes')
    foot_keys = sorted(k for k in tags if k == 'restriction:foot' or k.startswith('restriction:foot:'))
    other_modes = sorted(k for k in tags if k.startswith('restriction:') and k not in foot_keys and k != 'restriction:conditional')
    scope = 'explicit_foot_tag' if foot_keys else 'other_mode_tag_only' if other_modes else 'unspecified_pedestrian_scope'
    condition_keys = sorted(k for k in tags if 'conditional' in k)
    except_modes = [part.strip() for part in tags.get('except', '').split(';') if part.strip()]
    context_keys = ['highway', 'foot', 'access', 'access:conditional', 'foot:conditional', 'layer', 'level', 'bridge', 'tunnel', 'wheelchair', 'barrier']
    context = [{'way_id': m['ref'], 'tags': {k: ways[m['ref']]['tags'][k] for k in context_keys if k in ways[m['ref']]['tags']}}
               for m in members if m['type'] == 'w' and m['ref'] in ways]
    return {'id': relation['id'], 'source_url': 'https://www.openstreetmap.org/relation/'+str(relation['id']),
            'source_tags': tags, 'role_counts': {k: len(v) for k, v in groups.items()},
            'structural_flags': flags, 'topology': topology, 'pedestrian_scope': scope,
            'foot_specific_keys': foot_keys, 'conditional_keys': condition_keys, 'except_modes': except_modes,
            'member_way_context': context, 'missing_members_count': len(missing),
            'routing_eligible': False, 'field_verified': False}


def load_verified(path, expected):
    packed = path.read_bytes()
    if hashlib.sha256(packed).hexdigest() != expected:
        raise ValueError('Input artifact hash mismatch: '+str(path))
    return json.loads(gzip.decompress(packed))


def main():
    out = ROOT/'derived/restriction-audit.json.gz'
    if out.exists():
        raise FileExistsError('Preserve previous audit output')
    extraction = json.loads((PREVIOUS/'osm-extract-results.json').read_text())
    relations_report = json.loads((PREVIOUS/'osm-relations-results.json').read_text())
    resolution = json.loads((ROOT/'resolution-results.json').read_text())
    inputs = {}
    ways, nodes, relations = {}, set(), {}
    for name, expected in [('study-map.json.gz', extraction['outputs']['study-map.json.gz']['sha256']),
                           ('study-context.json.gz', extraction['outputs']['study-context.json.gz']['sha256']),
                           ('study-relations.json.gz', relations_report['output_sha256']),
                           ('resolved-members.json.gz', resolution['output_sha256'])]:
        path = (ROOT if name == 'resolved-members.json.gz' else PREVIOUS)/'derived'/name
        data = load_verified(path, expected)
        inputs[str(path.relative_to(ROOT.parent))] = expected
        for item in data['elements']:
            if item['type'] == 'node':
                nodes.add(item['id'])
            elif item['type'] == 'way':
                ways[item['id']] = item
            elif item['type'] == 'relation':
                relations[item['id']] = item
        del data
    reviewed = [audit_relation(r, ways, nodes) for r in relations.values() if r['tags'].get('type') == 'restriction']
    raw = json.dumps({'relations': reviewed, 'field_verified': False, 'routing_eligible': False}, ensure_ascii=False, separators=(',', ':')).encode()
    packed = gzip.compress(raw, compresslevel=6, mtime=0)
    out.write_bytes(packed)
    report = {'reviewed_date_kst': '2026-11-11', 'source_as_of': resolution['source_as_of'],
              'source_pbf_sha256': resolution['source_sha256'], 'input_artifacts': inputs,
              'restrictions': len(reviewed),
              'listed_member_resolution_complete': sum(r['missing_members_count'] == 0 for r in reviewed),
              'structural_flags': dict(collections.Counter(flag for r in reviewed for flag in r['structural_flags'])),
              'relations_with_structural_flags': sum(bool(r['structural_flags']) for r in reviewed),
              'topology': dict(collections.Counter(r['topology'] for r in reviewed)),
              'pedestrian_scope': dict(collections.Counter(r['pedestrian_scope'] for r in reviewed)),
              'conditional_relations': sum(bool(r['conditional_keys']) for r in reviewed),
              'except_foot_relations': sum('foot' in r['except_modes'] for r in reviewed),
              'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False,
              'new_slope_values_promoted': 0,
              'output': {'path': 'derived/restriction-audit.json.gz', 'sha256': hashlib.sha256(packed).hexdigest(),
                         'uncompressed_sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(packed)},
              'notice': 'Resolving listed references does not reconstruct missing relation roles or establish pedestrian permission; node sharing does not verify layers or real passage'}
    (ROOT/'restriction-audit-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
