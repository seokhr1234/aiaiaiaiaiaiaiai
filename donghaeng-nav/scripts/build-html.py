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
    terrain = json.loads(local_file(datasets['bundled-terrain']['path']).read_bytes())
    graph_hash = datasets['bundled-map-data']['sha256']
    if terrain['meta']['graph_sha256'] != graph_hash or terrain['review']['inputs']['map_data_sha256'] != graph_hash:
        raise ValueError('도로망과 지형 검토 자료가 일치하지 않습니다.')
    if terrain['review']['inputs']['map_context_sha256'] != datasets['bundled-map-context']['sha256']:
        raise ValueError('주변 지물과 지형 검토 자료가 일치하지 않습니다.')
    precision = json.loads(local_file(datasets['bundled-precision-map']['path']).read_bytes())
    if precision.get('metadata', {}).get('schema') != 'donghaeng-precision-v1':
        raise ValueError('정밀지도 스키마가 다릅니다.')
    if any(f['properties'].get('field_verified') is not False or f['properties'].get('routing_eligible') is not False for f in precision['features']):
        raise ValueError('검토용 정밀지도를 현장 검증·경로망으로 승격할 수 없습니다.')
    html = (BASE / 'index.html').read_text().replace('href="./"', 'href="#"')
    def stylesheet(match):
        css = local_file(match[1]).read_text()
        css = re.sub(r'@import\s+url\([^)]*\)\s*;', '', css)
        return '<style>' + css + '</style>'
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', stylesheet, html)
    used = set()
    def data_block(match):
        ident, relative = match.groups()
        if ident not in datasets or datasets[ident]['path'] != relative:
            raise ValueError('알 수 없는 데이터 블록: ' + ident)
        used.add(ident)
        packed = gzip.compress(local_file(relative).read_bytes(), compresslevel=6, mtime=0)
        return '<script id="' + ident + '" type="application/octet-stream" data-encoding="gzip-base64">' + base64.b64encode(packed).decode() + '</script>'
    html = re.sub(r'<script id="([^"]+)" type="application/json" data-src="([^"]+)"></script>', data_block, html)
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
        'version': '2026-11-04-main-navigation',
        'main_source': 'donghaeng-nav/dist/index.html',
        'project_name': '동행길',
        'source_snapshot': lock['source'],
        'facility_records': len(facilities),
        'counts': dict(Counter(f['properties']['kind'] for f in facilities)),
        'source_sha256': datasets['bundled-facilities-seoul']['sha256'],
        'terrain': terrain['meta'],
        'precision_records': len(precision['features']),
        'precision_field_verified': False,
        'runtime_validation': 'Exact snapshot hashes and graph binding; original GIS inputs not reprocessed',
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
    handoff.update(html_sha256=manifest['html_sha256'], updated='2026-11-04', main_program='동행길', precision_runtime_included=True, precision_runtime_loader_implemented=True)
    handoff['main_promotion'] = {'version': manifest['version'], 'review': 'donghaeng-nav/docs/main-navigation-promotion.md', 'original_gis_reprocessed': False, 'field_verified': False}
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
