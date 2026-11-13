"""Build a separate, source-bound OSM reference-routing graph, never overwrite research.

Existing nine runtime datasets remain unchanged. Buildings/blocked nodes/unknown
structures are withheld; this is not a verified accessible pedestrian network.
"""
from pathlib import Path
from array import array
import gzip, hashlib, json, math, re, sys, collections
import shapely
from shapely import Polygon, LineString, box, STRtree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'donghaeng-nav/services/city-walk'
ASSETS = OUT/'assets'
SOURCE = ROOT/'research/accessibility'
SOUTH, WEST, NORTH, EAST = 37.40, 126.75, 37.72, 127.20
sha = lambda b: hashlib.sha256(b).hexdigest()
def read(path):
    with gzip.open(path, 'rt') as f: return json.load(f)
def distance(a,b):
    y1,y2=map(math.radians,[a[1],b[1]])
    return 12742000*math.asin(min(1,math.sqrt(math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin(math.radians(b[0]-a[0])/2)**2)))
def inside(c): return WEST<=c[0]<=EAST and SOUTH<=c[1]<=NORTH
def pack():
    if ASSETS.exists(): raise RuntimeError('Preserve previous output; use a new version directory')
    result=json.loads((SOURCE/'round8-2026-11-11/study-graph-v2-results.json').read_text())
    topology=SOURCE/'round8-2026-11-11/derived-v2/candidate-segments.ndjson.gz'
    # Bind to the already independently validated study checkpoint.
    assert sha(topology.read_bytes())==result['outputs']['candidate-segments.ndjson.gz']['sha256']
    print('source topology hash verified',flush=True)
    context_path=SOURCE/'round5-2026-11-11/derived/study-context.json.gz'
    context=read(context_path)['elements']; coords={n['id']:(n['lon'],n['lat']) for n in context if n['type']=='node'}
    buildings=[]; invalid=0
    for w in context:
        if w['type']!='way': continue
        ring=[coords[i] for i in w['nodes']]
        if len(ring)<4 or ring[0]!=ring[-1]:
            invalid+=1; xs,ys=zip(*ring); buildings.append(box(min(xs),min(ys),max(xs),max(ys))); continue
        polygon=Polygon(ring)
        if not polygon.is_valid:
            invalid+=1; polygon=box(*polygon.bounds)
        buildings.append(polygon)
    del context,coords
    tree=STRtree(buildings)
    roads=read(SOURCE/'round5-2026-11-11/derived/study-map.json.gz')['elements']
    roads={w['id']:w for w in roads if w['type']=='way'}
    nodes={}; ways={}; way_rows=[]; node_ids=array('d'); coordinates=array('d')
    starts=array('I'); ends=array('I'); way_index=array('I'); parts=array('I'); lengths=array('d'); flags=array('B'); slopes=array('f')
    counts=collections.Counter(); exclusions=[]
    def node(ident,ll):
        if ident not in nodes:
            nodes[ident]=len(nodes); node_ids.append(ident); coordinates.extend(ll)
        else:
            i=nodes[ident]; assert tuple(coordinates[i*2:i*2+2])==tuple(ll)
        return nodes[ident]
    with gzip.open(topology,'rt') as f:
        for line in f:
            e=json.loads(line); counts['source_segments']+=1; a,b=e['coordinates']
            if not inside(a) or not inside(b): counts['outside_extent']+=1; continue
            line=LineString([a,b]); hits=tree.query(line)
            if any(line.relate_pattern(buildings[int(i)],'T********') for i in hits):
                counts['building_interior_withheld']+=1; exclusions.append([e['way_id'],e['part']]); continue
            w=roads[e['way_id']]; t=w['tags']; wid=w['id']
            if wid not in ways:
                ways[wid]=len(way_rows); way_rows.append([wid,t.get('name'),w.get('timestamp'),t.get('highway'),t.get('incline'),e['foot_claim']])
            starts.append(node(e['node_ids'][0],a)); ends.append(node(e['node_ids'][1],b)); way_index.append(ways[wid]); parts.append(e['part']); lengths.append(distance(a,b))
            flags.append(int(e['steps']) | (2 if t.get('surface') in ['gravel','unpaved','sand','dirt','ground','cobblestone'] else 0) | (4 if 'no' in [e['wheelchair_tag'],*e['node_wheelchair_tags']] else 0))
            raw=e['source_incline_raw']; match=re.fullmatch(r'([+-]?\d+(?:\.\d+)?)\s*%?',str(raw)) if raw is not None else None
            slope=abs(float(match[1])) if match else math.nan
            if math.isfinite(slope) and slope>100: slope=math.nan
            slopes.append(slope); counts['registered_numeric_incline' if math.isfinite(slope) else 'incline_unknown']+=1
            if len(starts)%200000==0: print('segments',len(starts),flush=True)
    n=len(nodes); m=len(starts); degree=array('I',[0])*n
    for a,b in zip(starts,ends): degree[a]+=1; degree[b]+=1
    offsets=array('I',[0]); total=0
    for d in degree: total+=d; offsets.append(total)
    targets=array('I',[0])*(2*m); edge_indices=array('I',[0])*(2*m); cursor=array('I',offsets[:-1])
    for i,(a,b) in enumerate(zip(starts,ends)):
        j=cursor[a]; targets[j]=b; edge_indices[j]=i; cursor[a]+=1
        j=cursor[b]; targets[j]=a; edge_indices[j]=i; cursor[b]+=1
    arrays={'nodeIds':node_ids,'coordinates':coordinates,'offsets':offsets,'targets':targets,'edgeIndices':edge_indices,'starts':starts,'ends':ends,'wayIndex':way_index,'parts':parts,'lengths':lengths,'flags':flags,'slopes':slopes}
    payload=bytearray(); layout={}
    for name,values in arrays.items():
        while len(payload)%8: payload.append(0)
        if sys.byteorder!='little': values.byteswap()
        layout[name]={'offset':len(payload),'length':len(values),'type':values.typecode}; payload.extend(values.tobytes())
    ASSETS.mkdir(parents=True)
    metadata={'source_url':result['source_url'],'source_as_of':result['source_as_of'],'collected_date':'2026-11-11','prepared_date':'2026-11-13','source_crs':'EPSG:4326','vertical_datum':None,'license':'ODbL-1.0','field_verified':False,'accessibility_verified':False,'new_slope_values_promoted':0,'source_pbf_sha256':result['source_pbf_sha256'],'scope':'Seoul-covering rectangular OSM subset, not an administrative completeness claim','notice':'OSM registration reference routing; curb/width/surface grade/entrances/current access unverified. Bridges/tunnels/indoor/blocked nodes withheld; no fabricated links.'}
    assets={}
    for name,raw in [('graph.bin.gz',bytes(payload)),('ways.json.gz',json.dumps(way_rows,ensure_ascii=False,separators=(',',':')).encode())]:
        packed=gzip.compress(raw,compresslevel=6,mtime=0); (ASSETS/name).write_bytes(packed); assets[name]={'bytes':len(packed),'sha256':sha(packed),'raw_bytes':len(raw),'raw_sha256':sha(raw)}
    manifest={'schema':'donghaeng-city-walk-graph-v1','dataset_version':'city-walk-'+sha(payload),'nodes':n,'segments':m,'ways':len(way_rows),'bounds':[WEST,SOUTH,EAST,NORTH],'layout':layout,'assets':assets,'metadata':metadata,'validation_required':True}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    report={'pass':True,'counts':dict(counts),'nodes':n,'segments':m,'ways':len(way_rows),'building_polygons':len(buildings),'invalid_buildings_conservative_bbox':invalid,'inputs':{str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in [topology,context_path]},'assets':assets,'shapely':shapely.__version__,'node_identity_preserved':True,'coordinate_snaps':0,'fabricated_links':0,'new_slope_values_promoted':0,'field_verified':False,'research_unchanged':True}
    (ROOT/'donghaeng-nav/docs/city-walk-preparation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    with gzip.open(ASSETS/'building-exclusions.json.gz','wt') as f: json.dump(exclusions,f)
    print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__': pack()
