"""Package the main sources from a hash-bound runtime snapshot.
GIS preprocessing is separate; changes to protected inputs require revalidation.
"""
from collections import Counter
from pathlib import Path
import base64
import gzip
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'donghaeng-nav/dist'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def local_file(relative):
    path = (BASE / relative).resolve()
    if not path.is_relative_to(BASE.resolve()) or not path.is_file():
        raise ValueError('잘못된 빌드 입력: ' + relative)
    return path


def build():
    lock = json.loads((BASE / 'runtime-integrity.json').read_text())
    if lock.get('version') != 1:
        raise ValueError('지원하지 않는 런타임 검증 기록입니다.')
    datasets = {item['id']: item for item in lock['data']}
    for item in datasets.values():
        raw = local_file(item['path']).read_bytes()
        if sha(raw) != item['sha256']:
            raise ValueError('런타임 자료가 검증 스냅샷과 다릅니다: ' + item['path'])
        json.loads(raw)
    for name, expected in lock['protected_code'].items():
        if sha(local_file(name).read_bytes()) != expected:
            raise ValueError('경로 검증 입력이 바뀌었습니다: ' + name + ' · 재검증 후 무결성 기록을 갱신하세요.')
    service_path = ROOT / 'donghaeng-nav/services/service-integrity.json'
    services = json.loads(service_path.read_text())
    for name, expected in services['files'].items():
        target = (ROOT / name).resolve()
        if not target.is_relative_to(ROOT.resolve()) or sha(target.read_bytes()) != expected:
            raise ValueError('확장 서비스 입력 변경 · 재검증 필요: ' + name)
    terrain = json.loads(local_file(datasets['bundled-terrain']['path']).read_bytes())
    graph_hash = datasets['bundled-map-data']['sha256']
    if terrain['meta']['graph_sha256'] != graph_hash or terrain['review']['inputs']['map_data_sha256'] != graph_hash:
        raise ValueError('도로망과 지형 검토 자료가 일치하지 않습니다.')
    if terrain['review']['inputs']['map_context_sha256'] != datasets['bundled-map-context']['sha256']:
        raise ValueError('주변 지물과 지형 검토 자료가 일치하지 않습니다.')
    evidence = json.loads(local_file(datasets['bundled-terrain-evidence']['path']).read_bytes())
    if (evidence.get('version') != 1 or evidence.get('graph_sha256') != graph_hash
            or evidence.get('field_verified') is not False or evidence.get('routing_eligible') is not False
            or evidence.get('new_slope_values_promoted') != 0):
        raise ValueError('추가 표고 근거의 도로망 연결·검토 전용 상태가 다릅니다.')
    if (not isinstance(evidence.get('edges'), dict)
            or len(evidence['edges']) != evidence['edges_with_support'] + evidence['edges_without_support']):
        raise ValueError('추가 표고 근거의 구간 집계가 다릅니다.')
    precision = json.loads(local_file(datasets['bundled-precision-map']['path']).read_bytes())
    if precision.get('metadata', {}).get('schema') != 'donghaeng-precision-v1':
        raise ValueError('정밀지도 스키마가 다릅니다.')
    if any(f['properties'].get('field_verified') is not False or f['properties'].get('routing_eligible') is not False for f in precision['features']):
        raise ValueError('검토용 정밀지도를 현장 검증·경로망으로 승격할 수 없습니다.')
    compressed_assets = []
    for item in datasets.values():
        source = local_file(item['path']).read_bytes()
        packed = gzip.compress(source, compresslevel=6, mtime=0)
        assert gzip.decompress(packed) == source
        relative = item['path'] + '.gz'
        (BASE / relative).write_bytes(packed)
        compressed_assets.append({'path': relative, 'sha256': sha(packed), 'bytes': len(packed), 'source_sha256': item['sha256']})
    html = (BASE / 'index.html').read_text().replace('href="./"', 'href="#"')
    def stylesheet(match):
        css = local_file(match[1]).read_text()
        css = re.sub(r'@import\s+url\([^)]*\)\s*;', '', css)
        return '<style>' + css + '</style>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', stylesheet, html)
    used = set()
    def data_block(match):
        ident, relative = match.group(1), match.group(2)
        if ident not in datasets or datasets[ident]['path'] != relative:
            raise ValueError('알 수 없는 데이터 블록: ' + ident)
        used.add(ident)
        packed = gzip.compress(local_file(relative).read_bytes(), compresslevel=6, mtime=0)
        return '<script id="' + ident + '" type="application/octet-stream" data-encoding="gzip-base64"' + (' data-lazy="true"' if ident in ['bundled-seoul-base', 'bundled-terrain-evidence'] else '') + '>' + base64.b64encode(packed).decode() + '</script>'
    html = re.sub(r'<script id="([^"]+)"(?: data-lazy="true")? type="application/json" data-src="([^"]+)"[^>]*></script>', data_block, html)
    if used != set(datasets):
        raise ValueError('빌드에 빠진 런타임 자료가 있습니다.')
    html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + local_file(m[1]).read_text().replace('</script', '<\\/script') + '</script>', html)
    if '<script src=' in html or 'data-src=' in html:
        raise ValueError('단일 HTML 빌드에 외부 소스 참조가 남아 있습니다.')
    targets = [ROOT / name for name in ['동행길-최종.html', '동행길-시연.html', '동행길-전달용.html']]
    package = ROOT / '이동약자-내비게이션-실행패키지'
    targets += [p for p in package.glob('*.html') if unicodedata.normalize('NFC', p.name) in ['휴대폰용.html', '컴퓨터용.html']]
    if len(targets) != 5:
        raise ValueError('실행 패키지 HTML 두 파일이 필요합니다.')
    for path in targets:
        path.write_text(html, encoding='utf-8', newline='\n')
    facilities = json.loads(local_file(datasets['bundled-facilities-seoul']['path']).read_bytes())['features']
    manifest = {
        'version': '2026-11-11-expansion-foundation',
        'main_source': 'donghaeng-nav/dist/index.html',
        'expansion': {'online_page': 'expansion.html', 'service_code_files': len(services['files']),
                      'service_integrity_sha256': sha(service_path.read_bytes()), 'citywide_routing': False,
                      'authenticated_transit_verified': False, 'new_slope_values_promoted': 0},
        'compressed_assets': compressed_assets,
        'project_name': '동행길',
        'route_choice': {'max_attempts': 24, 'time_budget_ms': 4000, 'max_candidates': 5, 'explanation': 'Decision-time final response; no new request on click', 'real_gemini_verified': False},
        'source_snapshot': lock['source'],
        'facility_records': len(facilities),
        'counts': dict(Counter(f['properties']['kind'] for f in facilities)),
        'source_sha256': datasets['bundled-facilities-seoul']['sha256'],
        'terrain': terrain['meta'],
        'supplementary_evidence': {
            'review_date': evidence['reviewed_date'],
            'archive_originally_collected': evidence['archive_originally_collected'],
            'selected_points': evidence['selected_points'],
            'selected_contours': evidence['selected_contours'],
            'edges_with_support': evidence['edges_with_support'],
            'edges_without_support': evidence['edges_without_support'],
            'enriched_shelters': sum(bool(f['properties'].get('rest_evidence_note')) for f in facilities),
            'official_shelters_rechecked': sum(bool(f['properties'].get('official_recheck')) for f in facilities),
            'linked_round4_notices': sum(sum(e.get('collection_batch') == 'round4-2026-11-05' for e in f['properties'].get('additional_official_evidence', [])) for f in facilities),
            'official_hours_conflicts': sum(bool(f['properties'].get('official_hours_conflict')) for f in facilities),
            'new_slope_values_promoted': 0, 'field_verified': False,
        },
        'gps': {'display_stabilization': True, 'routing_uses_original_fixes': True,
                'jump_confirmation_samples': 3, 'jump_confirmation_ms': 2000,
                'origin_max_accuracy_m': 25, 'max_fix_accuracy_m': 50,
                'physical_gps_verified': False},
        'precision_records': len(precision['features']),
        'precision_field_verified': False,
        'runtime_validation': 'Exact hashes and graph binding; supplied OA-22241 archive re-extracted as supplementary evidence only; existing route slopes and precision map unchanged',
        'html_sha256': sha(html.encode()), 'html_bytes': len(html.encode()),
        'external_requests_required': False,
        'online_basemap': 'OpenStreetMap raster tiles via Leaflet; HTTP(S) only',
        'offline_basemap': 'Embedded OSM snapshot via Leaflet GridLayer',
        'optional_condition_api': 'Gemini via server; optional direct key only in file/content mode',
        'external_deployment': False,
    }
    (ROOT / 'donghaeng-nav/docs/final-build.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    handoff_path = ROOT / '전달-검증.json'
    handoff = json.loads(handoff_path.read_text())
    handoff.update(html_sha256=manifest['html_sha256'], updated='2026-11-11', main_program='동행길', precision_runtime_included=True, precision_runtime_loader_implemented=True)
    handoff['main_promotion'] = {'version': manifest['version'], 'review': 'donghaeng-nav/docs/main-navigation-promotion.md', 'original_gis_reprocessed': False, 'field_verified': False}
    handoff['supplementary_evidence'] = manifest['supplementary_evidence']
    handoff['gps_stabilization'] = manifest['gps']
    handoff_path.write_text(json.dumps(handoff, ensure_ascii=False, indent=2) + '\n')
    sums = package / 'SHA256SUMS.txt'
    names = {unicodedata.normalize('NFC', p.name): p for p in package.iterdir()}
    lines = []
    for line in sums.read_text().splitlines():
        _, name = line.split('  ', 1)
        lines.append(sha(names[unicodedata.normalize('NFC', name)].read_bytes()) + '  ' + name)
    sums.write_text('\n'.join(lines) + '\n')
    print(json.dumps({'version': manifest['version'], 'outputs': len(targets), 'datasets': len(datasets), 'precision_records': len(precision['features']), 'html_sha256': manifest['html_sha256']}, ensure_ascii=False))


if __name__ == '__main__':
    build()
