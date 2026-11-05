#!/usr/bin/env python3
"""Validate this collection, baseline preservation, and protected runtime hashes."""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BASE = '0d0c844d87700f995efe9a1c10c3ca3069e1b72f'


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)


attempts = read(HERE/'analysis/network-attempts.json')
for request in attempts:
    if request.get('response_path'):
        body = HERE/request['response_path']
        assert body.stat().st_size == request['bytes']
        assert sha(body) == request['sha256']
    assert request['field_verified'] is False
shelters = read(HERE/'analysis/shelter-diff.json')
assert shelters['csv_rows'] == shelters['api_total'] == shelters['sheet_total'] == 4092
assert not shelters['new_keys'] and not shelters['old_keys_not_in_new_csv'] and not shelters['changed_official_fields']
assert not shelters['invalid_coordinate_row_numbers']
terrain = read(HERE/'analysis/terrain-comparison.json')
fresh_seq2 = next(a for a in terrain['archives'] if a['archive_id'] == 'seoul-terrain-zip2-get')
assert fresh_seq2['identical_to_prior_seq2_archive']
assert fresh_seq2['selected_counts'] == {'spot': 944, 'contour': 191}
assert not fresh_seq2['height_changes_on_common_ids'] and not fresh_seq2['geometry_changes_on_common_ids']
osm = read(HERE/'analysis/osm-diff.json')
assert len(osm['changed_existing']) == 45
assert osm['old_access_comparison_counts'] == {'unchanged_version_and_tags': 171}
assert not osm['four_map_tiles_cross_response_conflicts']
assert osm['new_slope_values_promoted'] == terrain['new_slope_values_promoted'] == 0
assert sum(len(n['rows']) for n in read(HERE/'notice-transcription.json')['notices']) == 20

runtime = REPO/'donghaeng-nav/dist'
integrity = read(runtime/'runtime-integrity.json')
for entry in integrity['data']:
    assert sha(runtime/entry['path']) == entry['sha256']
for path, expected in integrity['protected_code'].items():
    assert sha(runtime/path) == expected

# Check every baseline research file against its Git blob, including binary
# originals. Added round4 files are outside this baseline list.
research_count = 0
for entry in git('ls-tree', '-rz', BASE, '--', 'research').split(b'\0'):
    if not entry:
        continue
    header, name = entry.split(b'\t', 1)
    mode, kind, expected = header.split()
    assert kind == b'blob'
    path = REPO/name.decode()
    assert path.is_file(), f'Missing previous research: {path}'
    actual = git('hash-object', '--', str(path)).strip()
    assert actual == expected, f'Changed previous research: {path}'
    research_count += 1
assert not git('diff', '--name-only', BASE, '--', 'donghaeng-nav/dist')
html_paths = [x.decode() for x in git('ls-tree', '-rz', '--name-only', BASE).split(b'\0') if x.endswith(b'.html')]
assert not git('diff', '--name-only', BASE, '--', *html_paths)

result = {'baseline_commit': BASE, 'request_records_checked': len(attempts),
          'preserved_previous_research_files': research_count,
          'runtime_data_hashes_checked': len(integrity['data']),
          'protected_code_hashes_checked': len(integrity['protected_code']),
          'unchanged_tracked_html_files': len(html_paths),
          'runtime_tree_unchanged': True, 'reconciliation_assertions_passed': True,
          'field_verified': False, 'actual_phone_gps_tested': False,
          'new_slope_values_promoted': 0,
          'scope': 'Local original/metadata reconciliation and preservation checks; no new runtime behavior, browser/GPS/field tests'}
(HERE/'analysis/validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
