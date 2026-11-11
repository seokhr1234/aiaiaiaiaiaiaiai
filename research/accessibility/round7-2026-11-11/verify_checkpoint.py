"""Verify collection bytes, original preservation, completed audit/benchmark."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parent
repo = root.parents[2]
baseline = '1030164d7e2ec5878340e7326f79af58ea59fc4d'
read = lambda path: json.loads(path.read_bytes())
sha = lambda data: hashlib.sha256(data).hexdigest()
assert not subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=MDTUXB', baseline, '--', 'research'], cwd=repo).strip()
raw_count = 0
statuses = {}
for request_path in sorted((root/'raw').glob('*/request.json')):
    request = read(request_path)
    response = request_path.parent/'response.bin'
    assert sha(response.read_bytes()) == request['sha256'] and response.stat().st_size == request['bytes']
    assert request['field_verified'] is False
    statuses[str(request['http_status'])] = statuses.get(str(request['http_status']), 0)+1
    raw_count += 1
for report_name in ['walking-tag-results', 'node-recovery-results', 'recovered-node-audit-results']:
    r = read(root/(report_name+'.json'))
    packed = (root/r['output']['path']).read_bytes()
    assert sha(packed) == r['output']['sha256'] and sha(gzip.decompress(packed)) == r['output']['uncompressed_sha256']
    assert r['field_verified'] is False and r['routing_eligible'] is False and r['new_slope_values_promoted'] == 0
for name in ['validation', 'recovered-node-validation']:
    assert read(root/(name+'.json'))['pass']
for name in ['runtime-integrity.json', 'map-data.json', 'terrain-data.json']:
    p = repo/'donghaeng-nav/dist'/name
    assert p.read_bytes() == subprocess.check_output(['git', 'show', baseline+':'+str(p.relative_to(repo))], cwd=repo)
performance = read(repo/'donghaeng-nav/docs/walk-api-local-performance.json')
assert performance['pass'] and len(performance['serialSamples']) == 100 and len(performance['concurrentSamples']) == 10
assert len({tuple(s['nodeIds']) for s in performance['serialSamples']}) == 100
assert all(len([s for s in performance['serialSamples'] if s['profileCase'] == i]) == 25 for i in range(4))
assert sum(performance['concurrency10']['statusCounts'].values()) == 10
assert not performance['fieldVerified'] and not performance['actualOdsay'] and not performance['citywideSloVerified']
result = {'pass': True, 'reviewed_date_kst': '2026-11-11', 'baseline_commit': baseline,
          'prior_tracked_research_unchanged': True, 'active_runtime_lock_and_graph_unchanged': True,
          'raw_responses_verified': raw_count, 'response_status_counts': statuses, 'derived_artifacts_verified': 3,
          'way_and_recovered_node_validation_pass': True, 'synthetic_local_http_pairs': 100, 'concurrent_local_requests': 10,
          'citywide_slo_verified': False, 'field_verified': False, 'new_slope_values_promoted': 0}
(root/'checkpoint-integrity.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
