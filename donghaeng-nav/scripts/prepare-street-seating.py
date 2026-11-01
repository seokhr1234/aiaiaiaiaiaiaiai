"""Merge historically documented street-adjacent seating area references."""
from pathlib import Path
import json
r=Path(__file__).resolve().parent.parent/'data/accessibility/seoul'
p=r/'seoul-facilities.geojson'
a=json.loads(p.read_text())
base=[f for f in a['features'] if not f['properties']['id'].startswith('street:historic:') and not f['properties']['id'].startswith('street:geumcheon:') and not f['properties']['id'].startswith('street:pocket:')]
incoming=json.loads((r/'street-seating/street-seating.geojson').read_text())['features']+json.loads((r/'street-seating/pocket-seating.geojson').read_text())['features']
a['features']=base+incoming
p.write_text(json.dumps(a,ensure_ascii=False,separators=(',',':')))
print('거리 주변 과거 의자 기록 구역',len(incoming),'건 (개별 벤치 좌표 아님)')
