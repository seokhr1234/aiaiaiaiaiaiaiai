"""Verify the PostGIS/OSM checkpoint without changing source hashes or data."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
BASELINE = '9282ea656c3879ae097aa0622973137053ea2873'


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def read(name):
    return json.loads((ROOT/name).read_bytes())


def main():
    base = ROOT/'donghaeng-nav/dist'
    lock = read('donghaeng-nav/dist/runtime-integrity.json')
    services = read('donghaeng-nav/services/service-integrity.json')
    for item in lock['data']:
        path = base/item['path']
        raw = path.read_bytes()
        assert sha(raw) == item['sha256']
        assert raw == git('show', BASELINE+':'+str(path.relative_to(ROOT)))
        assert gzip.decompress((base/(item['path']+'.gz')).read_bytes()) == raw
    for name, expected in lock['protected_code'].items():
        assert sha((base/name).read_bytes()) == expected, name
    for name, expected in services['files'].items():
        assert sha((ROOT/name).read_bytes()) == expected, name
    manifest = read('donghaeng-nav/docs/final-build.json')
    assert manifest['expansion']['service_code_files'] == len(services['files'])
    assert manifest['expansion']['service_integrity_sha256'] == sha((ROOT/'donghaeng-nav/services/service-integrity.json').read_bytes())
    package = ROOT/'이동약자-내비게이션-실행패키지'
    htmls = [ROOT/('동행길-'+s+'.html') for s in ['최종', '시연', '전달용']]
    htmls.extend(p for p in package.glob('*.html') if unicodedata.normalize('NFC', p.name) in ['휴대폰용.html', '컴퓨터용.html'])
    assert len(htmls) == 5 and all(sha(p.read_bytes()) == manifest['html_sha256'] for p in htmls)
    names = {unicodedata.normalize('NFC', p.name): p for p in package.iterdir()}
    for line in (package/'SHA256SUMS.txt').read_text().splitlines():
        expected, name = line.split('  ', 1)
        assert sha(names[unicodedata.normalize('NFC', name)].read_bytes()) == expected
    assert not git('diff', '--name-only', '--diff-filter=MDTUXB', BASELINE, '--', 'research').strip(), 'Prior research must be preserved'
    assert (ROOT/'수정이력.md').read_bytes().startswith(git('show', BASELINE+':수정이력.md'))
    round6 = ROOT/'research/accessibility/round6-2026-11-11'
    resolution = json.loads((round6/'resolution-results.json').read_bytes())
    audit = json.loads((round6/'restriction-audit-results.json').read_bytes())
    for name, expected, unpacked in [('resolved-members.json.gz', resolution['output_sha256'], resolution['uncompressed_sha256']),
                                    ('restriction-audit.json.gz', audit['output']['sha256'], audit['output']['uncompressed_sha256'])]:
        raw = (round6/'derived'/name).read_bytes()
        assert sha(raw) == expected and sha(gzip.decompress(raw)) == unpacked
    source = ROOT/'research/accessibility/round5-2026-11-11/raw/osm-korea-261109-pbf/response.bin'
    with source.open('rb') as stream:
        state = hashlib.sha256()
        while chunk := stream.read(1024*1024):
            state.update(chunk)
        digest = state.hexdigest()
    assert digest == resolution['source_sha256']
    reports = ['postgis-api-results', 'postgis-ui-results', 'expansion-core-results', 'vercel-api-results']
    for report in reports:
        assert read('donghaeng-nav/docs/'+report+'.json')['pass'], report
    assert json.loads((round6/'validation.json').read_bytes())['pass']
    report = {'pass': True, 'baseline_commit': BASELINE, 'reviewed_date_kst': '2026-11-11',
              'original_datasets_byte_identical': len(lock['data']), 'runtime_protected_code': len(lock['protected_code']),
              'service_protected_files': len(services['files']), 'gzip_verified': len(lock['data']),
              'identical_html_files': len(htmls), 'html_sha256': manifest['html_sha256'], 'package_hashes_match': True,
              'prior_tracked_research_unchanged': True, 'prior_history_bytes_preserved': True,
              'same_pbf_sha256': digest, 'remaining_unresolved_relations': resolution['remaining_unresolved_relations_total'],
              'osm_restrictions_structurally_reviewed': audit['restrictions'],
              'osm_relations_with_structural_review_flags': audit['relations_with_structural_flags'],
              'passing_reports': reports, 'actual_odsay_key_used': False, 'production_database_connected': False,
              'active_runtime_graph_replaced': False, 'new_slope_values_promoted': 0,
              'field_verified': False, 'physical_gps_verified': False, 'citywide_routing': False}
    (ROOT/'donghaeng-nav/docs/postgis-followup-integrity.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
