# 2차 보도·턱·폭 원본 확보 조사

조회일: 2026-10-31 KST. 대상 학교: 서울사대부중 `(37.5950991,127.038992)` 주변 2km. 1차 보고서는 변경하지 않았다.

## 결과

공식 출처·후보 15개를 재검토하고 도보망의 **23개 출력 필드와 공개 샘플 제약**을 확인했다. 그러나 **새 XLSX/CSV/ZIP 원본 0개, API 응답 행 0개, 학교 주변 새 관측 행 0개**다. 실제 최소폭·턱높이의 새 실측값은 확보하지 못했다. 소개 확인, 문서 스키마 확인, 샘플 확보, 학교 추출, 현장 검증은 `sources.json`에서 별도 상태로 기록한다. 확보하지 않은 파일의 bytes/hash/download_url은 null이며 값을 추정하지 않았다.

가장 큰 제약은 외부 다운로드 host가 실행 환경의 허용 목록에 없다는 점이다. `data.seoul.go.kr` HTTPS 접근은 프록시의 CONNECT 403이며, 정상 공개 샘플의 `openapi.seoul.go.kr:8088`도 HTTP403으로 차단됐다. 프록시를 해제하거나 다른 host로 중계하지 않았다. 웹 도구의 공식 페이지 본문은 열람 가능했으나 동적 XLSX 다운로드 버튼의 원래 URL·JS를 얻지 못했다. 서버/첨부 주소를 추측해 다운로드했다고 주장하지 않는다.

## 우선 확보 대상

| 공식 자료 | 확인된 파일 또는 구조 | 학교 원본 검증에 남은 일 |
| --- | --- | --- |
| [OA-22240 보도통계](https://data.seoul.go.kr/dataList/OA-22240/F/1/datasetView.do) | `서울시 보도 통계자료_2025.xlsx`, 2026-09-15 수정, 0.56MB, 공공누리1 | 노선/좌우/구간별 폭의 실제 열·단위·측정일 확인. 특별시도 세부자료여서 모든 골목 포함 여부는 미확인 |
| [OA-23081 교차로·횡단보도](https://data.seoul.go.kr/dataList/OA-23081/F/1/datasetView.do) | `서울시 교차로 및 횡단보도 시설·위치정보_20260824.xlsx`, 1.69MB, 공공누리1 | 관리번호·교차로명·신호·X/Y의 실제 행과 좌표계 확인. 최신 파일명은2026-08-24, 갱신은09-07 |
| [OA-22906 횡단보도CSV](https://data.seoul.go.kr/dataList/OA-22906/S/1/datasetView.do) | `서울시 자치구 횡단보도 정보.csv`, 4.77MB, 2026-08-10 파일 수정, 페이지상 이용제한없음 | 경위도 원본 행으로 성북/동대문 및 학교2km를 추출. 시설 존재를 무단차와 동일시하지 않기 |
| [OA-21208 도보망](https://data.seoul.go.kr/dataList/OA-21208/A/1/datasetView.do) | API `TbTraficWlkNet`, WGS84, 설명상2020 기준, 코드표XLSX 2024-07-05, 공공누리1 | 문서 스키마는 확보. 샘플 행과 코드표 원본은 미확보. 필터 `SGG_NM`, `WORK_DTTM` 지원 |

도보망 공식 문서에는 좌표·연결·시설 유형·수집일은 있지만 보도폭/최소폭/턱높이 필드가 없다. `LNKG_LEN`의 단위는 열람한 문서에서 명시되지 않았다. `BGNG_LNKG_ID`, `END_LNKG_ID`는 문서에서 시작/종료노드로 설명하지만 이름만 보고 해석을 바꾸지 말고 실제 코드표·응답과 검증해야 한다. 정리된 문서 기반 스키마는 `documented-schema.json`에 있다.

공식 문서에서 공개키 `sample`은 명시된 기능이며 임의 생성키가 아니다. 인덱스는1~5만 가능하다. 샘플은 응답 형식 검사 용도이며 전체 성북구나 학교 범위의 완전성을 증명하지 않는다. 인증된 대량 API 호출·키 발급은 이번 조사에서 하지 않았다.

## 추가 공간 자료와 품질 차이

- [OA-21209 대로변 횡단보도](https://data.seoul.go.kr/dataList/OA-21209/A/1/datasetView.do): 2020 기준 WGS84 위치·길이, 첨부파일 없음. API 후보이며 새 행은 없다.
- [OA-15554 교통안전시설물 횡단보도](https://data.seoul.go.kr/dataList/OA-15554/A/1/datasetView.do): 공식 인덱스에서 EPSG:5186, 정의서HWPX(2023-08-04)와 ZIP(2021-08-09) 확인. 마지막 직접열람에는 서비스지연103. 기존 ZIP의 날짜와 포털갱신일을 혼동하지 않는다.
- [OA-22364 과거 신호등·횡단보도](https://data.seoul.go.kr/dataList/OA-22364/F/1/datasetView.do): 2023-05-30 기준 파일, 공공누리1. 원본 확보 시 최신23081과 식별자·공간·기준일로 중복검사.
- [OA-22355 보행등](https://data.seoul.go.kr/dataList/OA-22355/F/1/datasetView.do): 2026-02-13 XLSX, 자치구/주소/X/Y, 공공누리1. 횡단 진입점 후보를 좁힐 수 있으나 턱낮춤의 증거는 아니다.
- [OA-22904 가로수](https://data.seoul.go.kr/dataList/OA-22904/S/1/datasetView.do): 2026 XLSX, 2026-08-26 수정, 경위도/노선/수종. **공공누리4유형(상업금지·변경금지)**로 표시되어 자동 추출·변환·재배포를 보류했다. 가로수 점 위치가 있어도 보호틀·줄기 폭·남은 통과폭은 모른다.
- [서울안전누리 보도폭](https://safecity.seoul.go.kr/distFclt/cfMapDs/cfMapDs.page?menuId=MENU_SSNS_000176): 2024-07 전체도로폭−차도폭 산출값. 실제 양쪽 보도 분리와 장애물 차감 여부 미확인. 최소통과폭 대체값으로 쓰지 않는다.

## 성북구 실태조사 성과품 추적

[성북 공식 데이터 카탈로그](https://data.sb.go.kr/openinf/catalog/cataloglist.jsp)는 정상 열람했지만 해당 실태조사 성과품은 식별하지 못했다. 정보소통광장 검색 URL은 웹도구에서 접근 불가이고 검색엔진에서도 관련 성과품을 찾지 못했다. **미발견은 자료 부존재나 비공개를 증명하지 않는다.**

2차 공고집계 사이트 [수주벗](https://sujubut.com/bid/domestic/236951/)에서 원문 추적용 공고번호 `R25BK00613139` 차수000, 성북 재무공고2025-13, 사전규격 `R25BD00010294`, 통합공고 `R25BM00037840`과 용역설명서/과업지시서 파일명을 확인했다. 원본을 열지 못했으므로 수록 범위·실측항목·계약완료를 공식 확인한 것으로 처리하지 않았다. 계획·입찰공고는 준공 성과품이 아니다.

[공식 나라장터](https://www.g2b.go.kr/)는 직접 열람 결과 **2026-10-30 19:00~2026-11-01 24:00(52시간)** 시스템점검으로 차세대나라장터·쇼핑몰 등 조달청 업무 중단을 안내했다. 이 제한은 실행 환경의 도메인 차단과 구분된다. 중단 이후 원문 공고번호로 재확인이 필요하다.

[성북구의회 제315회 예결특위6차(2025-12-05)](https://www.sbc.go.kr/record/recordView.do?key=a175fd03b9963acaac3e761486186bdb01a32447ed31cf749e53e0d38e0473313dbf04666afaa593)도 열람했다. 턱낮춤 관련 논의 단서가 있으나 측정값·좌표·학교 주변 결과는 얻지 못했다. 예산/계획 설명을 준공값이나 현장측정값으로 앱에 넣지 않는다.

## 재현 및 검증 방법

`acquire.py`는 표준Python으로 공식 샘플과 정확한 공식 페이지를 읽고 원본 bytes·SHA256·최종URL·Content-Type을 `/workspace/research-downloads/sidewalk/`에 기록한다. 임의 다운로드 endpoint나 로그인은 사용하지 않는다. `sample`을 실행했으나403이라 원본이 생성되지 않았다. `inspect-html`은 허용환경에서 정상 페이지의 링크/onclick/script를 출력하여 실제 다운로드 경로를 찾는 용도다. 아직 정상경로를 발견한 것은 아니다.

```sh
python research/accessibility/round2/sidewalk/acquire.py sample
python research/accessibility/round2/sidewalk/acquire.py inspect-html
python research/accessibility/round2/sidewalk/acquire.py inspect-table /absolute/path/to/official.xlsx
```

XLSX 검사는 `openpyxl` 필요. 이 스크립트는 원본을 확보한 뒤 실제 시트·열의 첫12행만 점검한다. 좌표계·실측 단위·좌우 의미를 확인하기 전 학교2km 자동추출을 실행하지 않았다. 샘플 실패/서비스지연/점검의 구분은 `acquisition-log.json`에 있다.

파일 원본이 확보되면 ① 원본 hash/라이선스 확인 ② 시트·열·단위·좌표계 확인 ③ 좌표를 WGS84로 변환 ④ 학교2km 추출 ⑤ 식별자·좌우·층·접속 검토 ⑥ 실제 최소폭·턱높이의 미확인 여부 유지 순으로 이어간다. 최초 자료구조를 확인하지 않은 상태에서 임의 열 매핑을 구현해 정확한 추출인 것처럼 만들지 않았다.
