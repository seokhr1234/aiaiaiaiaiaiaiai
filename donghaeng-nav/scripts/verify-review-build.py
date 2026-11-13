"""Bind the display-only addition and confirm original graph/data/build safety."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import unicodedata

root = Path(__file__).resolve().parents[2]
base = root/'donghaeng-nav/dist'
baseline = '88b78a22647b192d81418567a572f66c6faabdb7'
read = lambda p: json.loads(p.read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
git = lambda *args: subprocess.check_output(['git', *args], cwd=root)
lock = read(base/'runtime-integrity.json')
assert (base/'runtime-integrity.json').read_bytes() == git('show', baseline+':donghaeng-nav/dist/runtime-integrity.json')
for d in lock['data']:
    path = base/d['path']
    raw = path.read_bytes()
    assert sha(raw) == d['sha256'] and raw == git('show', baseline+':'+str(path.relative_to(root)))
    assert gzip.decompress((base/(d['path']+'.gz')).read_bytes()) == raw
for name, expected in lock['protected_code'].items():
    assert sha((base/name).read_bytes()) == expected
services_path = root/'donghaeng-nav/services/service-integrity.json'
services = read(services_path)
for name, expected in {**services['files'], **services['review_assets']}.items():
    assert sha((root/name).read_bytes()) == expected
review = read(root/'donghaeng-nav/services/expansion/review-points-manifest.json')
review_raw = gzip.decompress((base/review['asset']['path']).read_bytes())
assert sha(review_raw) == review['asset']['uncompressed_sha256'] and review['records'] == len(json.loads(review_raw)['features'])
build = read(root/'donghaeng-nav/docs/final-build.json')
assert build['expansion']['service_code_files'] == len(services['files']) and build['expansion']['review_asset_files'] == len(services['review_assets'])
assert build['expansion']['service_integrity_sha256'] == sha(services_path.read_bytes())
assert build['expansion']['review_points']['dataset_version'] == review['dataset_version']
package = root/'이동약자-내비게이션-실행패키지'
htmls = [root/('동행길-'+name+'.html') for name in ['최종', '시연', '전달용']]
htmls.extend(p for p in package.glob('*.html') if unicodedata.normalize('NFC', p.name) in ['휴대폰용.html', '컴퓨터용.html'])
assert len(htmls) == 5 and all(sha(p.read_bytes()) == build['html_sha256'] for p in htmls)
for p in htmls:
    assert p.read_bytes() == git('show', baseline+':'+str(p.relative_to(root)))
names = {unicodedata.normalize('NFC', p.name): p for p in package.iterdir()}
for line in (package/'SHA256SUMS.txt').read_text().splitlines():
    expected, name = line.split('  ', 1)
    assert sha(names[unicodedata.normalize('NFC', name)].read_bytes()) == expected
assert not git('diff', '--name-only', baseline, '--', 'research').strip()
assert (root/'수정이력.md').read_bytes().startswith(git('show', baseline+':수정이력.md'))
reports = ['review-points-preparation', 'review-points-source-results', 'review-points-api-results', 'review-points-ui-results', 'review-points-bundle-results', 'review-points-boot-results', 'expansion-core-results', 'expansion-ui-results', 'vercel-api-results', 'transit-vercel-results']
for name in reports:
    assert read(root/('donghaeng-nav/docs/'+name+'.json'))['pass'], name
result = {'pass': True, 'verified_date_kst': '2026-11-13', 'baseline_commit': baseline,
          'original_nine_data_files_byte_identical': True, 'original_routing_integrity_record_byte_identical': True,
          'protected_runtime_files': len(lock['protected_code']), 'service_code_files': len(services['files']),
          'separately_verified_review_assets': len(services['review_assets']), 'review_records': review['records'],
          'five_html_rebuilt_and_byte_identical_to_previous': True, 'package_hashes_match': True,
          'prior_research_and_history_preserved': True, 'passing_reports': reports,
          'new_slope_values_promoted': 0, 'field_verified': False, 'active_graph_expanded': False,
          'actual_odsay_called': False, 'physical_phone_verified': False}
(root/'donghaeng-nav/docs/review-points-integrity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
