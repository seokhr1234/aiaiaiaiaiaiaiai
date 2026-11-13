"""Weight-free surface topology for review; never an activated routing graph.

Uses only original listed node IDs. No coordinate snapping, fabricated crossings,
building/level links, terrain weights or pedestrian permission defaults.
Candidate here means topology worth inspecting, not a right or safe way to walk.
"""
from array import array
from pathlib import Path
import collections
import gzip
import hashlib
import importlib.util
import json
import time

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent/'round5-2026-11-11'
NODES = ROOT.parent/'round7-2026-11-11'
spec = importlib.util.spec_from_file_location('walking_audit', NODES/'audit_walking_tags.py')
walking = importlib.util.module_from_spec(spec)
spec.loader.exec_module(walking)
LINEAR_REVIEW_TYPES = {'footway', 'path', 'pedestrian', 'residential', 'living_street', 'service', 'steps', 'unclassified', 'tertiary', 'secondary', 'primary', 'track', 'cycleway'}


def requires_structure_review(tags):
    return (tags.get('bridge') not in [None, 'no'] or tags.get('tunnel') not in [None, 'no']
            or tags.get('layer', '0') != '0' or tags.get('level') not in [None, '0']
            or tags.get('indoor') not in [None, 'no'] or tags.get('location') not in [None, 'surface', 'outdoor', 'overground']
            or tags.get('conveying') not in [None, 'no'])


def way_exclusions(tags):
    reasons = []
    if tags.get('highway') not in LINEAR_REVIEW_TYPES:
        reasons.append('unsupported_road_type')
    if tags.get('area') == 'yes':
        reasons.append('area_not_linear')
    foot = walking.permission_tags(tags)
    if foot['state'] in ['denied_tag', 'limited_tag', 'sidepath_tag', 'unknown_tag_value']:
        reasons.append('foot_rule_requires_resolution')
    if foot['requires_conditional_or_direction_review']:
        reasons.append('conditional_or_direction_requires_resolution')
    if tags.get('highway') == 'cycleway' and tags.get('foot') not in walking.POSITIVE:
        reasons.append('cycleway_without_explicit_foot_tag')
    if requires_structure_review(tags):
        reasons.append('structure_level_or_mechanism_requires_resolution')
    return reasons


def node_exclusions(tags):
    reasons = []
    foot = walking.permission_tags(tags)
    if foot['state'] in ['denied_tag', 'limited_tag', 'sidepath_tag', 'unknown_tag_value']:
        reasons.append('node_foot_rule_requires_resolution')
    if foot['requires_conditional_or_direction_review']:
        reasons.append('node_conditional_or_direction_requires_resolution')
    if tags.get('barrier') not in [None, 'no']:
        reasons.append('barrier_passage_unverified')
    if tags.get('highway') == 'elevator' or requires_structure_review(tags):
        reasons.append('vertical_connection_unverified')
    return reasons


class Components:
    def __init__(self):
        self.index = {}
        self.parent = array('I')
        self.size = array('I')

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def add(self, ident):
        if ident not in self.index:
            i = len(self.parent)
            self.index[ident] = i
            self.parent.append(i)
            self.size.append(1)
        return self.index[ident]

    def join(self, a, b):
        x, y = self.find(self.add(a)), self.find(self.add(b))
        if x == y:
            return
        if self.size[x] < self.size[y]:
            x, y = y, x
        self.parent[y] = x
        self.size[x] += self.size[y]

    def summary(self):
        sizes = sorted((self.size[i] for i in range(len(self.parent)) if self.parent[i] == i), reverse=True)
        assert sum(sizes) == len(self.index)
        return {'used_nodes': len(self.index), 'components': len(sizes), 'largest_components_nodes': sizes[:20]}


def build(nodes, ways, emit_edge, emit_exclusion):
    components = Components()
    excluded_nodes = {ident: node_exclusions(n.get('tags', {})) for ident, n in nodes.items() if n.get('tags')}
    excluded_nodes = {ident: reasons for ident, reasons in excluded_nodes.items() if reasons}
    counts = collections.Counter()
    reason_counts = collections.Counter()
    seen = set()
    # Fail before writing a success result if any original reference is absent.
    for w in ways:
        if w['id'] in seen:
            raise ValueError('Duplicate way ID')
        seen.add(w['id'])
        if len(w['nodes']) < 2 or any(ident not in nodes for ident in w['nodes']):
            raise ValueError('Missing road node or malformed way')
    for w in ways:
        counts['source_ways'] += 1
        reasons = way_exclusions(w['tags'])
        if reasons:
            counts['excluded_ways'] += 1
            reason_counts.update(reasons)
            emit_exclusion({'type': 'way', 'id': w['id'], 'reasons': reasons, 'source_tags': w['tags']})
            continue
        included = False
        for i, (a, b) in enumerate(zip(w['nodes'], w['nodes'][1:])):
            if a == b:
                counts['degenerate_same_id_segments'] += 1
                continue
            blocked = sorted(set(excluded_nodes.get(a, [])+excluded_nodes.get(b, [])))
            if blocked:
                counts['excluded_node_incident_segments'] += 1
                reason_counts.update(blocked)
                emit_exclusion({'type': 'segment', 'way_id': w['id'], 'part': i, 'node_ids': [a, b], 'reasons': blocked})
                continue
            points = [[nodes[ident]['lon'], nodes[ident]['lat']] for ident in [a, b]]
            if points[0] == points[1]:
                counts['degenerate_same_coordinate_segments'] += 1
                continue
            components.join(a, b)
            foot = walking.permission_tags(w['tags'])
            emit_edge({'way_id': w['id'], 'part': i, 'node_ids': [a, b], 'coordinates': points,
                       'highway': w['tags']['highway'], 'foot_claim': foot['state'],
                       'steps': w['tags']['highway'] == 'steps', 'wheelchair_tag': w['tags'].get('wheelchair'),
                       'node_wheelchair_tags': [nodes[ident].get('tags', {}).get('wheelchair') for ident in [a, b]],
                       'source_incline_raw': w['tags'].get('incline'), 'field_verified': False, 'routing_eligible': False})
            counts['candidate_segments'] += 1
            included = True
        counts['ways_with_candidate_segments' if included else 'ways_without_remaining_segments'] += 1
    return {'counts': dict(counts), 'exclusion_reasons': dict(reason_counts), 'excluded_nodes': len(excluded_nodes), **components.summary()}


def main():
    out = ROOT/'derived-v2'
    out.mkdir(parents=True, exist_ok=False)
    extraction = json.loads((PREVIOUS/'osm-extract-results.json').read_bytes())
    recovery = json.loads((NODES/'node-recovery-results.json').read_bytes())
    source_path = PREVIOUS/'derived/study-map.json.gz'
    source = source_path.read_bytes()
    input_hash = hashlib.sha256(source).hexdigest()
    if input_hash != extraction['outputs']['study-map.json.gz']['sha256']:
        raise ValueError('Study artifact hash mismatch')
    data = json.loads(gzip.decompress(source))
    del source
    nodes = {n['id']: n for n in data['elements'] if n['type'] == 'node'}
    ways = [w for w in data['elements'] if w['type'] == 'way']
    del data
    recovered_path = NODES/recovery['output']['path']
    if hashlib.sha256(recovered_path.read_bytes()).hexdigest() != recovery['output']['sha256']:
        raise ValueError('Recovered node artifact hash mismatch')
    recovered_count = 0
    with gzip.open(recovered_path, 'rt') as stream:
        for line in stream:
            n = json.loads(line)
            if n['id'] not in nodes or [n['lon'], n['lat']] != [nodes[n['id']]['lon'], nodes[n['id']]['lat']]:
                raise ValueError('Recovered node mismatch')
            if nodes[n['id']].get('tags') and nodes[n['id']]['tags'] != n['tags']:
                raise ValueError('Original retained node tags changed')
            nodes[n['id']] = n
            recovered_count += 1
    assert recovered_count == recovery['tagged_nodes_emitted']
    started = time.monotonic()
    outputs = {}
    with gzip.GzipFile(filename=str(out/'candidate-segments.ndjson.gz'), mode='wb', mtime=0) as edges, gzip.GzipFile(filename=str(out/'exclusions.ndjson.gz'), mode='wb', mtime=0) as exclusions:
        edge_digest, exclusion_digest = hashlib.sha256(), hashlib.sha256()
        def emit(stream, digest, value):
            line = (json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
            stream.write(line)
            digest.update(line)
        result = build(nodes, ways, lambda row: emit(edges, edge_digest, row), lambda row: emit(exclusions, exclusion_digest, row))
    assert result['counts']['source_ways'] == extraction['ways']
    for name, digest in [('candidate-segments.ndjson.gz', edge_digest), ('exclusions.ndjson.gz', exclusion_digest)]:
        p = out/name
        outputs[name] = {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'uncompressed_sha256': digest.hexdigest(), 'bytes': p.stat().st_size}
    report = {'policy_version': 2, 'output_directory': 'derived-v2', 'reviewed_date_kst': '2026-11-11', 'original_collected_date_kst': '2026-11-11', 'source_as_of': extraction['source_as_of'],
              'source_url': extraction['source_url'], 'license': 'ODbL-1.0', 'source_crs': 'EPSG:4326', 'vertical_datum': None,
              'study_bbox': extraction['bbox'], 'source_pbf_sha256': extraction['source_sha256'], 'input_study_sha256': input_hash,
              'input_recovered_nodes_sha256': recovery['output']['sha256'], 'source_road_nodes': len(nodes),
              **result, 'outputs': outputs, 'elapsed_seconds': round(time.monotonic()-started, 2),
              'scope': 'Weight-free surface topology candidates from original way node IDs only; ground-truth and legal/default access unresolved',
              'weights_added': 0, 'coordinate_snaps_added': 0, 'inferred_crossings_added': 0, 'new_slope_values_promoted': 0,
              'generic_vehicle_turn_restrictions_applied_to_foot': False, 'structurally_flagged_restrictions_resolved': False,
              'active_runtime_replaced': False, 'field_verified': False, 'routing_eligible': False, 'citywide_routing': False}
    (ROOT/'study-graph-v2-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
