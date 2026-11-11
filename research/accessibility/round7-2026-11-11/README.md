# 서울 주변 OSM 보행 태그·도로 노드 원문 복구 — 2026-11-11 KST

round3~round6를 보존한 후속 조사다. 원본은 round5의 같은 [Geofabrik 대한민국 PBF](https://download.geofabrik.de/asia/south-korea.html)이며 **수집일 2026-11-11**, **자료 기준 2026-11-09T21:22:17Z**, **EPSG:4326 경위도**, **수직 기준 null/미확인**, **현장 미검증**을 구분한다. SHA-256 `4e44c2315ea171b0c9041e9ea625865163fddaf9325d146884dd00ba9a17484d`를 확인했다. 서울 인접권 사각 범위 `[126.7,37.38,127.3,37.78]`와 겹치는 way가 대상이며 서울 행정 경계 내 전수 조사나 보행 가능 구간 수가 아니다.

## 발견과 원본 보완

round5의 way 태그는 전체 보존됐지만 노드는 특정 POI(이름·대중교통·철도·승강기·횡단부 등)로 선택된 경우에만 태그를 남겼다. 그 외 노드는 좌표만 남겨 이름 없는 차단물·턱·출입구 등의 원본 태그가 중간 추출본에서 빠질 수 있었다. **중간 추출본의 태그 결측을 PBF 원본의 결측으로 해석하지 않는다.** 기존 추출본은 수정하지 않았다.

같은 PBF에서 도로 참조 노드 **1,330,229개 전부**를 다시 읽고 좌표가 원래 추출과 정확히 같은지 확인했다. 태그 보유 노드 **52,583개**를 별도 보존했고, 그중 **16,611개**의 태그가 중간 추출본에 없었다. 원래 태그가 남아 있던 35,972개도 원본과 일치했다. 이는 새 측량이나 새 위치 추가가 아니다.

| 관련 노드 유형 | 중간 추출본의 검사 결과 | 같은 PBF 원문 복구 후 |
| --- | ---: | ---: |
| 차단물 `barrier` | 245 | 3,000 |
| 출입구 `entrance` | 250 | 2,109 |
| 턱 종류·높이 태그 | 228 | 1,130 |
| 횡단부 `highway=crossing` | 26,504 | 26,579 |
| 승강기 `highway=elevator` | 276 | 278 |

유형은 서로 중복될 수 있다. 복구 후 관련 노드는 **31,934개**다. 이 중 `kerb:height`와 `width`의 숫자 등록은 각각 2개이며, 턱 **종류** 등록 1,130개를 실측 높이 1,130개로 세지 않는다. 출입구 태그가 출입 허용·보행 접근·문 폭·층 연결을 확인한 뜻은 아니며 승강기 태그가 현재 운행 확인을 뜻하지 않는다. 개별 숫자·폭·경사 태그도 OSM 등록값이며 현장 측정 근거를 새로 확인하지 않았다.

## 도로 way 태그 점검

원래 도로 way **260,828개**를 한 번씩 검사했다. 아래는 **태그 보유 건수**이며 보행 허용·접근성 보증 건수가 아니다.

| 태그 | 등록 way 수 | 해석 제한 |
| --- | ---: | --- |
| `foot` | 9,065 | 일반 `access`와 구분. 조건부/방향별 규칙은 별도 검토 |
| `access` | 2,918 | 법적 기본 권한을 이번 감사에서 결정하지 않음 |
| `wheelchair` | 185 | yes/designated 114·no 58·limited 13. 실제 통행 검증 아님 |
| `width` | 2,903 | m/cm/mm 수치 2,884·미해석 19. 차도 폭일 수 있으며 보도 유효 폭으로 전용하지 않음 |
| `incline` | 1,695 | 숫자 243·up/down 1,357·미해석 95. 새 경사 계산·승격은 0건 |
| `surface` | 37,032 | 결측은 포장/평탄으로 채우지 않음 |
| `smoothness` | 600 | 원래 태그만 보존하며 현장 등급 확정 아님 |

`foot`가 있으면 일반 `access`보다 먼저 원문 주장을 기록하고, 긍정/금지/제한/다른 보도 사용/미해석을 구분한다. `foot/access`의 단순 비조건부 태그가 없는 way는 249,619개이며 도로 유형별 법적 기본값까지 “없음”으로 판정한 것이 아니다. 도로 `oneway`를 보행 일방통행으로 복사하지 않는다. 조건부/방향 규칙 4개는 실행 평가하지 않았다. 계단 6,063개, 그중 `wheelchair` 긍정 태그와 함께 있는 7개는 검토 대상으로 남긴다. 다른 층·교량·지하·계단·폭·차단물 연결을 추정으로 복원하지 않는다.

## 공개 문서·접근 재확인

OSM 커뮤니티의 foot/access/wheelchair/turn restriction/width/incline/kerb 문서 **7개를 실제 수집(모두 200)**하고 응답 바이트·수집 시각·해시·문서 revision ID를 보존했다. 정부 접근성 기준이나 새 GIS 관측과 구분한다. [문서 대조](tag-definition-review.json), [기본 태그 요청](tag-docs-results.json), [단위 요청](tag-metrics-results.json).

일반 turn restriction을 보행에 일괄 적용하지 않는다. 수집 문서는 type/key가 `restriction:foot`일 때 보행에 적용된다고 설명한다. 확보된 관계의 `restriction` 유형은 6,046개, `restriction:foot` 유형은 0개였다. 태그 부재를 보행 안전으로 바꾸지는 않는다. 폭·턱 높이의 단위 없는 숫자는 OSM 미터 관례로 표시하고, 경사 퍼센트/각도/방향을 구분하며 새 퍼센트 환산·경로 가중치 적용은 하지 않는다.

앞서 실패한 NGII 지도, NGII DEM 카탈로그, 버스 공식 API 소개 주소 **3개를 새로 GET 재요청**했지만 이 환경에서는 모두 **503/91 bytes**였다. [새 시도](official-retry-results.json). 실패 본문·시점은 보존했으며 자료 부재나 기관 서비스 전체 장애로 단정하지 않는다. 새 NGII 원본/DEM·실시간 버스 자료를 확보했다고 집계하지 않았다.

## 파일·검증·재현

- `walking-tag-results.json`·`validation.json`: 전체 way와 **중간 추출본에 태그가 있던 노드만**의 최초 집계. way 집계는 그대로 유효하지만 노드 집계는 원문 복구 후 결과를 우선한다. 최초 결과를 덮어쓰지 않았다.
- `node-recovery-results.json`·`recovered-node-audit-results.json`·`recovered-node-validation.json`: 원본 전체 도로 참조 노드 대조, 추가 태그 복구, 관련 노드 집계와 독립 보존/해시/누락 검사다.
- `derived/*.ndjson.gz`: 원래 태그·검토 결과를 무손실 압축해 로컬 보관하며 Git 제외. 입력/출력 압축·원문 해시를 Git에 기록한다. 원본이 없는 환경은 재수집·해시 검증부터 필요하다.
- `raw/<id>/request.json`: 새 요청의 시점·출처·HTTP 상태·바이트/해시. 응답 바이트는 로컬 Git 제외이며 이전 조사 수집기는 새 출력 경로로 재사용했다.
- `test_walking_tags.py`·`test_recover_road_nodes.py`: 태그 우선순위·조건/방향·결측/0/단위/부호/범위·미승격, 실제 작은 PBF에서 이름 없는 차단물 태그 복구·결측 노드/좌표 변동/원래 태그 차이 거부를 검사한다.

아래 추출/수집 명령은 기존 출력이 있으면 중단하므로 원본·이전 파생본이 준비된 **새 사본 또는 새 조사 경로**에서 실행한다. 기존 결과를 삭제해 재실행하지 않는다. `osmium==4.2.0` 환경은 round5 requirements를 사용한다.

```sh
python3 research/accessibility/round7-2026-11-11/collect_tag_docs.py
python3 research/accessibility/round7-2026-11-11/collect_tag_docs.py research/accessibility/round7-2026-11-11/plan-tag-metrics.json
python3 research/accessibility/round7-2026-11-11/collect_tag_docs.py research/accessibility/round7-2026-11-11/plan-official-retry.json
python3 research/accessibility/round7-2026-11-11/test_walking_tags.py
python3 research/accessibility/round7-2026-11-11/audit_walking_tags.py
python3 research/accessibility/round7-2026-11-11/validate_walking_tags.py
/workspace/.venv-expansion/bin/python research/accessibility/round7-2026-11-11/test_recover_road_nodes.py
/workspace/.venv-expansion/bin/python research/accessibility/round7-2026-11-11/recover_road_node_tags.py
python3 research/accessibility/round7-2026-11-11/audit_recovered_nodes.py
python3 research/accessibility/round7-2026-11-11/validate_recovered_nodes.py
```

활성 도로망·지형/경사값·시설 좌표는 그대로다. 서울 전역 길찾기·새 경사값 승격·현장 검증은 이번에도 **미완료/0건**이다. 다음은 검토 전용 그래프의 태그/층위/차단물 정책, 제한 관계 구조 해소, 정밀/지형 연결과 현장 시범 조사다. [전체 완료·남은 계획](../../../donghaeng-nav/docs/seoul-expansion-progress.md).
