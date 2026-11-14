# 동행길 — 메인 프로젝트

현재 기본 프로그램은 **동행길**입니다. 최신 GPS 따라가기 버전을 분리 소스로 옮겨 Node 서버, Vercel 정적 화면, 단일 HTML이 같은 코드를 사용하도록 정리했습니다. 서비스 이름은 동행길로 통일하며, 기존 파일명과 저장 데이터 키는 호환성을 위해 유지합니다.

전체 변경은 [수정이력.md](수정이력.md), 작업 규칙은 [AGENTS.md](AGENTS.md), 이번 전환의 근거와 검사 범위는 [메인 전환 기록](donghaeng-nav/docs/main-navigation-promotion.md)을 참고하세요.

운영 주소: **[donghaeng-gill.vercel.app](https://donghaeng-gill.vercel.app)**. 2026-11-14 최신 feature 커밋을 `main`에 반영해 운영 배포를 완료했습니다. 서울 기본 화면·확장 화면·서울 도보 API·모바일·실제 OSM 배경 로딩을 공개 주소에서 확인했습니다. [배포·브랜치 구조 대조·검사 기록](donghaeng-nav/docs/production-deployment-2026-11-14.md). 이전 11월 13일의 운영 주소 404 기록은 당시 상태입니다.

2026-11-14 후속: [대중교통 우선 실행 계획](donghaeng-nav/docs/transit-next-plan-2026-11-14.md). 메인 버스·지하철 선택과 참고 후보/노선/승하차 표시를 구현·배포했습니다. 실제 ODsay 검색은 업체 오류로 실패해 계정 설정 확인을 남겼으며 [구현·운영 검사·남은 작업](donghaeng-nav/docs/transit-main-publish-2026-11-14.md)에 구분했습니다. UI 겹침과 버튼 디자인의 전체 최적화는 마지막 T10 단계입니다.

최신 발표자료: [동행길 발표자료 최종본](동행길_발표자료_최종.pptx).

2026-11-10: [자율 점검 9개 항목 수정·검증](donghaeng-nav/docs/audit-fixes.md). 필수 휴식 재탐색 검증, 도착 예상 시각의 쉼터 운영시간 확인, 기기 내 문장 해석, 저장 복구와 모바일·키보드 조작을 보완했습니다. 건물 도형과 겹치는 목적지는 지도에서 실제 진입 위치를 지정하거나 검토용 경로를 명시적으로 선택합니다. 출입구 좌표를 새로 검증한 것은 아닙니다.

2026-11-11: [서울 전역 보행·정밀지도·대중교통 확장 계획](donghaeng-nav/docs/seoul-expansion-plan.md). 네이버 API 없이 OSM·Leaflet·자체 보행 계산을 유지하고, 자료 분할·서버 계산·대중교통 후보 API·접근성/환승 검증을 단계적으로 추가하는 계획입니다. 확장 기능 구현 전이며 자료 확보·계약·현장 검증의 완료와 구분합니다.

2026-11-11 후속: [확장 구현 현황·완료/남은 계획](donghaeng-nav/docs/seoul-expansion-progress.md). `/expansion.html`에 영역별 자료·시설 검색·서버 보행·대중교통 참고 화면을 추가했습니다. 보행 범위는 기존 월곡이며 새 서울 주변 OSM 추출본은 연구용으로 보존합니다. [Vercel `ODSAY_API_KEY`와 자료 서버 연결](donghaeng-nav/docs/expansion-service.md).

2026-11-11 재개: 기반 구현 `9282ea6`을 푸시하고 후속으로 [PostGIS 실제 API 조회](donghaeng-nav/docs/postgis-api-results.json)를 연결했습니다. 기본 메모리 조회를 유지하며 자료 서버의 `DONGHAENG_DATABASE_URL`로 선택할 수 있습니다. [같은 OSM 원본의 참조 보완·제한 관계 구조 점검](research/accessibility/round6-2026-11-11/README.md)도 진행했습니다. 운영 DB 배포·서울 전역 길찾기·실제 ODsay 키 호출·현장 검증은 남아 있습니다.

2026-11-11 추가: 후속 `1030164`도 푸시했고, [도로 노드 태그 16,611개 복구·전체 보행 태그 점검](research/accessibility/round7-2026-11-11/README.md)과 [월곡 서버의 고정 100쌍/동시 10요청 성능 기준선](donghaeng-nav/docs/walk-api-performance.md)을 추가했습니다. 등록 태그를 현장 검증으로 바꾸거나 새 서울 경로망을 활성화하지 않았습니다.

2026-11-11 성능 후속: 고정 서버 그래프의 건물 검사 캐시를 재사용하고 기존 코드와 조건/경로 결과를 대조했습니다. 같은 100쌍의 후보 있음/없음은 유지됐고 p50은 2.415→2.173초, p95는 약 5.23초였습니다. [비교·남은 목표](donghaeng-nav/docs/walk-api-performance.md). 서울 전역·동시 10개·3초 목표는 아직 미달입니다.

2026-11-11 검토 그래프: [원본 노드만 사용하는 광역 후보 1,305,938구간](research/accessibility/round8-2026-11-11/README.md)을 별도 생성·검증했습니다. 가중치·추정 연결·새 경사값을 추가하지 않았고, 정밀/보도/구조물·현장 검증 전이므로 활성 월곡 길찾기는 유지합니다.

2026-11-13 재개: 사용량 중단으로 커밋 전이었던 round8 검토 그래프와 기존 원본·서비스·실행 파일을 [다시 대조](donghaeng-nav/docs/resume-2026-11-13.json)해 보존합니다. 원본 수집일 11월 11일과 자료 기준 11월 9일은 그대로이며, 재개일을 새 자료 기준일로 바꾸지 않습니다.

2026-11-13 지도 연결: `/expansion.html`에 **OSM 등록 접속점 · 현장 미확인** 레이어를 추가했습니다. 복구 원본의 31,934개 지점을 영역별로 조회하며 Vercel에서 별도 키·자료 서버 없이 표시합니다. [출처·등록값·검사·사용법](donghaeng-nav/docs/expansion-service.md). 보행 출입구·턱/폭·승강기 운행을 확인한 자료로 사용하지 않으며 활성 길찾기는 기존 월곡 범위입니다.

2026-11-13 서울 확대: 기본 화면·등록 장소 검색·출발/도착 선택을 서울 전역으로 바꾸고, **서울 도보 참고 계산**을 별도 API로 연결했습니다. 원본 연결/건물 검사를 거친 963,670구간을 사용하며 ODsay 키·자료 서버 없이 동작합니다. 파란 정밀 경계선은 기본으로 끄고 확대 후 선택 표시하며 시설은 함께 묶습니다. **교량·지하/층위 보류로 연결되지 않는 곳이 있으며 서울 전역 휴식·휠체어 접근성 검증·GPS 경로 안내는 미완료입니다.** [구현·화면·검사·남은 작업](donghaeng-nav/docs/city-walk-2026-11-13.md). 기존 월곡 상세 기능과 연구/원본 9개는 보존합니다.

## 실행

Node.js 18 이상에서 저장소 최상위에서 실행합니다.

```sh
node server.mjs
```

기본 주소는 `http://127.0.0.1:4173`입니다. 포트 충돌을 피하려면 다음 launcher를 사용하세요.

```sh
node donghaeng-nav/scripts/launch.mjs --no-open
```

| 주소·파일 | 역할 |
| --- | --- |
| `/`, `/app/` | 같은 최신 메인 프로그램의 분리 소스 화면 |
| `/setup` | 로컬 서버의 Gemini 키 설정 화면 |
| `/expansion.html` | 서울 OSM 도보 참고 계산·등록 접속점은 키/자료 서버 없이 제공. 대중교통 후보는 `ODSAY_API_KEY`, 기존 시설/정밀·월곡 서버 상세 보행은 별도 자료 서버 필요 |
| `/동행길-최종.html` | 같은 프로그램을 단일 파일로 묶은 호환 주소 |
| `동행길-최종.html`, `동행길-시연.html`, `동행길-전달용.html` | 같은 빌드의 호환 파일명 |
| `이동약자-내비게이션-실행패키지/`의 HTML 2개 | 같은 빌드의 휴대폰·컴퓨터 전달용 파일 |

파일 앱의 단순 미리보기는 JavaScript 실행 브라우저와 다릅니다. 파일 실행의 GPS·온라인 타일 지원은 브라우저 보안 정책에 따라 제한될 수 있습니다. 실제 휴대폰 파일 앱의 지원을 확인한 것으로 간주하지 마세요.

## 현재 포함한 기능

- 상태 문장과 출발지·목적지를 입력하고 길 찾기를 한 번 누르면 이동 조건을 해석합니다. 별도 조건 체크박스나 AI 실행 버튼은 없습니다.
- 서울 전역 기본 지도·등록 시설 이름/주소 검색·핀 지정과 OSM 도보 참고 계산을 제공합니다. 미확인 연결은 보류하며 경사 결측을 0으로 바꾸지 않습니다. 월곡 상세 시연의 휴식·저장·제보·GPS 기능을 유지합니다. 시설 토글은 표시만 바꿉니다.
- 공식 쉼터 4,092곳에 최신 전체 자료 대조일을 표시하고, 기존 시설과 대응시킨 공지 3건을 연결합니다. 운영 안내가 다른 2곳은 경고를 표시하고 자동 휴식 후보에서 제외합니다. [지도 근거 연결](donghaeng-nav/docs/research-map-linkage.md).
- 1:1,000 지도 16도엽의 **기존 변환 자료 16,169피처**를 검토 레이어로 포함합니다. 도로·보도 경계를 검증된 보행 중심선으로 취급하지 않습니다.
- 지상 경로와 건물 내부의 겹침 제외, 도로 선분 연결, 출입구·승강기 연결 미확인 표시를 포함합니다. 학교 안내점은 건물 앞 도로 기준이며 실제 출입문 검증은 아닙니다.
- GPS 점프·오래된/저품질 표본을 거르고 위치 표시를 안정화합니다. 수신 오차를 줄여 표시하지 않으며 원래 좌표로 진행·도착을 판단합니다.
- 경로 GPS 안내·모의 재생, 다음 행동·남은 거리, 일시정지·종료·휴식/도착 확인을 제공합니다. 위험 검토 대안의 실제 GPS 안내는 제한합니다.
- 경로 안내와 별개의 위치 추적, 정확도 원·신호 상태, 현재 위치를 따라가는 지도와 드래그 후 따라가기 복귀 기능을 포함합니다.
- 이용안내는 세 단계 카드·짧은 필수 확인·펼침형 질문으로 제공합니다.
- 동일한 이동 조건으로 최대 24회(약 4초 예산) 경로를 탐색하고, 도로가 다른 대안 최대 5개를 Gemini가 비교합니다. 중복과 이점 없는 과도한 우회는 제외하되 조금 긴 대안을 모두 버리지는 않습니다. 결과의 **이 길을 선택한 이유**에서 선택 당시 설명·장단점·후보 수치를 확인할 수 있습니다.
- 후보가 하나면 알고리즘으로 선택하고, 조건을 만족하는 후보가 없으면 검토용 경로를 AI 추천과 분리합니다. 비교 실패·시간 초과도 알고리즘 선택으로 표시합니다.

### AI와 저장

HTTP(S)에서는 서버의 `/api/analyze-condition`을 사용합니다. 로컬 키는 `/setup`에서 입력하고 Vercel 키는 해당 프로젝트의 환경변수로 관리합니다. 키를 채팅·HTML·Git에 넣지 마세요.

단일 HTML의 `file:`/`content:` 실행에서는 창에서 입력한 Gemini 키로 직접 연결할 수 있습니다. 키는 창 메모리에서만 사용하며 키 미입력·연결 실패는 기기 내 해석으로 구분합니다. 실제 키·모델·할당량은 별도 확인이 필요합니다.

조건 해석에는 상태 문장을 보내고, 후보 비교에는 상태 문장·이동 조건과 익명 경로 번호별 거리·참고 경사·미확인 구간 등 요약을 추가로 보냅니다. 좌표·출발/목적지 이름·지도 도형을 자동 전송하지 않습니다. 선택 이유 버튼은 보관된 최종 답변을 보여 주며 추가 API 요청을 하지 않습니다. 온라인 배경지도는 현재 영역의 타일을 OpenStreetMap에 요청합니다. 경로와 제보는 이 브라우저에 저장되고 다른 기기와 동기화되지 않습니다. 기존 저장 키를 유지해 이전 저장 내용이 사라지지 않도록 했습니다.

## 개발·빌드 기준

실제 편집 대상은 `donghaeng-nav/dist/`입니다. 예전 최상위 `dist/` 목업을 다시 만들지 마세요.

| 경로 | 내용 |
| --- | --- |
| `donghaeng-nav/dist/index.html`, `style.css`, `app.js` | 메인 화면·스타일·동작 |
| `engine.js`, `endpoint-routing.js`, `precision-connections.js`, `access-review.js` | 기존 엔진과 선분 연결·건물 겹침·제보 검토 |
| `route-candidates.js`, `route-choice.js` | 후보 생성·익명 비교 계약·Gemini 응답 검증 |
| `navigation-*.js`, `gps-tracker.js`, `gps-quality.js` | 경로 안내·독립 위치 추적·공통 GPS 품질 필터 |
| `terrain-evidence.js`, `data/terrain/evidence.json` | 도로별 표고 근거 표시 (경사 계산·가중치에 미사용) |
| `condition-ai.js`, `condition-request.js`, `portable-ai.js` | AI 응답 처리와 파일 실행 연결 |
| `data-loader.js`, `data/precision/` | 런타임 자료 로딩과 정밀지도·횡단부·접속 제보 |
| `runtime-integrity.json` | 승격한 런타임 자료·보호 코드의 해시와 출처 스냅샷 |
| `donghaeng-nav/server.mjs`, 최상위 `server.mjs` | Node 서버와 진입점 |
| `api/index.mjs`, `vercel.json` | Vercel API·정적 소스 설정 |

```sh
python3 donghaeng-nav/scripts/build-html.py
```

이 명령은 현재 런타임 자료와 보호된 경로 코드의 해시, 도로망·지형 검토의 연결을 확인하고 단일 HTML 5개와 해시 기록을 재생성합니다. 원본 GIS 전처리를 자동 재실행하지 않습니다. 입력이 달라지면 실패하며, 검증을 생략하거나 기존 해시를 임의로 맞추지 마세요.

원본 9개 JSON/GeoJSON을 보존하며 같은 내용의 `.gz` 배포 파일도 생성합니다. 서버 화면은 압축 자료를 병렬로 준비하고, 서울 배경지도와 추가 표고 근거는 필요할 때 읽습니다. 필수 정밀지도·건물 겹침·지형 검토는 길 찾기 전에 준비합니다. Node 정적 응답은 gzip·ETag 재검증을 지원합니다.

지형·경로 입력 변경은 원본/좌표계/수직기준·기존 GIS 검증과 실제 경로 검토를 먼저 수행한 뒤 근거와 함께 무결성 기록을 명시적으로 갱신해야 합니다. `prepare-terrain.py`·시설 전처리·`review-terrain.py`는 원본이 갖춰진 환경에서 사용하는 별도 절차로 유지합니다. 이 저장소의 변환본을 원본 DXF/XML 재입수·재변환 검증 완료로 해석하지 마세요.

최상위 `유석…html` 두 파일은 이전 전달 스냅샷입니다. 메인 소스를 수정하고 공통 빌드를 사용하세요. 실행 패키지는 별도 개발 분기가 아니라 같은 빌드의 전달용 복사본입니다.

### 확인 명령

```sh
node donghaeng-nav/scripts/test-city-walk.mjs
node donghaeng-nav/scripts/test-city-map-ui.mjs
node donghaeng-nav/scripts/test-city-layers.cjs
node donghaeng-nav/scripts/test-expansion-core.mjs
node donghaeng-nav/scripts/test-expansion-ui.mjs
node donghaeng-nav/scripts/test-transit-edge.mjs
node donghaeng-nav/scripts/test-transit-vercel.mjs
node donghaeng-nav/scripts/test-audit-fixes.cjs
node donghaeng-nav/scripts/test-audit-fixes-ui.cjs
node donghaeng-nav/scripts/test-audit-boot.cjs
node donghaeng-nav/scripts/test-gps-quality.cjs
node donghaeng-nav/scripts/test-gps-quality-ui.cjs
node donghaeng-nav/scripts/test-evidence.cjs
node donghaeng-nav/scripts/test-navigation-core.cjs
node donghaeng-nav/scripts/test-condition-api.mjs
node donghaeng-nav/scripts/test-vercel-api.mjs
node donghaeng-nav/scripts/test-main-navigation.cjs
node donghaeng-nav/scripts/test-route-choice.cjs
node donghaeng-nav/scripts/test-route-choice-real.cjs
node donghaeng-nav/scripts/test-route-choice-ui.cjs
```

브라우저 검사에는 Playwright와 Chromium이 필요합니다. 시스템 브라우저 사용 시 `CHROME_PATH`를 지정하세요. 모의 Gemini·GPS 검사를 실제 기기·실제 생성·현장 검증으로 해석하지 마세요.

Vercel은 저장소 최상위 Root Directory와 `donghaeng-nav/dist`를 사용합니다. `/app/`도 같은 화면으로 연결합니다. `[skip vercel]` 커밋은 `ignoreCommand`로 자동 빌드를 생략합니다. 사용자 지침에 따라 커밋·푸시 시 Vercel 자동 배포는 기본 허용합니다. 배포 생략을 별도로 요청한 경우에만 해당 표시를 넣습니다. 자세한 서버 API 설정은 [Vercel API 안내](donghaeng-nav/docs/vercel-api.md)를 참고하세요.

구현과 검증 범위: [Gemini 경로 비교·선택과 이유 표시](donghaeng-nav/docs/ai-route-choice.md). 실제 사용자 키로 새 비교 API를 호출하는 검증과 현장 통행 검증은 별도입니다.

## 아직 확인이 필요한 것

- 턱·최소폭·보도 편·출입구·횡단 연결·승강기 문/운행과 실제 휠체어 통행은 현장 검증이 필요합니다. 건물 겹침 제외나 화면 표시가 통행 안전을 입증하지 않습니다.
- 정밀 변환본의 EPSG:5186은 자체 메타데이터상 좌표·도엽 배치에서 추론한 값이며 수직 기준도 미확인입니다. 원본 DXF/XML을 이번 전환에서 재입수·재변환하지 않았습니다.
- OSM 등록 경사, Tilezen 추정, 서울 표고·등고선과 Copernicus 비교 자료를 구분합니다. 고도 자료는 보도 노면 실측이 아니며 결측을 0%로 처리하지 않습니다.
- 과거 남쪽/약 3km 우회는 사용자가 정답으로 인정하지 않았습니다. 최신 검토 경로도 현장 정답으로 확정하지 마세요. 승강기 접속 제보는 연결 가설이며 실측 동선이 아닙니다.
- 일반 GPS 진행 35m, 이탈·재탐색 품질 25m, 도착 15m 기준은 기술 시연 정책입니다. 자동 재탐색은 실기기 검증 전 기본 비활성입니다.

## 자료 보존·이력

사용자 최상위 `research/`는 삭제·덮어쓰지 않습니다. `.env`, 인증서, 개인 위치 로그, 대용량 로컬 조사 원본은 Git에 포함하지 않습니다. `donghaeng-nav/data/`의 기존 추적 자료와 출처를 보존합니다. 모든 수정은 최상위 수정이력에 날짜(KST)·요청·변경·검증·남은 한계를 추가합니다.

이전 기록의 ‘정밀지도 미연결’·구버전 화면 설명은 당시 상태입니다. 현재 상태는 이 README와 [메인 전환 기록](donghaeng-nav/docs/main-navigation-promotion.md)을 우선하고, 과거 검사 기록은 해당 시점의 결과로 읽어 주세요.

2026-11-05: [쉼터 15곳 근거 보강·표고 근거 추출·GPS 안정화 보고서](research/accessibility/round3-2026-11-05/README.md). 새 시설 좌표나 실측 경사로 오인하지 않도록 원문·미수집·현장 미확인 상태를 구분합니다.

2026-11-05 후속: [새 환경 실제 수집·쉼터 전체 CSV/OSM/표고 원본 대조](research/accessibility/round4-2026-11-05/README.md). 쉼터 4,092행과 최신 OSM·서울 표고 ZIP 2개를 확보하고 운영시간 차이·접근 실패를 기록했습니다. 앱 자료는 유지하며 NGII 고해상도 새 원본·현장 검증·새 경사 승격은 미완료/0건입니다.
