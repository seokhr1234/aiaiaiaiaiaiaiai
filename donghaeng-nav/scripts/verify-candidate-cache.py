"""Bind the cache optimization, preserved inputs, new build and validations."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import unicodedata

root = Path(__file__).resolve().parents[2]
base = root/'donghaeng-nav/dist'
baseline = '5d28dcc8875e08770fd9dba8b0780557b5f11f29'
sha = lambda data: hashlib.sha256(data).hexdigest()
read = lambda p: json.loads(p.read_bytes())
git = lambda *args: subprocess.check_output(['git', *args], cwd=root)
lock = read(base/'runtime-integrity.json')
old = json.loads(git('show', baseline+':donghaeng-nav/dist/runtime-integrity.json'))
assert lock['data'] == old['data']
for d in lock['data']:
    raw = (base/d['path']).read_bytes()
    assert sha(raw) == d['sha256'] and raw == git('show', baseline+':donghaeng-nav/dist/'+d['path'])
    assert gzip.decompress((base/(d['path']+'.gz')).read_bytes()) == raw
changed = []
for name, expected in lock['protected_code'].items():
    assert sha((base/name).read_bytes()) == expected
    if old['protected_code'][name] != expected:
        changed.append(name)
assert changed == ['route-candidates.js']
services_path = root/'donghaeng-nav/services/service-integrity.json'
services = read(services_path)
for name, expected in services['files'].items():
    assert sha((root/name).read_bytes()) == expected
manifest = read(root/'donghaeng-nav/docs/final-build.json')
assert manifest['expansion']['service_integrity_sha256'] == sha(services_path.read_bytes())
package = root/'이동약자-내비게이션-실행패키지'
htmls = [root/('동행길-'+suffix+'.html') for suffix in ['최종', '시연', '전달용']]
htmls.extend(p for p in package.glob('*.html') if unicodedata.normalize('NFC', p.name) in ['휴대폰용.html', '컴퓨터용.html'])
assert len(htmls) == 5 and all(sha(p.read_bytes()) == manifest['html_sha256'] for p in htmls)
names = {unicodedata.normalize('NFC', p.name): p for p in package.iterdir()}
for line in (package/'SHA256SUMS.txt').read_text().splitlines():
    expected, name = line.split('  ', 1)
    assert sha(names[unicodedata.normalize('NFC', name)].read_bytes()) == expected
assert not git('diff', '--name-only', baseline, '--', 'research').strip()
assert (root/'수정이력.md').read_bytes().startswith(git('show', baseline+':수정이력.md'))
prior_performance = root/'donghaeng-nav/docs/walk-api-local-performance.json'
assert prior_performance.read_bytes() == git('show', baseline+':donghaeng-nav/docs/walk-api-local-performance.json')
first, second = read(prior_performance), read(root/'donghaeng-nav/docs/walk-api-cache-performance.json')
assert first['pass'] and second['pass']
assert first['datasetVersion'] == second['datasetVersion'] and first['graphVersion'] == second['graphVersion']
assert [(s['nodeIds'], s['profileCase'], s['straightLineMeters']) for s in first['serialSamples']] == [(s['nodeIds'], s['profileCase'], s['straightLineMeters']) for s in second['serialSamples']]
assert [(s['status'], s['state']) for s in first['serialSamples']] == [(s['status'], s['state']) for s in second['serialSamples']]
assert second['protectedRuntimeCode'] == lock['protected_code']
reports = ['candidate-cache-results', 'route-choice-core-results', 'route-choice-real-results', 'route-choice-ui-results', 'expansion-core-results', 'main-navigation-results']
for name in reports:
    assert read(root/('donghaeng-nav/docs/'+name+'.json'))['pass']
result = {'pass': True, 'baseline_commit': baseline, 'changed_protected_runtime_files': changed,
          'original_datasets_byte_identical': len(lock['data']), 'protected_runtime_files': len(lock['protected_code']),
          'service_files_verified': len(services['files']), 'identical_html_files': len(htmls), 'html_sha256': manifest['html_sha256'],
          'package_hashes_match': True, 'all_prior_research_unchanged': True, 'prior_history_bytes_preserved': True,
          'prior_performance_bytes_preserved': True, 'same_100_public_node_pairs_and_profiles': True,
          'same_100_http_outcomes': True,
          'passing_reports': reports, 'field_verified': False, 'new_slope_values_promoted': 0, 'citywide_routing': False,
          'physical_gps_verified': False, 'actual_odsay_called': False}
(root/'donghaeng-nav/docs/candidate-cache-integrity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
