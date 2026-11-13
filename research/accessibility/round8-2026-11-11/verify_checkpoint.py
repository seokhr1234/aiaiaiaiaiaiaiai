"""Preserve all earlier research/products and bind both draft generations."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
repo = root.parents[2]
baseline = '22cd46c8506bf31979bb998d40f5c3357e89b076'
git = lambda *args: subprocess.check_output(['git', *args], cwd=repo)
read = lambda p: json.loads(p.read_bytes())
product_paths = ['donghaeng-nav/dist', 'donghaeng-nav/services', 'donghaeng-nav/server.mjs', 'api', 'vercel.json', 'server.mjs', '동행길-최종.html', '동행길-시연.html', '동행길-전달용.html', '이동약자-내비게이션-실행패키지']
assert not git('diff', '--name-only', baseline, '--', *product_paths).strip()
assert not git('diff', '--name-only', '--diff-filter=MDTUXB', baseline, '--', 'research').strip()
assert (repo/'수정이력.md').read_bytes().startswith(git('show', baseline+':수정이력.md'))
for report_name, folder in [('study-graph-results.json', 'derived'), ('study-graph-v2-results.json', 'derived-v2')]:
    report = read(root/report_name)
    for name, expected in report['outputs'].items():
        path = root/folder/name
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected['sha256']
        digest = hashlib.sha256()
        with gzip.open(path, 'rb') as stream:
            while chunk := stream.read(1024*1024):
                digest.update(chunk)
        assert digest.hexdigest() == expected['uncompressed_sha256']
    assert report['active_runtime_replaced'] is False and report['field_verified'] is False
    assert report['new_slope_values_promoted'] == report['coordinate_snaps_added'] == report['weights_added'] == 0
review = read(root/'v1-review-findings.json')
assert review['status'] == 'provisional_superseded_by_v2'
assert hashlib.sha256((root/review['source_script_local_archive']).read_bytes()).hexdigest() == review['source_script_sha256']
validation = read(root/'validation.json')
assert validation['pass'] and validation['policy_version'] == 2
result = {'pass': True, 'baseline_commit': baseline, 'reviewed_date_kst': '2026-11-11',
          'all_prior_tracked_research_preserved': True, 'product_sources_and_runtime_data_and_five_html_unchanged': True,
          'prior_history_bytes_preserved': True, 'v1_draft_artifacts_and_source_archive_preserved': True,
          'v2_candidate_segments_validated': validation['candidate_segments_checked'],
          'independent_component_count': validation['independently_counted_components'],
          'both_generation_artifact_hashes_verified': True, 'active_runtime_replaced': False,
          'field_verified': False, 'new_slope_values_promoted': 0, 'citywide_routing': False}
(root/'checkpoint-integrity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
