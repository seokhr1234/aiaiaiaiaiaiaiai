"""Audit relevant nodes from the full same-PBF road-node tag recovery."""
from pathlib import Path
import collections
import gzip
import hashlib
import json
from audit_walking_tags import audit

root = Path(__file__).resolve().parent
source_report = json.loads((root/'node-recovery-results.json').read_bytes())
source = root/source_report['output']['path']
target = root/'derived/recovered-node-audit.ndjson.gz'
assert not target.exists() and not (root/'recovered-node-audit-results.json').exists(), 'Preserve previous audit'
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_report['output']['sha256']
contexts, states, raw_presence = collections.Counter(), {k: collections.Counter() for k in ['foot_rule', 'wheelchair_rule', 'width', 'kerb_height', 'incline', 'review_flags']}, collections.Counter()
source_digest, output_digest = hashlib.sha256(), hashlib.sha256()
rows = total = 0
with gzip.open(source, 'rb') as incoming, target.open('wb') as stream, gzip.GzipFile(fileobj=stream, mode='wb', mtime=0, filename='', compresslevel=6) as outgoing:
    for line in incoming:
        source_digest.update(line)
        item = json.loads(line)
        total += 1
        tags = item['tags']
        selected = [k for k, yes in [('barrier', bool(tags.get('barrier'))), ('crossing', tags.get('highway') == 'crossing'),
                                     ('elevator', tags.get('highway') == 'elevator'), ('entrance', bool(tags.get('entrance'))),
                                     ('kerb', 'kerb' in tags or 'kerb:height' in tags)] if yes]
        if not selected:
            continue
        contexts.update(selected)
        raw_presence.update(k for k in tags if k in ['foot', 'access', 'width', 'kerb', 'kerb:height', 'incline', 'wheelchair'])
        result = audit(item)
        for key in ['foot_rule', 'width', 'kerb_height', 'incline']:
            states[key][result[key]['state']] += 1
        states['wheelchair_rule'][result['wheelchair_rule']] += 1
        states['review_flags'].update(result['review_flags'])
        rendered = (json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
        outgoing.write(rendered)
        output_digest.update(rendered)
        rows += 1
assert total == source_report['tagged_nodes_emitted'] and source_digest.hexdigest() == source_report['output']['uncompressed_sha256']
report = {'reviewed_date_kst': '2026-11-11', 'source_as_of': source_report['source_as_of'],
          'scope': 'All original road-reference nodes inspected in the same PBF; only barrier/crossing/elevator/entrance/kerb nodes audited here',
          'source_pbf_sha256': source_report['source_pbf_sha256'], 'source_crs': 'EPSG:4326', 'vertical_datum': None,
          'road_nodes_checked': source_report['road_nodes_found'], 'tagged_road_nodes': total, 'relevant_nodes': rows,
          'node_context': dict(contexts), 'raw_tag_presence': dict(raw_presence), **{k: dict(v) for k, v in states.items()},
          'input_sha256': source_report['output']['sha256'],
          'output': {'path': 'derived/recovered-node-audit.ndjson.gz', 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                     'uncompressed_sha256': output_digest.hexdigest(), 'bytes': target.stat().st_size},
          'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False, 'new_slope_values_promoted': 0,
          'notice': 'Supersedes the intermediate node-only inventory, not the fully preserved way-tag counts. Physical passage and live elevator operation remain unverified.'}
(root/'recovered-node-audit-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
