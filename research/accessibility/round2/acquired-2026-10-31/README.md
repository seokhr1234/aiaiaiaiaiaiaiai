# 동행길 학교 주변 분석 경량 묶음

보고서.md, analysis/summary.json, 학교 주변 추출 CSV·GeoJSON, 요청 로그, 출처·해시 목록을 포함합니다.

- analysis/crossings-school-2km.csv 및 .geojson: 횡단보도 1,260행.
- analysis/terrain/: 등고선 151개, 표고점 727개. CSV는 속성표이며 선형은 짝인 GeoJSON에 있습니다.
- analysis/osm-access-features.*: 경로 주변 bbox의 OSM 대상 객체. 2km 전역 전수자료가 아닙니다.
- analysis/current-route-segments.*: 현재 OSM 원본과 대조한 기존 경로 부분 간선.
- analysis/sidewalk-road-name-candidates.csv: 월곡로 대장상 구간 6행. 좌표로 검증한 구간은 아닙니다.
- CSV는 Excel에서 한글을 읽기 쉽도록 UTF-8 BOM으로 저장했습니다. 중첩 속성은 점(.)으로 연결한 열 이름으로 펼쳤습니다. 점 CSV에는 longitude/latitude를 추가했습니다. 선 CSV에는 좌표를 임의 대표점으로 변환하지 않았습니다.
- sources/source-request-index.csv: 실제 요청별 출처 URL, 시각, HTTP/API 코드, 원본 응답 SHA-256. 원본 응답 자체는 제외했습니다.
- sources/full-run-artifact-manifest.json: 전체 수집 당시 원본·산출물의 해시 목록입니다. 이 목록에 있는 파일 모두가 이 ZIP에 포함된 것은 아닙니다.
- artifact-manifest.json, SHA256SUMS.txt: 이번 ZIP에 실제 포함된 파일의 바이트·해시 목록입니다.
- validation.json은 전체 수집 작업 당시 검증 기록, bundle-validation.json은 이번 경량 묶음 검증 기록입니다.

대용량 원본, HTTP 응답 body, 전체 GIS ZIP/XLSX/CSV, 설치 의존성, 재현 스크립트는 제외했습니다. 원본 경로와 보고서의 재현 명령은 수집 당시 작업환경을 가리키며 이 ZIP만으로 원본 재분석을 실행할 수 있다는 뜻이 아닙니다. 포함된 GeoJSON·CSV는 분석에 쓰기 위한 지역 추출본입니다. 현장 실측 또는 현재 통행 가능 판정을 뜻하지 않습니다.

공식자료 이용조건은 조사 보고서의 출처 기록을 따릅니다. OSM 자료는 © OpenStreetMap contributors, ODbL 1.0입니다.
