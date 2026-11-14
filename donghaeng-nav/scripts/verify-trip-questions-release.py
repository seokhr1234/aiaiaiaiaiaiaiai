"""Verify the whole-journey handoff against 10ad62a; preserve all prior evidence."""
from pathlib import Path
import base64
import gzip
import hashlib
import importlib.util
import json
import re
import subprocess
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'donghaeng-nav/dist'
OLD = '10ad62a'
sha = lambda raw: hashlib.sha256(raw).hexdigest()
read = lambda path: json.loads(path.read_bytes())
git = lambda *args: subprocess.check_output(['git', *args], cwd=ROOT)
original = lambda name: git('show', OLD + ':' + name)
lock = read(BASE / 'runtime-integrity.json')
old_lock = json.loads(original('donghaeng-nav/dist/runtime-integrity.json'))
assert lock['data'] == old_lock['data']
revision=lock['code_revision']
while revision != old_lock['code_revision'] and 'previous_revision' in revision:
    revision=revision['previous_revision']
assert revision == old_lock['code_revision']
for item in lock['data']:
    name = 'donghaeng-nav/dist/' + item['path']
    raw = (ROOT / name).read_bytes()
    assert raw == original(name) and sha(raw) == item['sha256']
    packed = (ROOT / (name + '.gz')).read_bytes()
    assert packed == original(name + '.gz') and gzip.decompress(packed) == raw
changed = []
for name, digest in lock['protected_code'].items():
    assert sha((BASE / name).read_bytes()) == digest
    if old_lock['protected_code'].get(name) != digest:
        changed.append(name)
assert set(changed) == {'app.js','transit-ui.js','transit-walk-review.js','journey-review.js','precision-map.js','trip-questions.js'}
services_path = ROOT / 'donghaeng-nav/services/service-integrity.json'
services = read(services_path)
old_services = json.loads(original('donghaeng-nav/services/service-integrity.json'))
for group in ['review_assets', 'city_assets']:
    assert services[group] == old_services[group]
    for name in services[group]:
        assert (ROOT / name).read_bytes() == original(name)
for name, digest in {**services['files'], **services['review_assets'], **services['city_assets']}.items():
    assert sha((ROOT / name).read_bytes()) == digest, name
assert not git('diff', '--name-only', OLD, '--', 'research').strip()
assert (ROOT / '수정이력.md').read_bytes().startswith(original('수정이력.md'))
assert not git('diff', '--diff-filter=D', '--name-only', OLD).strip()
assert not (ROOT / 'dist').exists()
build = read(ROOT / 'donghaeng-nav/docs/final-build.json')
assert build['expansion']['service_integrity_sha256'] == sha(services_path.read_bytes())
assert build['transit_main']['walking_time_comparison']
assert build['transit_main']['whole_journey_review'] and build['transit_main']['offline_transit_provider']
assert build['transit_main']['operational_timetable_configured'] is False
assert build['transit_main']['timetable_verified'] is False
assert build['transit_main']['full_ui_optimization_deferred'] is True
htmls = [ROOT / ('동행길-' + n + '.html') for n in ['최종', '시연', '전달용']]
package = ROOT / '이동약자-내비게이션-실행패키지'
htmls += [p for p in package.glob('*.html') if unicodedata.normalize('NFC', p.name) in ['휴대폰용.html', '컴퓨터용.html']]
assert len(htmls) == 5 and all(sha(p.read_bytes()) == build['html_sha256'] for p in htmls)
html = htmls[0].read_text()
for item in lock['data']:
    match = re.search(r'<script id="' + re.escape(item['id']) + r'"[^>]*>([^<]+)</script>', html)
    assert match and base64.b64decode(match[1]) == (BASE / (item['path'] + '.gz')).read_bytes()
names = {unicodedata.normalize('NFC', p.name): p for p in package.iterdir()}
for line in (package / 'SHA256SUMS.txt').read_text().splitlines():
    digest, name = line.split('  ', 1)
    assert sha(names[unicodedata.normalize('NFC', name)].read_bytes()) == digest
reports = ['trip-questions-ui-results','trip-questions-bundle-ui-results','compact-ui-results','compact-bundle-ui-results','journey-offline-core-results','transit-live-journey-results','transit-timing-core-results', 'expansion-core-results', 'transit-main-core-results',
           'transit-edge-results', 'transit-vercel-results', 'transit-walk-review-core-results',
           'transit-walk-review-ui-results', 'transit-walk-review-bundle-ui-results',
           'vercel-api-results', 'city-walk-api-results']
for name in reports:
    assert read(ROOT / ('donghaeng-nav/docs/' + name + '.json'))['pass'], name
# Verify the build's reuse and corruption-recovery branches in temporary data.
spec = importlib.util.spec_from_file_location('html_build', ROOT / 'donghaeng-nav/scripts/build-html.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as tmp:
    module.BASE = Path(tmp)
    (module.BASE / 'sample.json').write_bytes(b'{"test":1}')
    packed = gzip.compress(b'{"test":1}', mtime=123)
    (module.BASE / 'sample.json.gz').write_bytes(packed)
    assert module.packed_data('sample.json') == packed
    (module.BASE / 'sample.json.gz').write_bytes(b'invalid gzip')
    assert gzip.decompress(module.packed_data('sample.json')) == b'{"test":1}'
result = {'pass': True, 'checkedDateKst': '2026-11-14', 'baseline': OLD,
          'originalDataFilesByteIdentical': 9, 'originalGzipFilesByteIdentical': 9,
          'changedProtectedCode': changed, 'researchAndPriorHistoryPreserved': True,
          'reviewAndCityAssetsByteIdentical': True, 'deletedTrackedFiles': 0,
          'fiveHtmlSameBuild': True, 'embeddedPackedDataByteIdentical': True,
          'compressedReuseAndCorruptRecovery': True, 'htmlSha256': build['html_sha256'],
          'reports': reports, 'actualProviderCallsThisUiChange':0,'actualProviderCalls': 2, 'actualProviderSuccesses':2, 'actualTimetableData': False,
          'committed': False, 'pushed': False, 'deployed': False, 'fieldVerified': False,
          'fullUiOptimizationDeferred': True}
(ROOT / 'donghaeng-nav/docs/trip-questions-release-integrity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
