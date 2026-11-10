"""Attach the verified round4 shelter snapshot and matched notices, without geocoding.

The original CSV/notice evidence must pass validation before any runtime write.
Existing geometry, official fields and opening hours remain intact. Conflicting
hours are flagged for display and exclusion from automatic rest selection.
"""
from pathlib import Path
import csv
import hashlib
import io
import json
import re

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/accessibility/round4-2026-11-05'
TARGET = ROOT / 'donghaeng-nav/dist/data/accessibility/seoul/seoul-facilities.geojson'
BATCH = 'round4-2026-11-05'


def load(path):
    return json.loads(path.read_text())


def verified_response(ident):
    request = load(RESEARCH / 'raw' / ident / 'request.json')
    body = (RESEARCH / request['response_path']).read_bytes()
    assert request['http_status'] == 200
    assert len(body) == request['bytes'] and hashlib.sha256(body).hexdigest() == request['sha256']
    return body, request


def key(row):
    return (row['쉼터명칭'].strip(), row['도로명주소'].strip(), float(row['경도']), float(row['위도']))


def norm(text):
    return re.sub(r'[^가-힣a-zA-Z0-9]', '', text)


def apply():
    body, request = verified_response('seoul-shelter-csv')
    rows = list(csv.DictReader(io.StringIO(body.decode('cp949'))))
    assert len(rows) == 4092 and all(r['시설년도'] == '2026' and len(r) == 23 for r in rows)
    indexed = {key(r): r for r in rows}
    assert len(indexed) == len(rows), 'Duplicate CSV keys'
    diff = load(RESEARCH / 'analysis/shelter-diff.json')
    assert not diff['new_keys'] and not diff['old_keys_not_in_new_csv'] and not diff['changed_official_fields']
    assert diff['csv_rows'] == diff['api_total'] == diff['sheet_total'] == len(rows)
    data = load(TARGET)
    original = json.loads(json.dumps(data))
    cooling = [f for f in data['features'] if f['properties']['id'].startswith('seoul:cooling:')]
    assert len(cooling) == len(rows)
    for f in cooling:
        p = f['properties']
        assert p['official_fields'] == indexed[key(p['official_fields'])]
        assert f['geometry']['type'] == 'Point'
        assert f['geometry']['coordinates'] == [float(p['official_fields']['경도']), float(p['official_fields']['위도'])]
        assert p['field_verified'] is False
        p['official_recheck'] = {
            'retrieved_date': '2026-11-05', 'facility_year': '2026',
            'catalog_data_updated': '2026-11-05', 'catalog_metadata_modified': '2026-08-11',
            'source_sha256': request['sha256'], 'matched_fields': 23, 'field_verified': False}

    # Match only the three manually reviewed name/address pairs. Unmatched
    # designations/revocations and complex/library identities remain unapplied.
    specs = {
        'seoul:cooling:361769f9311bcbaa': ('동일하이빌 뉴시티 경로당', '2026-05-06', '종암로167', True,
            '공지: 월~토 09:00~18:00, 104동 7층. 서울시 등록: 월~금 11:00~15:00, 단지 대표 주소.'),
        'seoul:cooling:6fcea078832f652a': ('보문느티나무 경로당', '2026-05-06', '보문로13길27', False,
            '공지와 서울시 등록의 운영 안내 일치: 월~금 09:00~18:00. 회원이용시설로 등록.'),
        'seoul:cooling:80f8394aa06897d9': ('성북문화예술교육센터', '2026-05-18', '장월로8길38', True,
            '공지: 화~토 09:00~18:00, 12:00~13:00 미운영, 2층 라운지. 서울시 등록: 화~토 10:00~18:00, 점심 미운영 안내 없음.')}
    transcribed = load(RESEARCH / 'notice-transcription.json')
    linked = []
    for ident, (name, published, address, conflict, operating) in specs.items():
        matches = [f for f in cooling if f['properties']['id'] == ident]
        assert len(matches) == 1
        p = matches[0]['properties']
        assert norm(name) in norm(p['name']) and address in norm(p['address'])
        notice = next(n for n in transcribed['notices'] if n['published_date'] == published)
        assert any(r['name'] == name and r['action'] == 'designated' for r in notice['rows'])
        verified_response(notice['page_id'])
        verified_response(notice['image_id'])
        page = load(RESEARCH / 'raw' / notice['page_id'] / 'request.json')
        p['additional_official_evidence'] = [e for e in p.get('additional_official_evidence', []) if e.get('collection_batch') != BATCH]
        p['additional_official_evidence'].append({
            'collection_batch': BATCH, 'source': '성북구청 · 무더위쉼터 지정 공지',
            'source_url': page['url'], 'source_as_of': published+' 공지',
            'retrieved_date': '2026-11-05', 'operating_note': operating,
            'note': '운영 안내 차이로 방문 전 확인 필요. 자동 휴식 후보에서 제외.' if conflict else '시설명·도로명주소 대조. 현재 운영·출입구·층간 이동은 현장 미확인.',
            'field_verified': False})
        p['official_hours_conflict'] = conflict
        if conflict:
            p['official_hours_conflict_note'] = '공식 자료의 운영 안내가 달라요. 방문 전 운영시간을 확인하세요. 자동 휴식 후보에서는 제외했어요.'
        linked.append({'id': ident, 'name': p['name'], 'published_date': published, 'hours_conflict': conflict})

    # No identity, geometry, original field, operational state or old evidence edit.
    for a, b in zip(data['features'], original['features']):
        assert a['geometry'] == b['geometry']
        for field in ('id', 'opening_hours', 'official_fields', 'field_verified', 'operational_status', 'source_snapshot', 'retrieved_date'):
            assert a['properties'].get(field) == b['properties'].get(field)
    TARGET.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
    report = {'collection_batch': BATCH, 'official_shelters_rechecked': len(cooling),
              'matched_notices': linked, 'hours_conflicts': 2, 'new_coordinates': 0,
              'unmatched_notices_applied': 0, 'new_slope_values_promoted': 0,
              'source_csv_sha256': request['sha256'], 'field_verified': False}
    (ROOT / 'donghaeng-nav/docs/research-map-linkage-data.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    apply()
