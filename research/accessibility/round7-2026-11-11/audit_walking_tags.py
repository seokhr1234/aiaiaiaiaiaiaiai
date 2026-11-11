"""Inventory OSM walking evidence without authorizing or promoting a graph.

Tag states describe registered claims, not physical or legal verification.
Missing widths/kerbs/slopes stay unknown. Numeric inclines are never converted
to measurements, terrain values or active route weights.
"""
from pathlib import Path
import collections
import gzip
import hashlib
import json
import math
import re

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent/'round5-2026-11-11'
CONTEXT = ['highway', 'area', 'foot', 'access', 'foot:conditional', 'access:conditional',
           'foot:forward', 'foot:backward', 'oneway', 'oneway:foot', 'wheelchair', 'wheelchair:conditional',
           'width', 'est_width', 'maxwidth:physical', 'kerb', 'kerb:height', 'incline', 'incline:forward', 'incline:backward',
           'surface', 'smoothness', 'sidewalk', 'sidewalk:left', 'sidewalk:right', 'crossing', 'crossing:signals',
           'tactile_paving', 'layer', 'level', 'bridge', 'tunnel', 'barrier', 'entrance', 'conveying', 'opening_hours']
POSITIVE = {'yes', 'designated', 'permissive', 'official'}
LIMITED = {'private', 'destination', 'customers', 'delivery', 'agricultural', 'forestry', 'permit'}


def length_tag(value):
    """Retain units and reject ranges/unfamiliar text instead of guessing."""
    if value is None:
        return {'state': 'missing', 'meters': None, 'raw': None}
    match = re.fullmatch(r'\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(m|cm|mm)?\s*', str(value))
    if not match:
        return {'state': 'unparsed', 'meters': None, 'raw': value}
    number = float(match[1])
    if not math.isfinite(number) or number < 0:
        return {'state': 'invalid', 'meters': None, 'raw': value}
    # OSM width/kerb:height convention: numbers without a suffix are metres.
    meters = number*{'m': 1, 'cm': .01, 'mm': .001, None: 1}[match[2]]
    return {'state': 'registered_numeric', 'meters': meters, 'raw': value,
            'unit_basis': 'explicit' if match[2] else 'osm_metric_tag_convention'}


def incline_tag(value):
    if value is None:
        return {'state': 'missing', 'value': None, 'unit': None, 'raw': None}
    if value in ['up', 'down']:
        return {'state': 'direction_only', 'value': None, 'unit': None, 'raw': value}
    match = re.fullmatch(r'\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(%|°)?\s*', str(value))
    if not match or not math.isfinite(float(match[1])):
        return {'state': 'unparsed', 'value': None, 'unit': None, 'raw': value}
    return {'state': 'registered_numeric', 'value': float(match[1]),
            'unit': {'%': 'percent', '°': 'degrees', None: 'unspecified'}[match[2]], 'raw': value}


def permission_tags(tags):
    # More specific foot is recorded before generic access. This is a tag
    # inventory, with conditions/directions held for review rather than executed.
    key = 'foot' if 'foot' in tags else 'access' if 'access' in tags else None
    raw = tags.get(key) if key else None
    state = ('no_registered_rule' if key is None else 'denied_tag' if raw == 'no'
             else 'sidepath_tag' if raw == 'use_sidepath' else 'limited_tag' if raw in LIMITED
             else 'positive_tag' if raw in POSITIVE else 'unknown_tag_value')
    conditional = [k for k in ['foot:conditional', 'access:conditional'] if k in tags]
    directional = [k for k in ['foot:forward', 'foot:backward', 'oneway:foot'] if k in tags]
    return {'state': state, 'selected_tag': key, 'raw': raw, 'conditional_keys': conditional,
            'directional_keys': directional, 'requires_conditional_or_direction_review': bool(conditional or directional)}


def audit(element):
    tags = element.get('tags', {})
    wheel = tags.get('wheelchair')
    wheelchair = ('denied_tag' if wheel == 'no' else 'limited_tag' if wheel == 'limited'
                  else 'positive_tag' if wheel in ['yes', 'designated'] else 'no_registered_rule' if wheel is None
                  else 'unknown_tag_value')
    flags = []
    if tags.get('area') == 'yes':
        flags.append('area_requires_separate_geometry_policy')
    if tags.get('highway') in ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed']:
        flags.append('road_type_requires_review')
    if tags.get('highway') == 'steps':
        flags.append('steps_in_source')
        if wheelchair == 'positive_tag':
            flags.append('steps_and_wheelchair_positive_tag_requires_review')
    if tags.get('highway') == 'elevator' or tags.get('conveying') in ['yes', 'forward', 'backward', 'reversible']:
        flags.append('vertical_or_mechanical_connection_unverified')
    if tags.get('barrier'):
        flags.append('barrier_passage_unverified')
    if tags.get('bridge') not in [None, 'no'] or tags.get('tunnel') not in [None, 'no'] or tags.get('level') is not None:
        flags.append('structure_or_level_requires_review')
    return {'type': element['type'], 'id': element['id'], 'tags': {k: tags[k] for k in CONTEXT if k in tags},
            'foot_rule': permission_tags(tags), 'wheelchair_rule': wheelchair,
            'width': length_tag(tags.get('width')), 'kerb_height': length_tag(tags.get('kerb:height')),
            'incline': incline_tag(tags.get('incline')), 'review_flags': flags,
            'field_verified': False, 'routing_eligible': False}


def main():
    out = ROOT/'derived'
    out.mkdir(parents=True, exist_ok=False)
    extraction = json.loads((PREVIOUS/'osm-extract-results.json').read_text())
    source = PREVIOUS/'derived/study-map.json.gz'
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != extraction['outputs']['study-map.json.gz']['sha256']:
        raise ValueError('Study source hash mismatch')
    data = json.loads(gzip.decompress(raw))
    del raw
    stats = {kind: collections.Counter() for kind in ['objects', 'foot_rules', 'wheelchair_rules', 'width', 'kerb_height', 'incline', 'review_flags', 'node_context']}
    tag_presence = collections.Counter()
    count = 0
    target = out/'walking-tag-audit.ndjson.gz'
    raw_sha = hashlib.sha256()
    with target.open('wb') as stream, gzip.GzipFile(fileobj=stream, mode='wb', mtime=0, filename='', compresslevel=6) as packed:
        for element in data['elements']:
            tags = element.get('tags', {})
            if element['type'] == 'way':
                if 'highway' not in tags:
                    continue
            elif element['type'] == 'node':
                contexts = [k for k, yes in [('barrier', bool(tags.get('barrier'))), ('crossing', tags.get('highway') == 'crossing'),
                                             ('elevator', tags.get('highway') == 'elevator'), ('entrance', bool(tags.get('entrance'))),
                                             ('kerb', 'kerb' in tags or 'kerb:height' in tags)] if yes]
                if not contexts:
                    continue
                stats['node_context'].update(contexts)
            else:
                continue
            result = audit(element)
            count += 1
            stats['objects'][element['type']] += 1
            if element['type'] == 'way':
                stats['foot_rules'][result['foot_rule']['state']] += 1
                stats['wheelchair_rules'][result['wheelchair_rule']] += 1
                for key in ['width', 'kerb_height', 'incline']:
                    stats[key][result[key]['state']] += 1
                stats['review_flags'].update(result['review_flags'])
                tag_presence.update(k for k in CONTEXT if k in tags)
                if result['foot_rule']['requires_conditional_or_direction_review']:
                    stats['review_flags']['foot_conditional_or_direction_requires_review'] += 1
            line = (json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
            packed.write(line)
            raw_sha.update(line)
    assert stats['objects']['way'] == extraction['ways']
    report = {'reviewed_date_kst': '2026-11-11', 'original_collected_date_kst': '2026-11-11',
              'source_as_of': extraction['source_as_of'], 'source_url': extraction['source_url'],
              'source_crs': 'EPSG:4326', 'vertical_datum': None, 'study_bbox': extraction['bbox'],
              'source_pbf_sha256': extraction['source_sha256'], 'input_sha256': digest,
              'scope': 'Only original study highway ways and relevant nodes; additional country-wide relation members are not citywide walking segments',
              **{k: dict(v) for k, v in stats.items()}, 'way_tag_presence': dict(tag_presence), 'rows': count,
              'output': {'path': 'derived/walking-tag-audit.ndjson.gz', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                         'uncompressed_sha256': raw_sha.hexdigest(), 'bytes': target.stat().st_size},
              'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False, 'new_slope_values_promoted': 0,
              'notice': 'Positive tags are registered claims only. Missing physical evidence stays unknown; no conditional/legal determination, new slope calculation, network connectivity or wheelchair passability is asserted.'}
    (ROOT/'walking-tag-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
