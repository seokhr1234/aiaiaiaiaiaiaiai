# 운영 주소와 최신 확장 기능의 반영 상태

검사: 2026-11-13 KST. 사용자가 알려준 주소는 **https://donghaeng-gill.vercel.app**다. [HTTP·파일 대조·브라우저 결과](live-deployment-2026-11-13.json)를 보존한다.

## 실제 확인한 결과

| 대상 | 결과 | 의미 |
| --- | --- | --- |
| `/` | 200, 제목 동행길 | 메인 화면 제공 |
| 메인 HTML·`/app.js` | 원격 `main`의 해당 두 파일과 바이트 일치, 최신 feature와 불일치 | 검사한 파일은 기존 버전 |
| 393×852 Chromium | 지도 컨테이너 1개, 길 찾기 버튼 표시, 가로 넘침·페이지 JS 오류 없음 | 공개 메인 화면의 초기 표시 확인. GPS·길찾기·모든 기능 검증은 아님 |
| `/api/status` | 200, `configured:true`, 모델 `gemini-3.5-flash-lite` | Gemini 키를 함수가 읽음. 실제 인증/모델 호출은 미검증 |
| `/app/`, `/expansion.html`, `/expansion.js` | 404 | 최신 화면 경로 미반영 |
| `/api/coverage`, `/api/transit/status`, 등록 접속점 `/api/features` | 404 | 최신 API 경로 미반영. ODsay 키 유무 판단 불가 |
| `/api/index?route=coverage`, `route=transit/status` | JSON 404 | rewrite 경로만의 문제로 확정할 수 없음 |

대조한 원격 `main`은 `89d3463ce5e4441e5a0e0ac069aaadf1024f0ec0`, 최신 feature 검사 기준은 `ca711f0e7efd67cd2fd2a965e5e8705a87ed8459`다. 메인 두 파일의 내용이 일치한다는 관측이며 정확한 운영 배포 커밋·Production Branch·도메인 할당 설정을 확인한 것은 아니다.

모바일 검사는 외부 리소스를 차단해 앱 자체 지도와 화면을 확인했다. [화면 캡처](live-production-mobile-2026-11-13.png)의 외부 타일 연결 실패 안내는 이 차단 조건의 결과다. 운영 타일 서비스 장애로 판정하지 않는다. 실제 휴대폰·GPS 권한·현장 통행·유료 제공업체 검색은 사용하지 않았다.

## 최신 기능을 운영 주소에서 확인하는 순서

1. Vercel에서 **Domains에 `donghaeng-gill.vercel.app`이 연결된 프로젝트**를 확인한다. Git 연결 저장소가 `seokhr1234/aiaiaiaiaiaiaiai`인지, 운영 배포의 Source가 어떤 브랜치·커밋인지 확인한다. 다른 프로젝트의 CI 성공만으로 이 도메인의 배포가 바뀌지는 않는다.
2. 최신 `feature/gemini-route-selection` 커밋의 Ready 배포를 같은 프로젝트에서 확인한다. Root Directory는 저장소 최상위, Output Directory는 `donghaeng-nav/dist`다. 기존 커밋의 Redeploy는 최신 코드를 반영하지 않는다. 배포 생략 표시는 사용하지 않는다.
3. 해당 배포의 Preview에서 `/expansion.html`, `/api/coverage`, 아래 등록 지점 조회를 먼저 확인한다. 프로젝트의 운영 정책에 따라 해당 배포를 Production으로 승격하거나 최신 코드를 운영 브랜치에 반영한 배포를 사용한다. 이 작업에서는 main 병합·운영 별칭 변경을 실행하지 않았다. 사용 가능한 연결 도구는 GitHub 배포 상태 조회이며 Vercel 프로젝트·도메인 설정 변경 도구/인증은 제공되지 않았다.

   ```text
   /api/features?layer=osm-review&bbox=127.035,37.595,127.046,37.607&limit=1
   ```

   성공 응답은 `storage:bundled_review`, `fieldVerified:false`, `routingEligible:false`를 유지해야 한다. 예상 표시 자료 버전은 `osm-review-aa159e2d36095a57e699310164d85cff8e89cbb10a2264f2434d024b011faf59`다. 별도 키·자료 서버 없이 조회할 수 있다. 화면에서는 **OSM 등록 접속점 · 현장 미확인** 레이어를 선택한다.
4. 새 API가 운영 주소에서도 열리는 것을 확인한 뒤 `ODSAY_API_KEY`를 해당 프로젝트의 필요한 Production/Preview 환경에 설정하고 새 배포에 적용한다. `/api/transit/status`의 설정 상태를 먼저 확인한다. `not_configured`는 키 미설정, `disabled`는 비활성이며, 설정 상태만으로 실제 인증 성공을 주장하지 않는다. 키 값은 채팅·Git에 넣지 않는다.
5. 호출 상한과 이용조건을 확인한 뒤 소량 실제 대중교통 참고 검색을 검사한다. 후보 응답도 운행 시간표·승강기·저상 차량·역내 접근성 검증 완료와 구분한다. 기존 시설/정밀/보행/여정 API는 별도 자료 서버 연결이 필요하다. [환경변수·서비스 구성](expansion-service.md)을 따른다.

기존 `aiaiaiaiaiaiaiai.vercel.app`의 404와 두 Vercel CI 성공 관측은 [이전 게시 기록](review-points-publish-2026-11-13.json)으로 남긴다. 이번 문서 정정으로 이전 관측이나 연구 자료를 덮어쓰지 않는다.

## 완료와 남은 작업

| 완료 | 남은 작업 |
| --- | --- |
| 실제 운영 주소 확인, HTTP·파일 해시·모바일 초기 화면 대조, 운영 안내 주소 정정 | 운영 도메인에 최신 배포 연결 후 확장 화면·API 재검사 |
| 등록 접속점 31,934개 표시 구현·로컬 API/모바일/원본 보존 검사·feature 푸시 | 운영 환경에서 등록 레이어 표시 확인 |
| ODsay 서버 API·상한/오류 처리·모의 검사 | 새 운영 API의 키 설정 확인과 소량 실제 인증/검색 |
| 검토 그래프·PostGIS 시험·기존 월곡 서버 경로·병목 계측 | 운영 자료 서버/DB, 반복 계산 개선·성능 재측정, 광역 보도/층위/접속 검증 |
| 출처·수집/자료 시점·결측·현장 미검증 표시 유지 | 정밀 원본/DEM 확보, 실제 휴대폰·보행·대중교통 환승 조사 |

새 경사값 승격·신규 현장 검증·활성 서울 전역 보행망 적용은 모두 0건이다.

## 2026-11-14 해결

사용자의 운영 배포 요청에 따라 이전 main 이력을 보존하며 검증된 feature 커밋으로 fast-forward했다. 운영 도메인의 최신 메인/확장 HTML·자료/접속점/서울 도보 API·모바일·온라인 OSM 배경 로딩을 확인했다. 위 404와 계정 설정 보류는11월13일 당시 상태다. 별도 Vercel 도메인 변경 없이 main의 Git 자동 배포로 해결했다. [새 배포·브랜치 구조 대조·실제 검사](production-deployment-2026-11-14.md).
