# ODsay -98 근거리 검색 제한 처리

2026-11-14 KST. 사용자가 ‘업체 오류 코드 -98’을 보고했다.
[현재 공식 v1 검색 오류표](https://lab.odsay.com/guide/releaseReference)는 -98을
‘출, 도착지가 700m이내입니다’로 명시한다. 인증/결제 오류로 분류하지 않는다.

- 서버는 유효 입력의 직선거리 700m 이내를 업체 호출/호출 예산 소비 전에 차단한다.
  HTTP422 `transit_distance_too_short`, providerCode `-98`, reason `distance`로 응답한다.
- 업체가 실제 -98을 반환해도 같은 분류를 적용한다. 원문 오류/키를 노출하지 않는다.
- 메인은 ODsay 공급자임을 확인한 경우 근거리를 미리 안내한다. 이 공급자 제한을
  선택적 로컬 파일 교통 검색에 일괄 적용하지 않는다. 새 typed 응답과 이전 서버의
  providerCode -98 모두 처리한다.
- 결과에 ‘같은 조건으로 도보 찾기’와 ‘출발·도착 수정’을 제공한다. 자동으로 도보로
  바꾸거나 짧은 거리라는 이유로 통행/접근성을 확정하지 않는다. 휠체어·계단·경사·
  휴식 조건은 그대로 재계산하며 자료 부족은 실패/미확인으로 유지한다.
- 입력이 바뀌면 이전 거리 안내를 지운다. 결과에서 위치 수정→질문→‘한 번에 입력’으로
  돌아갈 때 모바일 입력이 결과 모드에 숨는 문제도 수정했다.

변경: `services/transit/odsay.mjs`, `dist/app.js`, `trip-questions.js`, `transit.css`,
공통 빌드/무결성·HTML5개·전달/패키지 해시. 원본/엔진과 research는 보존한다.

검사: `test-transit-distance.mjs`의 0/200/699/701m 경계·예산·업체 응답/원문 비노출,
`test-transit-distance-ui.mjs`/`--bundle`의 모바일·근거리/먼 좌표 업체 -98·기존 응답·
위치 수정·명시적 도보 전환/동일 조건·자료 부족 처리. transit-main-core/edge/vercel,
expansion-core 및 질문 UI도 검사했다. 실제 업체 추가 요청0건.

[코어](transit-distance-core-results.json), [화면](transit-distance-ui-results.json),
[단일 HTML](transit-distance-bundle-ui-results.json), [보존 검사](transit-distance-release-integrity.json).

로컬4187 서버를 재시작해 반영했다. 실제 서버에 가까운 공개 좌표를 요청해422와
업체 시도 횟수 증가0을 확인했다. 기존 키는 숨김 입력/서버 메모리만 사용했고 저장하지
않았다. 사용자 실제 위치/업체 전체 응답을 수집하거나 GitHub에 푸시·배포하지 않았다.
