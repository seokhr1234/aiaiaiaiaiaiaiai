# 전체 원본 복원·보관 및 검증

확인일: 2026-10-31. 사용자가 전달한 분할 파일 4개를 이어 전체 원본 ZIP을 복원했다. 첨부된 restore-donghaeng.py는 읽고 AST로 상수 manifest만 확인했으며 실행하지 않았다. 안내문 역시 자료로만 검토했다.

## 무결성과 보관 위치

- 전체 ZIP: 101,459,385 bytes, 179개 파일.
- SHA-256: `8a4038fc1a5bac69c47edce1d5d92dc3d2196f105fd11c24f50975dde0d32456`.
- 분할 4개 각각의 바이트·해시, 연결한 ZIP의 바이트·해시 모두 일치.
- 이전 완료 대화에서 기록한 전체 ZIP 해시와도 일치.
- ZIP CRC 및 경로·중복 이름·심볼릭 링크 검사를 통과했고 기존 자료를 덮어쓰지 않았다.

현재 실행 환경의 보관 경로:

```text
/workspace/research-originals/donghaeng-2026-10-31/
  donghaeng-resumed-2026-10-31.zip
  restore-manifest.json
  verification-initial.json
  restored/
    research-resumed/
    research-downloads/
```

원본 대용량 파일은 Git 저장소 밖에 있으며 보고서 ZIP에도 포함하지 않는다. 이 경로의 파일이 원격 저장소나 다른 실행 환경으로 자동 전송된 것은 아니다. 원래 전달받은 분할 파일을 보관하면 동일 해시의 ZIP을 복원할 수 있다.

저장소에는 [복원 정보](full-original-restoration.json), [독립 검수 결과](full-original-validation.json), [검수 스크립트](integration/verify-full-originals.py)를 남겼다.

## 직접 재검증한 내용

| 대상 | 재검증 결과 |
| --- | --- |
| 전체 원본 manifest | 기록된 178개 파일의 바이트·SHA-256 일치 |
| HTTP 응답 원본 | 43개 body의 바이트·SHA-256 일치 |
| GIS ZIP·XLSX 2개 | 총 3개 내부 ZIP CRC 통과 |
| 경량 묶음과 전체 묶음 공통 분석 파일 | 11개 바이트 단위 일치 |
| 완전 횡단보도 CSV | 40,282행 필드 구조 확인, 좌표 공란 1행 확인 |
| 학교 2km 횡단보도 | 원본에서 1,260행 재선별, 원본 행 번호·모든 원본 필드 일치 |
| 보도 XLSX | 상세 5,677행에서 월곡로 6개 후보 재현 |
| 횡단보도 XLSX | 21,776행에서 관리번호 결합 608행 재현 |
| OSM 15way | 기존 태그·노드 순서 및 이력 최종 버전 대조 |
| 경로 부분 간선 66개 | 당시 수집한 현재 way의 연속 노드 쌍과 일치 |
| 지형 원본 | PRJ의 EPSG:5174와 DBF 속성 직접 확인 |
| 학교 2km 지형 | 등고선 151개·표고점 727개를 원본에서 재현, 선택 ID·속성·클리핑 기하 일치 |

지형 기하의 수치 차이는 UTM에서 최대 약 0.000000006m였다. 이는 동일 자료와 처리의 재현 일치를 뜻하며 실제 측량이 그 정도로 정밀하다는 뜻이 아니다. HEIGHT의 수직 단위·높이기준은 원본 설명문·SHP XML을 확인한 뒤에도 독립 확정하지 않았다. XML의 파일 생성·복사 이력도 현장 측량일로 간주하지 않았다.

## 재현 방법과 한계

openpyxl·pyshp·pyproj·shapely가 준비된 환경에서:

```sh
python research/accessibility/round2/integration/verify-full-originals.py \
  --root /workspace/research-originals/donghaeng-2026-10-31/restored
```

검수 스크립트는 원본을 읽어 기존 추출본과 대조하며 새 실시간 API 요청이나 현장 측정을 하지 않는다. 첨부 수집 스크립트도 실행하지 않는다. 원본이 일치해도 실제 보행면의 경사·최소 유효폭·턱·현재 개방·가동 상태가 검증 완료되는 것은 아니다.
