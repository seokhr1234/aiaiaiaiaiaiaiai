from pathlib import Path
import json
r=Path(__file__).resolve().parent.parent/"data/accessibility/seoul"
p=r/"seoul-facilities.geojson"
a=json.loads(p.read_text()); a["features"]=[f for f in a["features"] if not f["properties"]["id"].startswith("blcm:chair-space:")] + json.loads((r/"public-open-spaces/spaces.geojson").read_text())["features"]
p.write_text(json.dumps(a,ensure_ascii=False,separators=(",",":")))
print("국토교통부 의자 공개공지",len(json.loads((r/"public-open-spaces/spaces.geojson").read_text())["features"]),"곳")
