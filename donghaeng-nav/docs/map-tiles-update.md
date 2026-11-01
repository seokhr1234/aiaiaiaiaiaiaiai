# 지도 배경 수정 — 2026-10-31

전달 폴더 프로젝트를 유지하고 bbb의 OSM 타일/Leaflet 초기화 구현을 참고했다.

## 원인과 수정

단일 HTML 빌더가 서울 전체 캔버스 배경 위에 학교 주변 drawEmbeddedMap 배경을 추가했다. 서울 캔버스는 moveend/zoomend에만 다시 그려지고 Leaflet 확대 애니메이션 변환을 구현하지 않아 배경끼리 어긋날 수 있었다.

- HTTP(S) 실행: OSM 표준 raster 타일을 Leaflet TileLayer로 표시한다.
- 학교 주변 별도 배경과 희미한 전체 도로망 덧그리기를 제거했다. 경로·시설 레이어는 유지한다.
- 파일 단독 실행/통신 실패: 내장 서울 OSM 스냅샷을 Leaflet GridLayer의 타일 좌표계로 그린다. 통신 복구 후 대체 배경을 제거한다.
- 지도 연결 상태, 실패 안내, 다시 연결 버튼을 추가했다. 빈 배경 자료는 경로 준비를 막지 않는다.
- ResizeObserver로 모바일·발표 모드 크기 변경을 반영한다. 목적지 핀 드래그 후 불필요한 자동 중앙 이동을 제거했다.
- Windows 실행 파일과 브라우저 실행 지원을 추가했다. HTML 3종을 같은 빌드로 갱신한다.

## 검증

- `test-map-tiles.cjs`: 실제 OSM 타일/Referer, 단일 배경, 마우스 드래그, 커서 중심 휠 확대, 축소 버튼, 타일 실패/복구, 오프라인/온라인 전환, 모바일/발표 모드 크기, 분리 소스/단일 HTML, 빈 내장 배경을 검사했다. 상세 결과는 map-tiles-results.json에 있다.
- `test-auto-plan-ui.cjs`: 모의 Gemini로 자동 해석·경로·캐시·실패·시설 토글을 검사했다. 실제 키를 사용하지 않는다.
- `test-final-ui.cjs`: 단일 HTML 오프라인, 시설 팝업·토글, 저장·재열기, 시뮬레이션, 목적지 검색, 모바일, GPS 거부 경로를 검사했다.
- `test-terrain-review.cjs`, `test-routing-uncertainty.cjs`: 기존 지형 해시 검증과 경로 정책 회귀 검사를 통과했다.
- HTML 3종의 SHA-256 일치 및 API 키 미포함을 확인했다.

OSM 타일은 온라인 배경만 바꾼다. 도로망/시설 데이터 갱신이나 1:1,000 정밀지도 확보, 현장 경로 정확성·통행 안전 검증을 뜻하지 않는다.

OSM 정책: https://operations.osmfoundation.org/policies/tiles/
Leaflet 문서: https://leafletjs.com/reference.html#tilelayer
