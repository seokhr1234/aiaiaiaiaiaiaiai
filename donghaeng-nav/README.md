# 동행길 — 개발 소스

현재 메인 프로그램의 소스는 이 폴더의 `dist/`입니다. 최상위 [README](../README.md)와 [작업 지침](../AGENTS.md)을 먼저 읽으세요.

저장소 최상위에서 `node server.mjs`로 실행하면 `/`와 `/app/`가 같은 최신 화면을 제공합니다. `python3 donghaeng-nav/scripts/build-html.py`는 해시를 확인한 런타임 자료와 분리 소스로 단일 HTML과 전달 패키지를 생성합니다. 원본 GIS 재처리와 단일 HTML 포장은 별도 절차입니다.

정밀지도 변환본, 건물 겹침 검토, 선분 연결, PortableAI, 경로 GPS·독립 위치 추적/따라가기 모듈을 포함합니다. 실제 보행 연결·시설 운행·휴대폰 GPS가 검증된 서비스라는 뜻은 아닙니다.

변경 근거와 재현 검사는 [메인 전환 기록](docs/main-navigation-promotion.md), 전체 이력은 [수정이력](../수정이력.md)을 참고하세요. 기존 `research/`·비밀 설정·현장 검증 제한을 보존하세요.
