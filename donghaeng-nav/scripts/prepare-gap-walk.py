from pathlib import Path
import json
r=Path(__file__).resolve().parent.parent/"data/accessibility/seoul"
p=r/"seoul-facilities.geojson"; d=json.loads(p.read_text()); d["features"]=[f for f in d["features"] if not f["properties"]["id"].startswith("review:gap-walk:")] + json.loads((r/"gap-survey-walk-20261030/seating.geojson").read_text())["features"]
p.write_text(json.dumps(d,ensure_ascii=False,separators=(",",":")))
print("생활도로 거리뷰 확인 의자 1곳")
