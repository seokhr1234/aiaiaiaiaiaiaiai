import runpy
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-wolgok.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-official-facilities.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-park-seating.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-photo-benches.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-street-seating.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-smgis-benches.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-mapillary-benches.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-public-spaces.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-gap-walk.py"),run_name="__main__")
runpy.run_path(str(__import__("pathlib").Path(__file__).resolve().parent/"prepare-apartments.py"),run_name="__main__")
"""Copy canonical, coordinate-bearing facilities into the static document root.
The official CSV is audited, but never converted into map features without coordinates.
"""
from pathlib import Path
import csv,json,shutil
root=Path(__file__).resolve().parent.parent
source=root/'data/accessibility'
for relative in ['benches/expanded/benches-expanded.geojson','school-facilities.geojson','seoul/seoul-facilities.geojson','seoul/summary.json','seoul/seoul-base.json']:
 target=root/'dist/data/accessibility'/relative
 target.parent.mkdir(parents=True,exist_ok=True)
 shutil.copyfile(source/relative,target)
with (source/'seoul-escalators.csv').open(encoding='utf-8-sig') as handle:
 rows=list(csv.DictReader(handle))
coordinate_rows=sum(bool(r.get('latitude','').strip() and r.get('longitude','').strip()) for r in rows)
summary={'official_escalators':{'rows':len(rows),'rows_with_coordinates':coordinate_rows,'map_features_created':0,'reason':'No coordinate inference; official CSV is not a spatial source.'}}
(root/'dist/data/accessibility/source-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(f'시설 GeoJSON 복사 완료 · 공식 CSV {len(rows)}행, 좌표 기입 {coordinate_rows}행, 생성 마커 0개')
