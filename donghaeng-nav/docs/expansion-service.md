# 확장 서비스 실행과 Vercel ODsay 설정

작성: 2026-11-11 KST. [현재 구현 범위](seoul-expansion-progress.md)를 먼저 확인한다. 네이버 서비스는 사용하지 않는다.

## 기본 실행

```sh
node server.mjs
```

기존 화면 `/`과 온라인 확장 화면 `/expansion.html`을 제공한다. 지역별 화면은 같은 서버의 자료 API를 호출한다. 오프라인 HTML은 기존 월곡 시연을 유지하며 확장 화면을 내장하지 않는다.

## 사용자가 Vercel에 넣을 환경변수

Vercel 프로젝트의 Settings → Environment Variables에서 필요한 Preview/Production 범위에 등록하고 새 배포에 적용한다. 키를 파일·클라이언트 스크립트·채팅에 붙이지 않는다.

| 변수 | 필수 여부·동작 |
| --- | --- |
| `ODSAY_API_KEY` | 대중교통 참고 검색에 필요. **Vercel 서버 코드에서만 읽는다.** 값이 없으면 실제 업체 요청 없이 503을 반환 |
| `ODSAY_DAILY_LIMIT` | 선택, 기본 20. 1~100000 정수. 서버 인스턴스별 KST 일일 시도 상한이며 업체 계정 전체 상한이 아님 |
| `DONGHAENG_TRANSIT_ENABLED` | 선택, 키가 있으면 기본 활성. `false`로 두면 업체 요청을 중지 |
| `DONGHAENG_BACKEND_URL` | 영역별 자료·서버 보행·전체 여정 검증을 Vercel에서 사용할 때 필요. 준비된 별도 Node 백엔드의 HTTP(S) 기본 주소. ODsay 후보만 조회할 때는 불필요 |
| `DONGHAENG_BACKEND_TOKEN` | 백엔드를 외부로 연결할 때 양쪽에 동일하게 설정. Vercel에서만 전달하며 화면/응답에 포함하지 않음 |

키가 설정됐다는 것과 실제 API 연결 성공은 별개다. ODsay 키의 플랫폼이 이 서버 호출 방식에 맞는지, 서버/IP 또는 URI 제한이 실제 배포에 맞는지 확인해야 한다. 이번에는 실제 키가 실행 환경에 제공되지 않아 실제 인증 호출은 하지 않았다. 플랫폼 제한을 우회하기 위한 가짜 Referer를 만들지 않는다. [공식 플랫폼/키 안내](https://lab.odsay.com/guide/guide).

새 배포에서 `GET /api/transit/status`는 키 값 없이 `not_configured`, `disabled`, `reference_candidates_only` 등 설정 상태를 보여 준다. `POST /api/routes/transit`의 실제 성공 응답을 받은 뒤에만 연결 성공으로 판단한다. 일반 버스·지하철 참고 후보는 역내 접근성·승강기·승차 시각이 확인된 여정과 다르다.

Vercel은 무거운 도로망을 적재하지 않는다. 자료 서버가 없으면 `/api/coverage`는 기본 자료 범위와 `serviceAvailable:false`를 반환하며, 대중교통 후보 API는 독립적으로 동작한다. `/api/features`, `/api/places`, `/api/routes/walk`, `/api/journeys`는 자료 서버가 있어야 한다. `/expansion.html`에서 대중교통 참고 모드를 고르고 지도에 출발·도착을 지정할 수 있다.

호출 횟수는 서버 인스턴스가 재시작되거나 여러 인스턴스로 분산되면 합쳐지지 않는다. 공개 운영 전에는 업체 계정 한도와 별도의 공유 예산/요청 제한 저장소가 필요하다. 실패도 한 번의 시도로 집계하고 자동 재시도·대량 분석은 하지 않는다. 요금·결과 저장/가공·지도 병용 조건은 실제 사용자 계약으로 확인한다. [ODsay 구매 안내](https://lab.odsay.com/contact/contact), [지도 선택 안내](https://lab.odsay.com/introduce/intro#intro_5).

## API 계약

| 주소 | 기능·한계 |
| --- | --- |
| `GET /api/coverage` | 데이터·그래프 버전, 월곡 보행 범위와 정밀·시설·현장 확인 수준 |
| `GET /api/features?bbox=west,south,east,north&layer=facilities` | 표시용 영역 자료. `precision`, `crossings`도 지원. 범위 한 변 0.3도 이하, `limit` 최대 1000, `offset`과 `nextOffset`으로 페이지 처리 |
| `GET /api/places?q=도서관` | 보유 서울 등록 시설의 이름·주소 검색, 일반 주소 전체 검색은 미구현 |
| `POST /api/routes/walk` | 버전 고정 기존 도로망에서 조건·건물 검사를 통과한 기술 시연 후보. 지원 범위 밖은 422 |
| `POST /api/routes/transit` | ODsay 후보 정규화. 모든 결과는 참고용이며 시간표/접근성 검증 완료로 표시하지 않음 |
| `POST /api/journeys` | 대중교통 후보의 도보 재계산과 여정 검사. 시간표·실시간/역내 검증 어댑터가 아직 없어 실제 후보의 검증 상태는 미확인 |
| `GET /api/transit/status` | 키를 반환하지 않는 설정·한도 상태 |

보행·대중교통·여정 POST 본문은 `origin`, `destination`, `profile`, `atTime`만 받는다. 좌표는 `[위도,경도]`, 출발 시각은 시간대가 있는 ISO 문자열이다. `profile`은 기존 기기 내/AI 해석 결과의 허용 필드만 받는다. 임의 URL·임의 업체 키·출입구 좌표를 본문으로 받지 않는다.

Node 보행 계산은 단일 작업 스레드와 제한 큐를 사용한다. 기본 동시 적재 상한 4, 요청/대기 시간 제한 12초다. 초과 요청은 429, 취소는 계산 종료, 시간 초과는 504이며 기존 조건을 완화하지 않는다. 아직 전역 동시 10개 요청의 운영 SLO가 아니다.

## 선택적 PostGIS 조회와 재현

`DONGHAENG_DATABASE_URL`을 **별도 Node 자료 서버**에 설정하면 `/api/features`가 실제 PostGIS를 조회한다. 미설정이면 기존 메모리 인덱스를 사용한다. DB 설정 상태는 `/api/coverage`의 `featureStorage:postgis_configured`, 실제 성공은 `/api/features`의 `storage:postgis`로 구분한다. DB 오류 때 메모리로 몰래 전환하지 않는다. 이 변수나 DB 비밀번호를 Vercel 클라이언트 설정에 넣지 않는다.

선택적 `pg` 의존성은 자료 서버에서 설치한다. Vercel 참고 후보 API와 기본 로컬 메모리 모드에는 설치가 필요하지 않다.

```sh
npm ci --prefix donghaeng-nav/services
```

격리된 PostGIS 3.5.7에 34,914건을 이관하고 실제 HTTP 조회를 검사했다. 운영자가 준비한 **새 시험 DB**에서 다음 순서로 재현한다.

```sh
psql -h 127.0.0.1 -d donghaeng_dev -v ON_ERROR_STOP=1 -f donghaeng-nav/services/expansion/schema.sql
python3 donghaeng-nav/scripts/export-expansion-postgis.py > /tmp/donghaeng-import.sql
psql -h 127.0.0.1 -d donghaeng_dev -v ON_ERROR_STOP=1 -f /tmp/donghaeng-import.sql
```

`psql`의 접속 대상은 운영자가 선택한 로컬 시험 DB로 설정한다. 비밀번호를 명령줄·Git에 넣지 않는다. 원본 스냅샷 ID에 해시를 포함하며 중복 스냅샷은 갱신 대신 트랜잭션 실패로 처리한다. 원본 GeoJSON 기하와 2D 공간 인덱스 기하를 분리하고, 현장 확인은 근거 없는 true로 바꾸지 않는다.

후속 스키마의 `original_feature_id`는 원본 최상위 ID의 유무·형식도 보존한다. `9282ea6`의 이전 스키마를 실행한 DB에는 새 열만 추가해도 원본 ID가 복구되지 않으므로 별도 새 DB에 재이관·검증한 뒤 전환한다. 기존 DB를 자동 삭제·갱신하는 마이그레이션은 실행하지 않았다.

자료 서버에 `DONGHAENG_DATABASE_URL`을 비밀 설정으로 등록하고 `node server.mjs`로 시작한다. 운영용 DB 계정은 대상 스냅샷의 SELECT 권한만 부여하고 별도 이관 계정과 구분한다. 어댑터는 최대 연결 4개·연결 제한 3초·문장 제한 5초, 읽기 전용 반복 읽기 트랜잭션을 사용한다. 원본 해시/행 수·현장 확인 상태와 행 버전 지문을 검사하고 최초 조회·행 변경 시 해당 자료 전체의 원본 기하·속성·ID·분류와 인덱스 기하를 대조한다. 현재 지도 밖 행의 변조·누락도 해당 자료 조회를 503으로 중지한다. 원본 그대로 복구한 스냅샷은 재대조할 수 있다. 지문은 DB 행 버전 변화 감지용이며 새 외부 자료의 진위를 보증하는 전자서명은 아니다.

GiST 경계 상자의 부동소수점 반올림으로 메모리 조회와 결과가 달라지지 않도록 실제 이중 정밀도 기하 경계를 한 번 더 비교한다. 페이징·시설 8종 필터·원본 Z/ID 보존, 지도 안/밖 행 변조·누락·잘못된 스냅샷 거부와 읽기 전용 동작을 [실제 API 검사](postgis-api-results.json)로 확인했다. 검사는 임시 로컬 DB만 수정하며 다음 명령의 기본 대상은 `127.0.0.1:55439`다. 다른 시험 포트는 `DONGHAENG_TEST_DATABASE_URL`로 지정하며 루프백 외 대상은 거부한다.

```sh
node donghaeng-nav/scripts/test-postgis-api.mjs
```

같은 격리 DB에 `DONGHAENG_TEST_DATABASE_URL`을 지정해 `test-expansion-ui.mjs`를 실행하면 원래 메모리 검사/화면 기록을 덮어쓰지 않고 `postgis-ui-results.json`에 DB 연결 브라우저 결과를 남긴다. 실제 검사는 320px·시설/정밀·서버 보행·모의 대중교통·범위 밖·서비스 실패 흐름을 통과했다.

자료 원본·버전 검사와 이름 검색은 여전히 서버 스냅샷을 사용하며, 새 OSM 연구 원본 전체를 DB에 넣거나 메모리 적재를 완전히 없앤 상태는 아니다. 운영 DB·자료 서버의 호스팅/영속 배포와 부하 목표는 남아 있다.

## 검사·빌드·재개

```sh
node donghaeng-nav/scripts/test-expansion-core.mjs
node donghaeng-nav/scripts/test-expansion-ui.mjs
node donghaeng-nav/scripts/test-transit-edge.mjs
node donghaeng-nav/scripts/test-transit-vercel.mjs
node donghaeng-nav/scripts/test-expansion-boot.mjs
python3 donghaeng-nav/scripts/build-html.py
```

브라우저 검사에는 Playwright·Chromium이 필요하다. 외부 호출은 모의하며 실제 키를 테스트 코드에 넣지 않는다. 원본 자료와 보호 코드 해시 외에 `services/service-integrity.json`으로 확장 서비스 입력도 확인한다. 코드가 바뀌면 관련 검증 근거를 갱신하고 명시적으로 해시를 갱신한 뒤 빌드한다.

시작한 서버의 자료/코드는 한 묶음으로 고정된다. 자료나 무결성 기록을 바꾸면 새 프로세스에서 검증하며 서로 다른 버전의 그래프·정밀·표고 근거를 섞지 않는다. 자동 재탐색과 실제 휴대폰 GPS 검증 상태는 기존 정책을 유지한다.
