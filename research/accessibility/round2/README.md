# 동행길 2차 접근성 조사

작성일: 2026-10-31 (Asia/Seoul).

**최신 통합본은 [2차 조사 보고서](보고서.md)입니다.** 원본 확보 전의 조사뿐 아니라 후속 API 수집과 사용자가 첨부한 경량 묶음의 실제 데이터를 반영했습니다.

## 현재 확보 상태

| 항목 | 결과 |
| --- | --- |
| 학교 2km 횡단보도 | 1,260행, CSV·GeoJSON |
| 학교 2km 지형 | 등고선 151개, 표고점 727개 |
| 월곡로 보도 대장 | 6행 후보, 학교를 명시한 4행의 대장상 폭 3.0~3.2m |
| 현재 OSM 경로 | 15way에 대응하는 부분 간선 66개 |
| 주변 OSM 시설 | 작은 경로 주변 bbox의 171개 객체 |
| 경로 20m 안 횡단부 후보 | 15행, 실제 보행면 연결은 미확인 |

**실제 추출 CSV·GeoJSON이 이 저장소에 들어와 있으며, 추가 전달된 전체 원본 ZIP도 이 환경에 복원했습니다.** 179개 원본 파일은 저장소 밖에 보관했습니다. 목록의 178개 파일·HTTP body 43개와 원본 CSV/XLSX/SHP 추출 과정을 직접 검증했습니다. [원본 보관 안내](full-originals.md), [전체 원본 검수](full-original-validation.json)를 참고하세요. 현장 경사·턱·최소 유효폭·통행 가능성은 여전히 미검증입니다.

## 파일 안내

- [통합 보고서](보고서.md): 결과·출처·기준일·한계·앱 적용 권고.
- [첨부 추출본과 로그](acquired-2026-10-31/README.md): 원본 첨부의 29개 파일을 그대로 보존.
- [직접 재검증 결과](compact-validation.json): 28개 파일 체크섬, CSV/GeoJSON 2,375개 도형, 거리·집계·관리번호 결합 검수.
- [이전 정보](import-manifest.json): 경량 ZIP 해시와 검증 범위.
- [전체 원본 복원](full-original-restoration.json): 분할 4개·전체 ZIP 해시와 보관 경로.
- [전체 원본 검수](full-original-validation.json): 원본 178개 해시·응답 43개·원본 표/도형과 추출본 대조.
- [횡단부 우선 검토 후보](route-crossing-candidates.csv): 현재 경로 중심선에서 20m 이내인 15행. 가까움만으로 실제 횡단을 확정하지 않음.
- [통합 출처 인덱스](source-index.json), [결과물 해시](artifact-manifest.json): 초기 실패와 후속 성공을 모두 보존. 요청 수는 데이터셋 수가 아님.

## 조사 단계별 기록

- [취득 전 통합 기록](pre-acquisition-summary.md): 당시 원본 미확보 상태를 기록한 역사적 문서.
- [경사·지형 조사](terrain/report.md), [보도·턱·폭 조사](sidewalk/report.md), [출입·시설 조사](entrances/report.md), [OSM 교차 검증](crosscheck/report.md): 네 담당의 취득 전 심층 조사.
- [다른 대화 결과 요약](resumed-thread/README.md): 실제 파일 첨부 전 대화에서 읽어온 결과. 그 뒤 첨부 추출본을 위 폴더로 가져왔으므로 현재 상태는 최신 보고서를 따름.
- [취득 전 검토 지도](integration/review-map.html): 기존 스냅샷과 계산 경로의 검토 도구. 새 횡단보도·지형 추출본을 포함한 지도가 아님.

독립 검수 스크립트는 integration/validate-compact-bundle.py이며 pyproj·shapely가 필요합니다. 앱 코드와 배포는 이번 보고서 작성에서 변경하지 않았습니다.
