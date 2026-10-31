"""Build a lossless index of source references and local artifact hashes offline."""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
records = []
for area in ('terrain', 'sidewalk', 'entrances', 'crosscheck', 'integration'):
    path = ROOT / area / 'sources.json'
    content = json.loads(path.read_text())
    entries = content['sources'] if isinstance(content, dict) else content
    for entry in entries:
        status = next((entry[k] for k in (
            'evidence_status', 'access_status', 'acquisition_status', 'status'
        ) if entry.get(k)), 'unspecified')
        records.append({
            'area': area,
            'source_id': entry['id'],
            'title': entry.get('title'),
            'url': entry.get('url'),
            'status_as_recorded': status,
            'registry_path': str(path.relative_to(ROOT)),
            'original_record': entry,
        })

collection_log = ROOT / 'acquired-2026-10-31/request-log.json'
if collection_log.exists():
    for number, entry in enumerate(json.loads(collection_log.read_text()), 1):
        records.append({
            'area': 'resumed_collection',
            'source_id': f'request-{number}',
            'title': entry.get('name'),
            'url': entry.get('url'),
            'status_as_recorded': entry.get('classification', 'unspecified'),
            'registry_path': str(collection_log.relative_to(ROOT)),
            'original_record': entry,
            'raw_body_in_this_workspace': False,
        })

summary = {
    'reference_records': len(records),
    'distinct_exact_urls': len({r['url'] for r in records if r['url']}),
    'records_by_area': dict(Counter(r['area'] for r in records)),
    'recorded_status_counts': dict(Counter(r['status_as_recorded'] for r in records)),
    'note': 'Historical references and later collection requests are preserved together. Repeated URLs/requests are not independent confirmations or dataset counts. Uploaded request logs do not include remote raw response bodies. Use the current report and per-stage provenance.',
}
index = ROOT / 'source-index.json'
index.write_text(json.dumps({'summary': summary, 'records': records},
                           ensure_ascii=False, indent=2) + '\n')

manifest_path = ROOT / 'artifact-manifest.json'
artifacts = []
for path in sorted(ROOT.rglob('*')):
    if not path.is_file() or path == manifest_path:
        continue
    raw = path.read_bytes()
    if path.suffix in ('.json', '.geojson'):
        json.loads(raw)
    artifacts.append({'path': str(path.relative_to(ROOT)), 'bytes': len(raw),
                      'sha256': hashlib.sha256(raw).hexdigest()})
manifest_path.write_text(json.dumps({
    'scope': 'Local round2 artifacts; hashes do not imply remote raw-file acquisition or field verification.',
    'artifacts': artifacts,
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
print('Manifest artifacts:', len(artifacts))
