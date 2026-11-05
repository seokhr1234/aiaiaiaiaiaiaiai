"""Apply manually cross-checked public documents to existing facility identities.
Preserves all coordinates, cooling designations and opening-hour decisions.
"""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'research/accessibility/round3-2026-11-05'
path=ROOT/'donghaeng-nav/dist/data/accessibility/seoul/seoul-facilities.geojson';data=json.loads(path.read_text())
source_list='https://www.sb.go.kr/children/contents.do?key=367'
source_floors='https://www.sbc.go.kr/attach/record/SEONGBUK/appendix/a09/A0007166.pdf'
source_access='https://access.visitkorea.or.kr/ms/detail.do?cotId=172646e9-64ae-4a93-8aa3-69a1b517158a'
floors={'성북정보도서관':'지하2~지상5층','아리랑도서관':'지하1~지상3층','해오름도서관':'지상1층','종암동새날도서관':'4·5층','서경로꿈마루도서관':'2층','석관동미리내도서관':'4·5층','달빛마루도서관':'2층','정릉도서관':'지하1층·지상2층','청수도서관':'지하1~지상2층','월곡꿈그림도서관':'1층','아리랑어린이도서관':'지하1~지상2층','장위행복누림도서관':'지하1~지상2층','길빛도서관':'지하1~지상2층','글빛도서관':'2층','오동숲속도서관':'1층','보문숲길도서관':'지하1층'}
hours={'성북정보도서관':'평일 09–22시·주말 09–18시 / 첫째·셋째 월요일 휴관','아리랑도서관':'평일 09–22시·주말 09–18시 / 둘째·넷째 월요일 휴관','해오름도서관':'09–18시 / 월요일 휴관','월곡꿈그림도서관':'09–18시·수요일 21시까지 / 월요일 휴관','아리랑어린이도서관':'09–18시 / 월요일 휴관','장위행복누림도서관':'09–18시 / 월요일 휴관','길빛도서관':'평일 09–22시·주말 09–18시 / 월요일 휴관','글빛도서관':'09–18시 / 월요일 휴관','오동숲속도서관':'09–18시 / 월요일 휴관','보문숲길도서관':'09–18시 / 월요일 휴관'}
records=[]
for f in data['features']:
 p=f['properties'];name=p.get('name');
 if p.get('kind')!='shelter' or name not in floors:continue
 evidence=[e for e in p.get('additional_official_evidence',[]) if e.get('collection_batch')!='2026-11-05']
 entry={'collection_batch':'2026-11-05','source':'성북구의회 · 2026 성북문화재단 출연 동의안','source_url':source_floors,'source_as_of':'2026년도 문서 / 웹 색인 열람','retrieved_date':'2026-11-05','building_floors':floors[name],'note':'시설 층수 근거. 승강기·출입 동선과 현재 운영은 미검증.'};evidence.append(entry)
 if name in hours:evidence.append({'collection_batch':'2026-11-05','source':'성북구청 · 구립도서관 안내','source_url':source_list,'source_as_of':'2025-12-26 최종수정 / 웹 색인 열람','retrieved_date':'2026-11-05','operating_note':hours[name],'note':'도서관 일반 이용시간. 무더위쉼터 운영시간과 다를 수 있어 원래 운영 자료를 대체하지 않음.'})
 if name=='오동숲속도서관':evidence.append({'collection_batch':'2026-11-05','source':'한국관광공사 · 열린관광','source_url':source_access,'source_as_of':'2026-06-23 수정 / 본문 열람','retrieved_date':'2026-11-05','operating_note':'09–18시, 월요일·일요일 외 법정공휴일 휴관. 공원 출입통제 시 임시휴관 가능.','accessibility_note':'자동문·장애인 주차장·장애인 화장실 등록. 접근 보행로의 경사·턱·폭 및 현재 상태는 미검증.'})
 p['additional_official_evidence']=evidence
 p['rest_evidence_note']=('층수 자료가 서로 달라 출입층 확인 필요' if name in {'해오름도서관','장위행복누림도서관','글빛도서관'} else '시설 '+floors[name]+' · 층간 이동·현장 출입 확인 필요')+(' · 일반 도서관/무더위쉼터 운영시간 별도 확인' if name in hours else '')+(' · 주소 표기가 달라 방문 전 위치 확인 필요' if name=='글빛도서관' else '')
 records.append({'id':p['id'],'name':name,'coordinates_unchanged':True,'field_verified':False,'evidence':[e for e in evidence if e.get('collection_batch')=='2026-11-05']})
assert len(records)>=12
path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
report={'date':'2026-11-05','enriched_facilities':len(records),'new_facility_coordinates':0,'evidence_entries':sum(len(r['evidence']) for r in records),'no_new_cooling_designations':True,'original_hours_preserved':True,'records':records,'unresolved':['글빛도서관 주소: 구청 안내 길음로8길 vs 기존 쉼터/의회 길음로7길. 좌표 이동 안 함.','해오름·장위행복누림·글빛 층수/규모는 문서별 차이가 있어 출입층 확정에 사용하지 않음.','2026-05-29 쉼터 신규5·해제3 공지 목록 발견. 시설별 원문 미확보로 추가/삭제 미적용.']}
(OUT/'shelter-evidence.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print({k:v for k,v in report.items() if k!='records'})
