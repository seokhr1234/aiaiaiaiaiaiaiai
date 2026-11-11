# 같은 OSM 원본의 참조 보완·제한 구조 점검 — 2026-11-11 KST

round3/round4/round5를 덮어쓰지 않은 후속 조사다. 새 외부 자료 수집이 아니라 **round5에서 확보한 같은 대한민국 PBF**의 추가 추출이다. 수집일 **2026-11-11**, 원본 기준 **2026-11-09T21:22:17Z**, 제공처 [Geofabrik/OSM](https://download.geofabrik.de/asia/south-korea.html), 좌표 **경도·위도 EPSG:4326**, 수직 기준 **미확인/null**을 유지한다. 현장 검증은 수행하지 않았다.

원본 291,406,356 bytes의 SHA-256은 `4e44c2315ea171b0c9041e9ea625865163fddaf9325d146884dd00ba9a17484d`다. 이전 파생본을 수정하지 않고 그곳에 없는 관계 멤버를 같은 원본에서 읽었다. 서로 다른 날짜 자료나 추정 좌표로 메우지 않았다.

| 항목 | 실제 결과 | 해석 한계 |
| --- | --- | --- |
| 추가 객체 | 노드 227,066·way 27,338·관계 18 | 나열된 멤버와 그 way 노드 복구이며 보행 가능 구간 수가 아님 |
| 원래 미해결 관계 | 1,634→1개, 1,633개 해소 | 관계 멤버의 참조 완성과 내용/동선 타당성은 다름 |
| 제한 관계 참조 누락 | 원래 24개→0개 | 제한 관계 내용의 보행 적용·정상 구조를 보장하지 않음 |
| 남은 관계 | `3836355`, AH1, way 멤버 977개가 해당 PBF에 없음 | 보관된 태그/ID로만 기록하며 누락 위치·지나가는 길을 추정하지 않음 |
| 추가 way의 참조 노드 누락 | 0개 | 층위·횡단·출입구·통행권한·현장 상태는 별도 확인 |
| 제한 구조 검토 | 6,046개 중 628개 관계에 하나 이상의 구조 검토 신호 | 신호를 모두 데이터 오류로 확정하지 않음. 어떤 추출 단계에서 역할이 누락됐는지도 미확인 |
| 조건·보행 태그 | 조건부 제한 3개, 보행 전용 제한 태그 0개 | 조건을 실행 평가하지 않으며 보행 태그 부재를 통행 허용으로 바꾸지 않음 |

구조 검토 신호는 `from` 누락 209개·`to` 누락 211개·`via` 누락 215개, via 노드가 from/to에 없는 경우 62개, via way 노드 단절 5개, 내부 노드 분할 필요 18개, 복수 from/to 64개, 지원하지 않는 역할 11개, 복수 공유 노드 4개다. 항목은 중복된다. 단순 공유 끝점 5,273개와 공유 노드 way 체인 145개도 실제 층위·통행 가능성을 확인한 것이 아니다.

## 산출물과 보존

- `resolve_members.py`: 해시 확인, 중첩 관계·순환 참조 처리, 객체/깊이 상한, 없는 객체를 그대로 누락으로 보존한다.
- `resolution-results.json`, `validation.json`: 복구 집계·압축/원문 해시와 독립 참조 완결성 검사다.
- `audit_restrictions.py`, `restriction-audit-results.json`: 입력 압축본 해시를 확인하고 역할·공유 노드·조건/예외·구성 way의 access/foot/layer/level 등을 보존한다. 실제 경로에 제한을 적용하거나 통행권을 부여하지 않는다.
- `derived/resolved-members.json.gz`와 `derived/restriction-audit.json.gz`: 무손실 원문 보관, 각각 5,426,065 / 122,596 bytes. `.gitignore`로 로컬 보관하며 해시·코드·집계는 Git에 남긴다. 다른 환경에서는 원본/이전 파생본 확보·해시 검증 후 재현해야 한다.
- `test_resolve_members.py`, `test_audit_restrictions.py`: 작은 실제 PBF와 합성 관계로 중첩/순환·없는 객체·상한·변경 방지, 역할 결측·내부 분할·층위 문맥·조건/예외와 미승격 정책을 검사한다.

## 재현

round5의 원본·파생본과 `osmium==4.2.0` 환경이 필요하다. 출력이 있으면 추출/감사는 중단하므로 새 사본에서 실행하거나 새 조사 경로를 사용한다. 기존 결과를 삭제해 재실행하지 않는다.

```sh
/workspace/.venv-expansion/bin/python research/accessibility/round6-2026-11-11/test_resolve_members.py
python3 research/accessibility/round6-2026-11-11/test_audit_restrictions.py
/workspace/.venv-expansion/bin/python research/accessibility/round6-2026-11-11/resolve_members.py
python3 research/accessibility/round6-2026-11-11/validate_resolution.py
python3 research/accessibility/round6-2026-11-11/audit_restrictions.py
```

새 경사 승격·활성 도로망 교체·신규 현장 검증은 모두 **0건/false**다. 다음은 보행 접근 태그·폭/턱·출입구/층위·관계 구조 검토와 검증된 시범 그래프 구성이다. [프로젝트 완료·남은 계획](../../../donghaeng-nav/docs/seoul-expansion-progress.md).
