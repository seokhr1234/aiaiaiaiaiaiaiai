# 2차 OSM 객체·연결기하 교차 검증

조사일: 2026-10-31 KST. 대상은 서울사대부중 앞 시연 출발점 → ‘종월2교’ 목적지의 기본/벤치 경유 경로와 그 주변이다. 원본 스냅샷 시각은 **2026-10-28T05:19:18Z**다.

**이번에 실제 확보한 새 산출물은 원본에 대한 상세 객체 증거·부분 경로 GeoJSON·연결기하 분석이며, 최신 OSM 원본/API 이력은 확보하지 못했다.** 브라우저 객체 페이지가 열리지 않았고 실행 환경 프록시도 OSM API 연결에 HTTP CONNECT 403을 반환했다. 정책을 우회하지 않았다. 15개 경로 way와 벤치의 현장 조사일·객체 편집일·changeset ID를 임의로 채우지 않았다.

## 1. 확보 상태와 결과물

| 파일 | 내용 | 수준 |
|---|---|---|
| `local-evidence.json` | 15개 경로 way의 원시 태그·노드 ID, 실제 30/36개 부분 간선, 시작/목적지, 벤치, 반경 2km의 장벽·출입·횡단 후보 743 node | 기존 스냅샷의 등록 정보 |
| `local-evidence.geojson` | 경로 2개, 원본 way 15개, 학교 영역, 벤치/연결선, 출발·도착 정류장과 미검증 연결선. 총 26 feature | 기존 스냅샷/계산 기하 |
| `topology.json` / `.geojson` | 층 관계 전환, 9개 평면 교차 후보, 그래프 cut-edge, 학교 영역 후보 분석 | 계산 결과; 실제 통행 판정 아님 |
| `object-ledger.json` | 객체별 source/check_date/이력 확보 상태 | 편집·조사 시점 미확인 유지 |
| `photo-candidates.json` | 주변 공개사진 3개의 촬영일·작성자·라이선스·좌표(있는 경우) | 사진 메타데이터만 확인 |
| `sources.json` | 공식 문서와 지역 객체 등 37개 근거 항목 및 확보 상태 | 문서 열람/스냅샷/실패를 구분 |
| `acquisition-log.json` | 실제 웹 요청·실행기 요청·정책 차단 기록 | 원문 bytes/hash 없음은 null |
| `collection-run.json` | 정책 허용 후 실행할 API 요청의 dry-run 목록 | **다운로드 성공 기록이 아님** |
| `analyze-local.cjs`, `analyze-topology.py`, `build-registry.py` | 네트워크 없이 증거를 재생성하는 스크립트 | 재현 가능 |
| `collect-public.py`, `*.overpassql` | 캐시·hash·중단 정책을 갖춘 후속 수집 코드와 쿼리 | 실제 API 실행은 차단 상태 |

원본 bytes/sha256은 `local-evidence.json`의 `input`, 결과 파일 bytes/hash는 `manifest.json`에 남긴다. 브라우저가 렌더링한 문서는 원본 HTTP body를 받지 못하므로 원문 hash를 생성하지 않았다. OSM 기하는 ODbL 1.0이며 출처 표시는 [OSM 저작권 안내](https://www.openstreetmap.org/copyright)를 따른다.

## 2. 목적지·보행면부터 바로잡아야 하는 이유

1차 설명의 ‘종월2교’는 이 앱 데이터상 교량 객체가 아니라 **정류장/platform node `357869790`**다. 위치는 `(37.5973378,127.0412971)`, 태그는 `highway=bus_stop`, `public_transport=platform`, 버스 `1226`이다. 이름만으로 다리 위를 목적지로 정하면 안 된다.

출발 좌표도 학교 교문이 아니라 **‘서울사대부설중학교’ 정류장 node `14196290450`** `(37.5960634,127.0384638)`이다. 정류장 ref는 `08411`, 방향 태그는 ‘서울사대부설고등학교 방면’이다. 학교 영역 way `379553745`에 주소·학교 유형은 있으나 공개 출입시간이나 일반인 통행 허용 근거는 없다. 이 학교 영역 내부에 엔진 채택 구간의 중점이 들어가는 way는 이번 스냅샷 분석상 0개다. 따라서 현재 시연 경로를 교내 안내나 검증된 학교 교문 진입 경로라고 표시할 근거는 없다.

공식 [entrance 설명](https://wiki.openstreetmap.org/wiki/Key:entrance)은 출입구 유형과 출입 권한을 구분하고, [access 설명](https://wiki.openstreetmap.org/wiki/Key:access)은 법적 출입 권한과 물리적 통과 능력을 구분한다. 학교라는 시설 종류만으로 사유지 통행 여부를 자동 결정하지 않는다.

## 3. 실제 계산 경로의 구조

| 항목 | 거리 우선 | 벤치 경유 |
|---|---:|---:|
| 도로 그래프 구간 거리 | 673.97m | 957.79m |
| 실제 선택 간선 수 | 30 | 36 |
| 원본 way 수 | 9 | 12 |
| 경사 미확인 거리 | 673.97m | 957.79m |
| `tunnel=yes` 구간 | 14.69m | 14.69m |
| `bridge=yes` 구간 | 없음 | 56.87m |
| start → snap 직선 | 20.50m | 20.50m |
| end → snap 직선 | 17.11m | 17.11m |

두 경로 모두 `secondary/residential/service`로 등록된 길의 기하를 따라간다. 이는 OSM highway 분류이며 실제 보행면이 전부 차도라는 결론은 아니다. 분리된 보도와 보행 접속면을 선택해 계산했다는 근거도 없다. 벤치 경유의 구월교는 highway가 residential이지만 `motor_vehicle=no`, `foot=designated`이므로 ‘자동차 도로’로 단순 분류하면 잘못이다.

현재 반환 거리에는 시작·도착의 미검증 직선 연결 두 개를 안전한 보행 구간으로 검증해 반영한 것이 아니다. 20.50m/17.11m 사이에는 보도·턱·도로 횡단·난간 등이 있을 수 있으므로 접근가능 여부를 별도 확인해야 한다.

### 3.1 두 경로 공통의 터널과 마지막 102m

- [way 750640242](https://www.openstreetmap.org/way/750640242): `highway=residential`, `tunnel=yes`, `layer=-1`, 길이 약 **14.69m**.
- 입구 쪽 node `7018577877`: `(37.5973503,127.0420112)`.
- 출구 쪽 node `7018577878`: `(37.5973514,127.0418445)`.
- 양 끝은 `750640241`과 `750640243`에 공유 노드로 연결된다. level 전환 승강기나 계단을 새로 연결한 것은 아니다. `layer` 전환 자체는 정상적인 터널 입·출구일 수 있다.
- 목적지 쪽 8개 간선, 합계 **102.14m**가 프로필 적용 전 엔진 채택 무방향 그래프에서 cut-edge다. 즉 이 스냅샷 그래프에서 이들 간선 중 하나를 제거하면 해당 끝부분의 연결이 끊긴다.
- **cut-edge는 폭이 좁다는 뜻이 아니다.** 지도에 대체 접속로가 누락되어도 생긴다. 통행을 좌우하는 핵심 확인 구간이라는 의미다.

우선 조사 항목: 터널 입·출구의 실제 보행면, 단차·유효폭, 사람 출입 허용, 조명·배수·임시 차단, 정류장까지의 마지막 연결. 인터넷 근거로 통행 가능/불가 어느 쪽도 확정하지 않았다.

### 3.2 벤치 경유의 구월교와 2.18m 연결

- [way 379766295](https://www.openstreetmap.org/way/379766295): `bridge=yes`, `bridge:name=구월교`, `layer=0`, `surface=wood`, `foot=designated`, `motor_vehicle=no`.
- 경로 중 약 **56.87m**를 통과한다. `wood`는 재질이며 미끄러움·틈·난간·단차·휠체어 가능성을 보장하지 않는다.
- [bench node 12464206320](https://www.openstreetmap.org/node/12464206320): `(37.5954369,127.0412576)`, `amenity=bench`, `backrest=no`.
- 엔진 연결점 `(37.5954374,127.0412823)`까지 직선 **2.18m**. 벤치의 등받이 없음은 원본 등록값이며 현재 실물 확인값은 아니다.
- 도로 노드와 2.18m 가까워도 턱/울타리/보행면/휠체어 여유공간을 넘지 않고 도달할 수 있다는 뜻은 아니다. 첫 벤치까지 도로 그래프 거리는 약 537m다.

### 3.3 겉으로 교차하는 길을 연결하면 안 되는 9개 지점

실제 경로 간선과 원본 way의 **엄격한 내부 선분 교차**를 계산했다. 서로 다른 두 선분이 교차하지만 노드를 공유하지 않는 후보가 9개다. 대다수는 내부순환로/연결로와의 입체 교차다. 8개는 등록된 `layer`가 다르고, 1개는 둘 다 0으로 해석되지만 공유 노드는 없다.

- 최단 경로 way `183272560` (layer 1)이 내부순환로 trunk/trunk_link (layer 2), 정릉천 자전거길 way `1500271202` (layer 기본 0)와 교차한다.
- 구월교 way `379766295` (layer 0)도 내부순환로 위/아래 기하와 정릉천 자전거길 (layer 기본 0)에 겹친다.
- 구월교와 정릉천 자전거길의 같은 layer 교차 후보는 `(37.5955840,127.0407649)`다. **같은 layer 숫자도 동일 보행 높이/진입로의 증거가 아니다.** 교량·하천변·접근로의 실제 구조를 확인해야 한다.

[OSM layer 공식 설명](https://wiki.openstreetmap.org/wiki/Key:layer)은 layer를 상대적 겹침 관계로 정의하며 실제 고도나 층수로 취급하지 말라고 안내한다. [level](https://wiki.openstreetmap.org/wiki/Key:level)은 건물 내 층을 표현한다. `layer=-1`이라는 이유만으로 깊이 1m나 지하 1층을 생성하지 않는다. 지금 엔진은 공유 노드만 연결하므로 이 9개 지점을 평면 교차만으로 잘못 이어 붙이고 있지는 않다. 후속 공식 데이터 병합에서 근접/평면 교차만으로 연결하는 것이 위험하다.

## 4. 장벽·출입구·횡단의 독립 추출과 현재 한계

원본 쿼리는 highway way와 일부 POI를 먼저 가져와 재귀적으로 node를 받는다. 학교 주변 모든 barrier/kerb/entrance/crossing을 독립적으로 요청하지 않았다. 새로 준비한 `independent-features.overpassql`은 작은 bbox `(37.592,127.035)–(37.600,127.044)`에서 각 태그를 독립 선택하고 `out meta`로 조회하도록 했다. 별도의 `route-parent-relations.overpassql`은 경로 15way의 부모 relation을 가져온다. 거대한 route relation 전체를 재귀 다운로드하는 쿼리는 피했다.

현재 로컬에 저장된 원본만 사용하면 반경 2km의 관련 노드 후보가 743개이고 경로 선분에서 100m 이내는 **0개**다. 가장 가까운 후보는 crossing node `2965677400`, 경로에서 약 197.79m다. 이는 **이 스냅샷의 선택·등록 상태**이며 실제 길에 턱·게이트·횡단보도가 없다는 증거가 아니다. 따라서 현장 확인값을 새로 추가하지 않았다.

원본에 relation은 0개이고 객체별 편집 메타데이터도 없다. 상위 relation이 현재 없다는 결론, 회전/층/보행 제한이 없다는 결론을 낼 수 없다. 추가 수집 결과를 확보하기 전에는 해당 필드를 unknown으로 둔다.

원본의 중복도 점검했다. node 레코드 20,965개 중 동일 내용으로 반복된 11개가 있어 **고유 node는 20,954개**다. way는 4,762개다. 1차 보고서의 20,965는 원시 레코드 수라는 점을 보완한다. 엔진은 type+id로 중복 제거하므로 이 11개 때문에 길이 새로 생긴 것은 아니다.

## 5. 객체 이력·출처·최신성

경로 way 15개의 `check_date`, `survey:date`, 객체 timestamp/version/changeset은 저장된 원본에 없다. source는 4way에 `Bing`이 있고 나머지는 누락이다. source=Bing은 측량·현장 검증 근거가 아니다. `review=no`가 있는 객체도 있으며 이를 검증 완료로 읽지 않는다.

공식 [API v0.6](https://wiki.openstreetmap.org/wiki/API_v0.6)은 ID batch, history, parent relations를 제공한다. [Overpass QL](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)은 `out body`와 `out meta` 차이를 명확히 설명한다. 원본 쿼리는 body 출력이므로 편집 metadata가 없는 것이 설명된다.

재수집 시 객체 마지막 편집일과 changeset comment/source를 기록하되, 속성별 현장 관측일과 분리해야 한다. OSM history에서 이름만 바뀐 시각을 턱/경사 최신 확인일로 표시하면 잘못이다. [check_date 문서](https://wiki.openstreetmap.org/wiki/Key:check_date)도 객체 존재와 특정 속성의 확인을 구분한다. 이번에는 history/changeset 응답을 얻지 못했으므로 이력 검증 완료라고 보고하지 않는다.

## 6. 공개 보조사진의 실제 존재·날짜 확인

사진 내용에서 치수를 판독하지 않았고 원본 이미지를 다운로드·재배포하지 않았다. 다음은 파일 설명 페이지를 실제 열어 확인한 메타데이터다.

| 대상 | 촬영일 표기 | 작성자·라이선스 | 학교 경로와의 관계 |
|---|---|---|---|
| [종암동주민센터](https://commons.wikimedia.org/wiki/File:Seongbuk_Jongam-dong_Community_Service_Center.jpg) | 2013-08-15 12:53:10 | 안우석, CC0 1.0 | 카메라 `(37.599167,127.035167)`; 주변 보조 근거 후보. 시연 터널·벤치 연결을 담았다는 증거 없음 |
| [월곡2동주민센터](https://commons.wikimedia.org/wiki/File:Seongbuk_Wolgok_2-dong_Community_Service_Center.jpg) | 2013-08-15 13:34:59 | 안우석, CC0 1.0 | 카메라 `(37.606000,127.048000)`; 주변 공공시설 후보. 학교 기본 경로 직접 근거 아님 |
| [월곡역 5번 출입구](https://commons.wikimedia.org/wiki/File:Seoul-metro-641-Wolgok-station-entrance-5-20181125-145306.jpg) | 2018-11-25 14:53:06 KST | LERK, CC BY-SA 4.0 또는 CC BY-SA 2.1 Japan | 출입구의 과거 모습 자료 존재. 현재 승강기/턱/운영 상태는 별도 확인 필요 |

EXIF/촬영일은 카메라 시계와 수정 이력의 영향을 받을 수 있고 촬영된 시점의 상태만 보여 준다. 오래된 파일이므로 현재 상태를 보장하지 않는다.

[KartaView Photos](https://kartaview.org/doc/photos)의 공개 문서 검색 추출에서는 photo의 `shotDate`, 위치·heading·sequence를 확인할 수 있는 API를 설명한다. `dateAdded`는 업로드일이므로 촬영일로 바꾸지 않는다. 웹 open은 JavaScript 로딩 화면만 반환했다. 학교 부근 실제 photo 응답은 아직 받지 못했으며 ‘학교 주변 촬영사진 있음’으로 확정하지 않았다. 반경 최대 500m 문서 기준으로 재현 요청을 준비했다.

[Mapillary 공식 API 안내](https://help.mapillary.com/hc/en-us/articles/360010234680-Accessing-imagery-and-data-through-the-Mapillary-API)는 확인했지만 사용자 토큰/계정 등록 없이 학교 사진 metadata를 확보하지 못했다. 문서·데모에 공개된 토큰을 복사하지 않았다. 이미지가 보이지 않는 상태에서 cm 단차·도로 경사·최소폭을 만들어 넣지 않았다.

## 7. 후속 적용 우선순위

1. **정류장 도착 연결**: end snap 17.11m와 마지막 터널 14.69m/끝단 102.14m를 먼저 확인한다. 지도 연결 한 곳이 잘못되면 두 추천 모두 영향을 받는다.
2. **출발 보행면**: 정류장→차도분류 기하 20.50m 접속의 보도·횡단·턱을 확인한다. 학교 교문 좌표로 오인하지 않는다.
3. **벤치 접속과 구월교**: 2.18m snap, 교량 양쪽 접속면, 등받이 없음/옆 여유공간을 확인한다.
4. **교차 관계**: 고가도로·하천길·교량의 근접 후보를 층/보행면/공유노드 기반으로 검증한다. 모든 선분 교차를 새 교차로로 만들지 않는다.
5. **새 독립 추출 적용**: barrier/kerb/entrance/crossing/relations를 확보한 뒤 OSM 원시값과 출처 수준을 보존해 병합한다. 최신 편집일을 현장 확인일로 사용하지 않는다.

## 8. 재현과 남은 차단

저장소 루트에서 다음은 네트워크 없이 실행된다.

```sh
node research/accessibility/round2/crosscheck/analyze-local.cjs
python research/accessibility/round2/crosscheck/analyze-topology.py
python research/accessibility/round2/crosscheck/build-registry.py
```

정상 프록시에서 대상 호스트가 허용된 뒤에만 다음을 실행한다. 최초 batch가 정책 403이면 중단하고 우회하지 않는다. 원본 응답은 `/workspace/research-downloads/crosscheck`에 저장하고 bytes/sha256/URL/조회시각을 기록한다. 경로 15way+bench history 최대 16건은 순차 호출·캐시하며 전체 지역 이력을 대량 수집하지 않는다.

```sh
python research/accessibility/round2/crosscheck/collect-public.py --fetch --history --overpass --photos
```

필요 호스트: `api.openstreetmap.org`, `overpass-api.de`, `api.openstreetcam.org`. 문서·사진 설명은 웹 도구로 열람했지만 직접 데이터 다운로드 정책은 별개다. 현재까지 새 객체 history, changeset, 독립 barrier/entrance 원본 확보는 차단되어 있다. 기존 앱/원본/1차 조사 파일과 Git 커밋·원격 저장소는 변경하지 않았다.
