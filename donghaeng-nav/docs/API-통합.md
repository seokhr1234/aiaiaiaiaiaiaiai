> 현재 버전은 상태 입력 후 자동 AI 해석·지형 경사·벤치·쉼터 경유를 지원합니다. 아래는 이전 단계 기록이며 최신 동작·측정은 [자동 추천](자동-상태-경로추천.md)과 auto-routing-engine-results.json을 기준으로 합니다.

# API 연결 버전 통합 · 2026-10-31

가져온 자료: /Users/yooseokhyeon/Downloads/bbb. 통합 기준: 기존 Documents/ChatGPT/bbb의 월곡역 최종본. 가져온 예전 화면을 덮어쓰지 않고 Gemini 상태 해석 기능만 이식했습니다. 자료 원문과 README는 기능을 파악하기 위한 참고 자료로 취급했습니다.

## 결과

기존 월곡역 출발점, 비교 시연, 발표 모드, 시설 토글·검색·팝업, 순서 안내·저장·GPS와 모든 시설 기록을 유지했습니다. 현재 시설 원본은 17,485건이며 통합 전후 내용과 SHA-256이 같습니다. HTML 두 파일도 함께 갱신했습니다.

다운로드 버전에는 POST /api/analyze-condition을 호출하는 화면 코드와 .env.example만 있었고 실제 API 처리 서버·발급 키가 없었습니다. 기존 server.mjs는 HTML만 제공했습니다. 누락된 서버를 구현하고 키를 서버에서만 읽도록 했습니다. 서버는 root의 최종 HTML과 /app/ 개발 화면을 같은 주소에서 제공합니다. 외부 배포는 없습니다.

## 실행

프로젝트 상위 폴더에서 node server.mjs → http://127.0.0.1:4173 접속. 동행길-실행.command도 같습니다. donghaeng-nav/.env의 GEMINI_API_KEY를 설정한 후 재시작합니다. 키 없이도 길 찾기는 됩니다. 포트는 PORT로 바꿀 수 있습니다.

Gemini 버튼을 눌러야 상태 문장을 전송합니다. 위치·목적지·시설·도로 데이터는 보내지 않습니다. 응답의 boolean과 휴식 간격을 검증하고, 휠체어는 등록 계단 제외를 강제합니다. 기기 내 경로 엔진이 실제 자료로 경로를 계산합니다. 응답 대기 중 입력·조건이 바뀌면 취소하고 이전 응답을 적용하지 않습니다. 시간 초과·키 없음·한도 초과·잘못된 응답은 기기 내 해석으로 전환합니다.

서버 없이 HTML을 직접 열 때는 기존 오프라인 기능을 유지합니다. Gemini 버튼은 서버 실행 안내만 보여 주며 임의의 외부 서버로 상태를 보내지 않습니다.

## 검증 범위

- test-condition-api.mjs: 올바른 Gemini 요청 구조, JSON 응답 검증, 휠체어 계단 제외, 키 미설정, 시간 초과, 한도 초과, 잘못된 응답, 상태 문장 외 필드 거부, 비공개 파일 접근 차단.
- test-condition-ui.cjs: 브라우저에서 AI 조건 적용 후 실제 월곡역 경로 탐색, 이전 응답 무시, 실패 시 기본 해석, 모바일 390px.
- 기존 시설·경로·데이터 내장 검증을 재실행.
- 제공된 키가 없으므로 API 응답은 테스트 안에서만 대체했습니다. 실제 Google Gemini 요청 성공은 미확인입니다. 앱 실행에서는 이 테스트 대체 응답을 사용하지 않습니다.

API 계약은 Google 공식 문서 https://ai.google.dev/gemini-api/docs/generate-content/structured-output 의 generateContent JSON 구조를 참고했습니다. 사용 모델은 가져온 GEMINI_MODEL 설정을 유지합니다.

## 주요 변경

server.mjs, donghaeng-nav/server.mjs, dist/condition-ai.js, dist/app.js, dist/index.html, dist/style.css, scripts/build-html.py, API 검증 2종, README·.env.example·.gitignore, 실행 command, 최종/시연 HTML. 키 파일 .env는 비공개이며 버전 관리 대상에서 제외합니다. 기존 수집 자료 파일은 그대로 보존합니다.
