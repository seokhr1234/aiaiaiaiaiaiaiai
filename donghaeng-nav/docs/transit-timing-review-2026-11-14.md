# 대중교통 도보 시간 비교·여정 시각 검증 보완

2026-11-14 KST · 기준 `10ad62a` · `feature/gemini-route-selection`에서 재개.
기존 README·진행 계획·도보 연계 기록을 읽고 **T5 일부**를 진행했다.
이번 변경은 로컬 작업이며 커밋·푸시·Vercel 배포는 하지 않았다.

## 구현한 동작

- 메인/확장의 ‘도보 구간 참고 계산’에 등록 도로 도보 합계, 업체 도보 합계와
  차이, 개별적으로 길어진 구간을 표시한다. 합계가 짧아도 출발/환승 도보가
  길어졌으면 승차 시각 재확인을 안내한다. 부분 계산·업체 시간 결측은 합계 차이를
  계산하지 않으며, 업체 총시간에 단순 가산해 도착 시각을 만들지 않는다.
- 공통 `validateJourney`에서 미확인 도보 시간·끊긴 구간·조건/속도 불일치를
  다음 승차에 전파한다. 미확인 시각으로 운행편을 확정하지 않고
  `estimatedArrival`/`estimatedMinutes`를 `null`로 반환한다. 접속/접근성 또는
  운행 상태가 미확인일 때도 전체 도착 시각을 확정하지 않는다.
- 접근성 자료 유효기간은 대기와 승차 구간 끝까지 검사한다. 어댑터 예외는 원문을
  내보내지 않고 미확인으로 처리하며, 비동기 응답 뒤 취소도 확인한다.
- `/api/journeys` 처리기에 **서버가 주입하는** 시간표·접근성 어댑터 연결 지점을
  추가했다. 현재 보행 worker의 `technical_preview`는 시간표를 연결하더라도
  검증된 승하차/출입구 접속으로 바뀌지 않는다.
- API 호출이 없는 `services/transit/timetable.mjs`를 추가했다. 명시된 운행일과
  ODsay 노선/승하차 ID가 일치하는 파일에서 다음 운행편을 선택한다. 자정 이후
  `24:05:00`을 이전 운행일의 다음 날 00:05로 읽는다. 휴일/다른 운행일을 추측해
  복제하지 않으며, 자료가 없으면 ‘운행 없음’ 확정 대신 미확인으로 반환한다.
- 공통 HTML 5개를 재빌드했다. 기존 압축 자료가 원본과 동일하면 그대로 재사용해
  OS/Python/zlib 차이로 지도 압축 파일·내장 데이터가 불필요하게 바뀌지 않게 했다.
  기존 해시·자료 대조를 통과한 데이터만 재사용하며 무결성 검사는 유지한다.

## 시간표 파일 계약과 연결 방법

이 어댑터는 **경로 검색 엔진이나 실제 서울 시간표 자료가 아니다.** 이미 확보한
후보의 한 승차 구간에 대해 운행 시각을 조회한다. 현재 운영 시간표 파일은 없으며,
운영 서버/환경변수에 자동 연결하지 않았다. 클라이언트 요청에 시간표나 검증
주장을 받아들이는 새 API도 만들지 않았다.

스키마: `donghaeng-local-timetable-v1`, `timezone: Asia/Seoul`, `version`,
`source`(자료 출처), 시간대가 포함된 `observedAt`/`expiresAt`, `trips` 배열.
각 행에는 고유 `id`, `idNamespace: ODsay`, `mode: bus|subway`, `lineId`,
`fromId`, `toId`, 실제 `serviceDate: YYYY-MM-DD`, `departs`/`arrives`가 필요하다.
시각은 `00:00:00`~`47:59:59`이며 도착은 출발보다 늦어야 한다. 최대 10만 행이다.
자정 이후 도착을 `00:xx`로 되감은 행은 명시적으로 24시간을 더해 정규화해야 한다.

자료 준비 후 자료 서버 코드에서 `createLocalTimetable(snapshot)`의 반환 함수를
`createExpansionHandler({transit, journeyAdapters: {boarding, access}})`에 넣을 수 있다.
기존 Node 서버에는 그 핸들러를 `createApp({expansionHandler})`로 전달한다.
`access`는 별도 근거를 제공하는 어댑터이며 시간표로 만들어내지 않는다.
지하철 `subwayCode`/이름은 노선 ID 대응의 대체 근거로 인정하지 않는다.
다른 기관의 정류장/노선 ID를 쓰려면 실제 대응 자료를 먼저 검증해야 한다.

정적 시간표 반환은 `evidenceKind: scheduled_snapshot`, `realtimeVerified: false`다.
계획된 편이 있어도 실제 지연/운휴/저상/승강기 운행이나 전체 여정 가능 여부를
검증했다고 표시하지 않는다. 검사 파일의 시간표와 실시간 증거는 **합성 fixture**다.

## 유료 구매 없이 가능한 방법 · 공식 안내 확인

2026-11-14 확인:

1. [ODsay 공식 요금 안내](https://lab.odsay.com/contact/contact)는 개인·학생·5인 이하
   스타트업의 Basic을 **무료, 일 30회, 기간 제한 없음**으로 안내한다. 실제 계정의
   적용 요금제/자격/남은 호출량은 계정에서 확인해야 한다. 이번 작업에서 요금제
   변경·가입·결제·실제 경로 요청은 하지 않았다.
2. [ODsay 공식 서버 인증 답변](https://lab.odsay.com/community/boardView?seq=716)에
   따르면 Server 키는 요청 서버 IP와 등록 IP를 비교한다. 현재 500/인증 범주의
   실패만으로 유료 요금제가 필요하다고 단정할 수 없다. **추론상** 로컬 Node 서버로
   시연하고 해당 출구 공인 IP를 등록하면 유료 고정 서버 구매 없이 시험할 여지가
   있다. 실제 IP/권한/호출 성공은 미검증이고 IP 변경 시 다시 맞춰야 한다.
3. 공식 안내의 Web 키는 프런트엔드 호출용이다. 현재 프로젝트의 서버 전용 키
   규칙을 지키며 서버 키를 화면에 넣거나 Referer를 위조하는 우회는 하지 않는다.
   공개 배포의 안정적인 서버 인증은 별도로 해결해야 한다.
4. [서울 열린데이터광장 Open API 안내](https://data.seoul.go.kr/together/guide/useGuide.do)는
   별도 인증키 발급을 요구한다. ‘유료 API 없이’와 ‘어떤 API/자료도 없이’는 구분해야
   한다. 공공 시간표/노선 파일을 확보해 자체 계산하는 방법도 있으나, 이번 파일
   어댑터만으로 서울 전역 버스·지하철 검색이나 실시간 정보가 완성되지는 않는다.

## 검사 · 이번 실행 결과

- `node donghaeng-nav/scripts/test-transit-timing.mjs`: 자정/운행일, 우회 뒤 다음 편,
  결측·오래된 자료·ID 불일치·변형 입력·취소·예외·연결 단절·조건/속도·승차 중
  유효기간 만료·서버의 참고 경로 승격 금지·시간 비교 검사 통과.
  [새 검사 기록](transit-timing-core-results.json).
- `test-expansion-core.mjs`, `test-transit-main-core.mjs`, `test-transit-edge.mjs`,
  `test-transit-vercel.mjs`, `test-transit-walk-review.mjs`, `test-vercel-api.mjs`,
  `test-city-walk.mjs`: 기존 기능·Node/Vercel 계약 회귀 통과.
- `test-transit-walk-review-ui.mjs`와 `--bundle`: 설치된 Chrome에서 메인/확장/
  단일 HTML·320/393px/가로·후보 전환·캐시·취소·늦은 응답·실패 검사 통과.
  업체/AI는 모의이고 도보는 보존한 서울 OSM 도로망이다.
  [화면 검사](transit-walk-review-ui-results.json),
  [단일 HTML 검사](transit-walk-review-bundle-ui-results.json),
  [데스크톱](transit-timing-desktop.png), [모바일](transit-timing-mobile.png).
- `python3 donghaeng-nav/scripts/build-html.py`: 5개 HTML 공통 빌드·해시 검사 통과.
  [원본·구조·빌드 보존 검사](transit-timing-release-integrity.json).

브라우저 검사는 `playwright`가 필요하며 `CHROME_PATH`로 Chrome 실행 파일을
지정할 수 있다. 이번 환경에서는 임시 폴더의 패키지를 `NODE_PATH`로 지정했다.
스크린샷 경로는 `fileURLToPath`로 변환해 한글·공백 경로에서도 저장되도록 고쳤다.

## 다음 작업 · 미완료

- T1: ODsay Basic 계정·Server 키/요청 IP 인증 확인 후 실제 검색 소량 검증.
- T4: 업체 ID와 실제 출입구/보도 방향/층위 대응. 도로 계산을 역내 환승으로 대체하지 않기.
- T5: 실제 시간표/운행일·휴일·다음 편·막차·지연 자료와 서버 연결. 이번은 기반/표시 보완만 완료.
- T6: 승강기·저상차량·역내 접근성·반복 휴식 근거와 유효기간 확보.
- T7~T9: 기존 계획의 정밀자료·성능·운영·실기기/현장 검증 유지.
- **T10 전역 UI 최적화는 마지막**. 기존 화면 전체 재배치는 하지 않았다.

서원석이 커밋하기 전 이 문서·최상위 수정이력과 diff를 검토하면 된다.
`donghaeng-nav/dist/`, 기존 Node/Vercel 구조와 원본을 유지했으며 예전 최상위
`dist/` 목업이나 파일 전체 업로드 방식으로 바꾸지 않았다.

## 변경 패치 전달

저장소 바깥의 `동행길-20261114-변경사항.patch`는 기준 `10ad62a`에서 변경된 소스·문서·
검사·공통 빌드 파일만 담는다. 저장소 전체를 새 폴더로 업로드하는 파일이 아니다.
기준 커밋이 같은 깨끗한 작업 복사본에서 먼저 `git apply --check <패치경로>`로
확인한 뒤 `git apply <패치경로>`로 반영한다. 그 이후 커밋·배포는 담당자가 수행한다.
이미 브랜치가 진행됐다면 강제로 덮어쓰지 말고 diff를 병합해야 한다.
