# 2차 경사·지형 원본 확보 조사

조사일: 2026-10-31 (Asia/Seoul). 기준 위치: 서울사대부중 `(37.5950991,127.038992)`, 우선 반경 2km. 공식자료 및 후보 16건과 다운로드 경로를 찾는 데 사용한 제3자 소스 1건을 `sources.json`에 기록했다. 경로별 추정 수치를 생성하지 않았다.

## 1차보다 발전한 결과

1. OA-22241의 **실제 다운로드 요청 후보**를 찾았다. 정상 공급원에서 ZIP을 받아 독립적으로 PRJ·DBF·형상을 확인할 수 있는 다운로드/검수 스크립트도 작성했다. 다운로드 성공으로 기록하지 않는다.
2. 공식 카탈로그 JSON 3건을 웹 도구 응답에서 파싱해 로컬에 보관했다. 이 파일은 필드 정의·이용조건을 재검토할 수 있는 **도구 정규화 응답 사본**이며 HTTP 원본 바이트가 아니다.
3. 한국환경연구원 NEINS에서 **2022년 제작 NGII 5m DEM 기반 지점/영역 경사·표고 분석**이 제공된다는 공식 안내를 추가로 확인했다. 공개 DEM 파일 제공과 분석 서비스는 구분했다.
4. 기존 OSM 원본에서 지형 추정 시 검토할 **211개 피처**를 실제 추출했다. `incline` 19건, `bridge` 90건, `tunnel` 43건, `layer` 181건, `cutting` 1건이며 태그들은 중복된다. 이 숫자는 전체 도로가 아니라 반경 내 꼭짓점이 있는 지형 태그 피처의 수다. 갱신된 인터넷 관측이 아니라 2026-10-28 기존 스냅샷의 재현 가능한 추출이다.
5. Copernicus·SRTM·OpenTopography를 대체 후보로 비교했다. 30m DSM/2000년 레이더 자료가 보도 턱·횡단 경사 검증을 대체할 수 없음을 명시했다.

## OA-22241 원본 확보 경로

공식 소개: https://data.seoul.go.kr/dataList/OA-22241/F/1/datasetView.do

공식 페이지에서 두 ZIP과 공공누리 제1유형을 재확인했다. 원천은 2023년 기준 수치지형도이며, 제공기관은 완성된 경사 SHP 대신 표고점·등고선 SHP를 제공한다고 명시한다. 파일 갱신일이 개별 지점 측량일을 뜻하지 않는다.

공개 제3자 취득 코드에서 아래 요청을 발견했다. 이는 정상 다운로드 경로 **후보**이며 이번 환경에서 공급원 응답을 독립 검증하지 못했다.

```text
POST https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false
Content-Type: application/x-www-form-urlencoded
infId=OA-22241&seq=2&infSeq=1
```

후보를 발견한 공개 코드의 고정 커밋 링크:
https://github.com/minwoo19930301/seoul-real-estate-map/blob/63f8d033033bfee22e03ff78706f69ad69138c3b/scripts/download_source.py

제3자 코드에 기록된 참조값: ZIP 45,852,601 bytes, SHA-256 `4fbe3c7e061b5974e7403ec116855304ed8ae321eebcc0d12c31ca8fb7be30bf`. 동일 저장소의 감사 문서는 EPSG:5174, HEIGHT 필드, 등고선 8,570개·표고점 45,870개라고 보고하지만 **독립 검수 전에는 우리 데이터의 확인값으로 채택하지 않는다.** 참조 해시와 다르다고 곧 파일 오류라는 뜻도 아니다. 공급원 버전이 달라졌을 수 있다.

현재 실행 환경에서 공식 소개 페이지에 `urllib`로 접속한 결과는 프록시 CONNECT 403이었다. 이는 환경의 목적지 허용 제한이고, 서울시 서버가 파일을 제공하지 않는다는 증거가 아니다. 웹 도구의 다운로드 URL GET 열람은 도구가 접근 불가로 반환했다. 원래 후보는 POST이므로 GET 실패로 공급원 POST도 실패한다고 단정할 수 없다.

네트워크 정책에서 `datafile.seoul.go.kr` 및 `data.seoul.go.kr`가 허용된 뒤 아래 절차로 계속할 수 있다.

```sh
python research/accessibility/round2/terrain/download_oa22241.py /workspace/research-downloads/terrain/oa22241
PYTHONPATH=/tmp/terrain-python-deps python research/accessibility/round2/terrain/inspect_contours.py /workspace/research-downloads/terrain/oa22241/oa22241-seq2.zip research/accessibility/round2/terrain/acquired-school
```

검수기는 ZIP CRC, 파일 목록, PRJ, DBF 필드, 높이 범위, 레코드 수, 좌표계, 2km 원형과 실제 교차하는 선·점을 기록한다. 원본 좌표계를 PRJ에서 읽고 EPSG:32652에서 2km를 계산해 클리핑한다. 원본 PRJ가 없으면 중단하며 좌표계를 추측하지 않는다. 표고 사이를 보간하거나 경사를 자동 확정하지 않는다. `pyshp`, `pyproj`, `shapely`가 필요하며 이번 조사 환경에는 `/tmp/terrain-python-deps`에 설치했다. 그 임시 경로는 다른 환경에서 유지된다고 가정하면 안 된다.

## 길단위 경사와 5m DEM 분석 서비스

### 서울안전누리

https://safecity.seoul.go.kr/distFclt/cfMapDs/cfMapDs.page?menuId=MENU_SSNS_000016

공식 화면은 길단위 세그먼트 경사의 원천을 **2024.03 국토지리정보원 연속수치지형도 등고선**으로 설명한다. 범례는 `%`다. 공개 파일·API·공간 피처 응답과 스키마는 확보하지 못했다. 페이지 내부 공개 JS를 내려받아 정상 서비스 요청을 확인하려 했으나 셸 도메인 정책상 HTML 원문을 가져올 수 없어 JS 식별 단계로 진행하지 못했다. 따라서 서비스 식별자나 WFS 엔드포인트를 임의 추측해서 기록하지 않았다.

### NEINS 국토환경성평가지도

https://webgis.neins.go.kr/map.do

공식 안내는 2022년 제작된 NGII 5m DEM 분석이며 오차와 일부 지역 이용 제한을 명시한다. 지점 경사·표고 및 영역 분석을 지원하고 최대 분석 면적은 50km²다. 범례는 **각도(°)** 구간이므로 안전누리의 퍼센트 경사와 직접 비교하면 안 된다. 필요하면 `percent = 100*tan(degrees*pi/180)`로 단위를 변환하되, 면 경사와 길 진행 방향 종단 경사는 여전히 다른 값이다.

https://webgis.neins.go.kr/info/doyup/doyupList.do 의 다운로드는 **국토환경성평가 TIFF** 안내다. 이것을 5m DEM 원본 다운로드라고 취급하지 않는다. 현재 학교 위치의 분석 숫자·원본 래스터·API 명세·추출물 재배포 권한은 미확인이다.

## NGII 대상 도엽과 대체 지형 자료

| 후보 | 실제 확인한 것 | 남은 것 / 사용 제한 |
|---|---|---|
| NGII DEM | [IMG 공식 카탈로그](https://www.data.go.kr/catalog/15059920/fileData.json), 무료·대용량 전송 안내 | 학교 대상 도엽·격자·촬영일·높이기준·실파일 미확보 |
| NGII DEM 성과 | [CSV 필드 명세](https://www.data.go.kr/catalog/15067637/fileData.json): 도엽번호·좌표·격자간격·수직기준·원시 제작연도 | CSV 학교 행 미확보. 카탈로그 갱신일은 촬영일이 아님 |
| NGII 지도 이력 | [공식 검색 결과](https://www.data.go.kr/data/15148179/fileData.do)에서 도엽·조사연도·제작연도 후보 발견 | JSON 원문은 웹 도구 접근 불가. 대상 도엽 번호 미확정 |
| VWorld 90m DEM | 카탈로그 후보 식별 | 웹 도구 fetch 502. 일반 서비스 장애로 진단하지 않음 |
| S-MAP | [공식 가이드](https://smap.seoul.go.kr/guide/guide.html): 경사·지점 표고 기능 | 학교 측정값·정확도·원본 시점·공개 API 미확인 |
| Copernicus GLO-30 | [공식 사양](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM): 건물·식생을 포함한 DSM, 2011~2015 주 획득 | 30m 자료를 보도면·짧은 경사로·턱 측정값으로 쓰지 않음 |
| AWS Copernicus | [공개 저장소 안내](https://registry.opendata.aws/copernicus-dem/)와 [COG 경로 규칙](https://copernicus-dem-30m.s3.amazonaws.com/readme.html), 무계정 공개 접근 | 대상 타일 원본은 미획득; COG의 `10`은 10m가 아니라 1각초를 뜻함 |
| SRTM | [USGS 사양](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm): WGS84·EGM96·m, 2000년 획득 | 현행 보도 검증에는 오래된 저해상도 표면 자료 |
| OpenTopography | [공식 API 안내](https://opentopography.org/developers): COP30/SRTM 등, 개인 키 필요 | 계정·키 요청 안 함. API 조건과 앱 재사용 조건 별도 확인 필요 |

AWS 문서의 명명 규칙으로 학교가 포함될 후보 타일은 `Copernicus_DSM_COG_10_N37_00_E127_00_DEM`이다. 이는 **문서 규칙으로 산출한 파일명 후보**이고 타일 존재/바이트를 확인했다는 뜻은 아니다. 우선순위는 서울시 공개 등고선과 공식 길단위 자료이며, 글로벌 DSM은 이상치 비교 보조 자료로 제한한다.

## 기존 OSM에서 실제 확보한 학교 주변 추출본

- `osm-terrain-caveats-school-2km.geojson`: 211피처, 태그·원본 OSM URL·도형 보존.
- `osm-terrain-summary.json`: 입력/출력 해시, 원본 스냅샷 시각, 태그별 수량, 선택 방식.
- `extract_osm_terrain.py`: 재현 스크립트. 꼭짓점 중 하나가 2km 이내인 피처를 선택하므로 원형과 교차하는 모든 긴 선을 완전 선택한 것은 아니다. 새 등고선 검수기는 투영좌표계에서 실제 교차·클리핑한다.

19개 `incline` 중 `up` 10개, `down` 7개, `0%` 1개, `yes` 1개다. 수치 경사와 방향 표기를 구분해야 한다. 0%도 OSM의 등록값일 뿐 현장 측정 근거·시점은 별도다. `layer=0`을 0m 높이로 해석해서는 안 된다. 추출본에는 자동차 전용 도로 등이 포함될 수 있어 이 개수를 보행 가능한 도로 수로 표시하지 않는다.

### 기존 보고서 지명 정정

1차 보고서의 '종월2교 등 교량' 표현은 이름만으로 교량을 추정한 부분이다. 기존 데이터에서 목적지 **종월2교 node357869790는 bus_stop/platform**이므로 그 지점을 교량으로 확정하면 안 된다. 교량 DEM 주의 대상은 실제 `bridge=yes`가 있는 구월교 `way379766295`이며, 기존 경로에 포함된 지하 연결 `way750640242`도 별도 검토한다. 1차 파일은 요청 범위에 따라 수정하지 않고 이 정정을 남긴다.

## 신뢰 수준과 다음 단계

- `evidence/*-catalog.json`: 공식 카탈로그의 도구 정규화본. 바이너리 GIS 데이터나 학교 현장 관측이 아니다.
- `osm-terrain-*.geojson`: 이미 보관된 OSM 기록의 지역 추출. 실측 검증이 아니다.
- 원본 ZIP/DEM 확보: 현재 0건. 학교 구간별 새 경사 측정값: 현재 0건.
- 실제 다운로드 후 manifest에 원본 URL·POST 매개변수·시각·bytes·SHA-256을 남기고 PRJ·HEIGHT·수직기준·원천시점을 독립 검수한다.
- 보간 지형을 만들더라도 교량·터널·입체교차·옹벽·계단·횡단보도 턱·보도 횡단경사는 별도 확인한다. 표고점과 도로가 가깝다는 이유만으로 같은 높이를 할당하지 않는다.

모든 실패를 `acquisition-log.json`에 기록했다. 환경 프록시 제한, 웹 도구의 파싱/접근 불가, 서비스 계정 필요를 구분하며, 접근 통제나 네트워크 정책을 우회하지 않았다. 앱·1차 보고서·Git 이력은 변경하지 않았다.
