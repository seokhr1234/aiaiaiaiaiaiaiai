"""Display-only derivative of verified city OSM segments; never routing input."""
from pathlib import Path
import gzip, hashlib, json, re, struct
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'donghaeng-nav/services/city-walk'
m=json.loads((source/'manifest.json').read_bytes())
def read(name):
    packed=(source/'assets'/name).read_bytes()
    assert hashlib.sha256(packed).hexdigest()==m['assets'][name]['sha256']
    raw=gzip.decompress(packed)
    assert hashlib.sha256(raw).hexdigest()==m['assets'][name]['raw_sha256']
    return raw
raw=read('graph.bin.gz');ways=json.loads(read('ways.json.gz'))
def at(name,index):
    item=m['layout'][name]
    return struct.unpack_from('<'+item['type'],raw,item['offset']+index*struct.calcsize('<'+item['type']))[0]
features=[]
for i in range(m['segments']):
    w=ways[at('wayIndex',i)];tag=str(w[4] or '').strip()
    if not tag: continue
    match=re.fullmatch(r'([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(%|°|deg)',tag,re.I)
    grade=None
    if match:
        import math
        n=float(match[1]);degrees=match[2]!='%'
        if not degrees or abs(n)<90: grade=abs(math.tan(math.radians(n))*100 if degrees else n)
    a=at('starts',i);b=at('ends',i)
    coords=[[at('coordinates',n*2),at('coordinates',n*2+1)] for n in [a,b]]
    features.append({'type':'Feature','geometry':{'type':'LineString','coordinates':coords},'properties':{'way_id':w[0],'name':w[1],'raw':tag,'percent':grade,'source_modified':w[2],'segment':i}})
result={'type':'FeatureCollection','metadata':{'display_only':True,'field_verified':False,'routing_eligible':False,'source':'OpenStreetMap / Geofabrik','source_as_of':m['metadata']['source_as_of'],'license':'ODbL-1.0','source_graph_sha256':m['assets']['graph.bin.gz']['raw_sha256'],'coverage':'Sparse incline tags within Seoul-covering bounds; missing tags have no slope value','unit_policy':'Only explicit % or degrees converted; unitless/up/down remain unknown','new_slope_values_promoted':0},'features':features}
p=ROOT/'donghaeng-nav/dist/data/accessibility/seoul/registered-slopes.geojson'
b=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode();p.write_bytes(b);p.with_suffix(p.suffix+'.gz').write_bytes(gzip.compress(b,mtime=0))
report={'pass':True,'segments':len(features),'numericWithExplicitUnits':sum(f['properties']['percent'] is not None for f in features),'sourceAssetsVerified':2,'sourceGeometryPreserved':True,'newSlopeValuesPromoted':0,'fieldVerified':False}
(ROOT/'donghaeng-nav/docs/slope-source-results.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
