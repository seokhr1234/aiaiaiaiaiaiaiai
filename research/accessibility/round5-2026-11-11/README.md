# 서울 확장 선행 수집·검증 — 2026-11-11 KST

이전 round3/round4를 보존한 새 조사다. 앱 연결과 남은 작업은 [동행길 진행 기록](../../../donghaeng-nav/docs/seoul-expansion-progress.md)을 참고한다.

기준 프로그램 커밋은 `373c51208d81b17257c930c328dfa75748253f0e`이다. 서울 전역 정밀지도와 대중교통을 추가하기 위한 선행 자료를 실제 요청하고 원본을 별도 보관했다. 이 수집으로 기존 활성 도로망·경사·좌표를 교체하지 않았다.

| 자료 | 실제 결과 | 미완료·해석 제한 |
| --- | --- | --- |
| Geofabrik 대한민국 OSM | 2026-11-09 추출본 **291,406,356 bytes**, 제공 MD5와 일치, SHA-256 `4e44c2315ea171b0c9041e9ea625865163fddaf9325d146884dd00ba9a17484d` | 수집일 11월 11일과 데이터 기준 시각을 구분 |
| 서울 주변 추출 | 사각 영역 `[126.7,37.38,127.3,37.78]`, highway way 260,828·참조 노드 1,330,229, 건물 way 314,407, POI 노드 196,816 | 행정 경계·보행 가능 구간 전체·완성된 접근성 망이 아님 |
| 관련 관계 | 관계 9,648·제한 관계 6,046 보존 | 외부 참조 미해결 관계 1,634. 보행 적용 조건 해석·연결/층위 검증 필요 |
| NGII 지도·DEM | 실행 환경의 실제 GET 요청은 503 본문 보존 | 전역 원본·DEM을 확보하지 못함. 서비스 전체 장애나 자료 부재의 증거가 아님 |
| ODsay | 가이드·구매 안내 HTML 수집 | 실제 키는 이 실행 환경에 없고 인증 호출·사용자 계약 검증은 미실행. 사용자가 Vercel 설정 예정 |
| 공식 교통 자료 | 승강기 소개 페이지 접근 성공, 공공데이터포털 버스 소개 페이지 실행 환경 요청은 503 | 실제 운행·승강기 API 데이터 수집으로 집계하지 않음 |
| OSM 정책 | 타일·검색 정책 HTML 수집 | 공용 타일 대량 수집과 공용 Nominatim 자동완성을 구현하지 않음 |

공개 요청은 12회이며 HTTP 200 9회·503 3회다. 데이터 파일, 소개 문서와 정책 페이지를 구분한다. HTTP 200만으로 새 지형·보행 자료 확보로 판정하지 않는다. [카탈로그](../../../donghaeng-nav/docs/seoul-source-catalog.json).

## 시점·좌표·보존

PBF 헤더의 데이터 기준은 **2026-11-09T21:22:17Z**이며 원본 수집은 2026-11-11이다. 도로/POI의 좌표는 OSM 경위도 EPSG:4326 형식으로 추출한다. 수직 기준은 null이며 숫자 경사를 새로 계산하거나 승격하지 않았다. 모든 새 산출물은 `field_verified:false`, `routing_eligible:false`다.

`raw/<id>/request.json`에 요청 URL·시각·HTTP 결과·크기·SHA-256을 기록하고 `response.bin`에 받은 바이트를 보존한다. 파생본은 `derived/*.json.gz`로 무손실 압축한다. 큰 원본·파생본은 이 폴더의 `.gitignore`로 Git에서 제외한다. 원본을 재다운로드할 때에는 새 요청 ID를 써서 기존 시도를 덮어쓰지 않는다.

`osm-extract-results.json`은 영역 추출 집계와 압축/원문 해시, `osm-relations-results.json`은 관계 집계와 미해결 목록의 압축 원문 경로·해시, `validation.json`은 좌표·중복·way 참조 노드 누락 0·미승격 검사를 기록한다. 미해결 참조는 원문 목록으로 보존하며 추측으로 채우지 않는다. `restriction-review.json`에서 미해결 관계를 유형별로 나누며 제한 관계 중 24개에 외부 참조가 남았다. 보행 전용 제한 태그가 없다는 사실을 보행 제한이 없다는 뜻으로 해석하지 않는다.

큰 로컬 DB 이미지 검증 중 공간 부족이 발생해 새 파생본의 불필요한 비압축 복사본을 제거하고 동일 내용을 gzip으로 보존했다. 원본 PBF·기존 조사 자료를 지우지 않았고 작업용 DB 자원만 정리했다.

## 재현

```sh
python3 -m venv /workspace/.venv-expansion
/workspace/.venv-expansion/bin/python -m pip install -r research/accessibility/round5-2026-11-11/requirements.txt
python3 research/accessibility/round5-2026-11-11/collect.py research/accessibility/round5-2026-11-11/plan-public-access.json
python3 research/accessibility/round5-2026-11-11/collect.py research/accessibility/round5-2026-11-11/plan-osm-extract.json
/workspace/.venv-expansion/bin/python research/accessibility/round5-2026-11-11/extract_osm.py
/workspace/.venv-expansion/bin/python research/accessibility/round5-2026-11-11/extract_relations.py
/workspace/.venv-expansion/bin/python research/accessibility/round5-2026-11-11/validate_study.py
python3 research/accessibility/round5-2026-11-11/review_restrictions.py
```

수집·추출은 기존 경로가 있으면 중단한다. 위 명령은 원본이 없는 새 사본에서 실행하거나 새 조사 ID/출력 경로를 준비한 후 사용한다. 다른 환경에 Git 제외 원본이 없다면 확보 상태로 간주하지 말고 실제 재수집·해시 검증을 수행한다.

다음 작업은 외부 관계 참조·통행 제한 해석, NGII 전역 원본/시범 보도 연결 검증, 지형 근거의 새 그래프 연결 검증이다. 실제 휴대폰·현장 통행·새 경사값 승격은 이번에도 미완료/0건이다.
