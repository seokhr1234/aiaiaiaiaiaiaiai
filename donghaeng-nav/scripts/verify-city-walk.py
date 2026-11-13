"""Independent, exhaustive source correspondence and adjacency conservation."""
from pathlib import Path
from array import array
from collections import Counter
import gzip,hashlib,json,math,subprocess
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'donghaeng-nav/services/city-walk'
sha=lambda b:hashlib.sha256(b).hexdigest()
m=json.loads((BASE/'manifest.json').read_text());prep=json.loads((ROOT/'donghaeng-nav/docs/city-walk-preparation.json').read_text())
for path,digest in prep['inputs'].items():assert sha((ROOT/path).read_bytes())==digest,path
raw=gzip.decompress((BASE/'assets/graph.bin.gz').read_bytes());g={}
for name,d in m['layout'].items():
 a=array(d['type']);a.frombytes(raw[d['offset']:d['offset']+d['length']*array(d['type']).itemsize]);g[name]=a
ways=json.loads(gzip.decompress((BASE/'assets/ways.json.gz').read_bytes()))
for name,d in m['assets'].items():
 packed=(BASE/'assets'/name).read_bytes();content=gzip.decompress(packed);assert sha(packed)==d['sha256'] and sha(content)==d['raw_sha256'] and len(content)==d['raw_bytes']
assert len(g['nodeIds'])==m['nodes']==len(set(g['nodeIds']));assert len(g['starts'])==m['segments'];assert len(ways)==m['ways']
by_part={(ways[g['wayIndex'][i]][0],g['parts'][i]):i for i in range(m['segments'])};assert len(by_part)==m['segments']
with gzip.open(BASE/'assets/building-exclusions.json.gz','rt') as f: withheld={tuple(x) for x in json.load(f)}
assert len(withheld)==prep['counts']['building_interior_withheld'];assert not withheld&by_part.keys()
checked=0;outside=0;dropped=0;unknown=0
with gzip.open(ROOT/'research/accessibility/round8-2026-11-11/derived-v2/candidate-segments.ndjson.gz','rt') as f:
 for line in f:
  e=json.loads(line);key=(e['way_id'],e['part']);inside=all(m['bounds'][0]<=x<=m['bounds'][2] and m['bounds'][1]<=y<=m['bounds'][3] for x,y in e['coordinates'])
  if not inside:outside+=1;assert key not in by_part;continue
  if key in withheld:dropped+=1;continue
  assert key in by_part,key;i=by_part[key]
  for node,ident,ll in zip([g['starts'][i],g['ends'][i]],e['node_ids'],e['coordinates']):assert g['nodeIds'][node]==ident and list(g['coordinates'][node*2:node*2+2])==ll,key
  assert bool(g['flags'][i]&1)==e['steps'];assert bool(g['flags'][i]&4)==('no' in [e['wheelchair_tag'],*e['node_wheelchair_tags']]);assert ways[g['wayIndex'][i]][4]==e['source_incline_raw'];assert ways[g['wayIndex'][i]][5]==e['foot_claim']
  a,b=e['coordinates'];r=math.pi/180;y1,y2=a[1]*r,b[1]*r;d=12742000*math.asin(min(1,math.sqrt(math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((b[0]-a[0])*r/2)**2)))
  assert abs(d-g['lengths'][i])<1e-6;checked+=1;unknown+=int(math.isnan(g['slopes'][i]))
assert checked==m['segments'];assert outside==prep['counts']['outside_extent'];assert dropped==len(withheld);assert unknown==prep['counts']['incline_unknown']
seen=bytearray(m['segments'])
for v in range(m['nodes']):
 assert g['offsets'][v]<=g['offsets'][v+1]
 for j in range(g['offsets'][v],g['offsets'][v+1]):
  e=g['edgeIndices'][j];to=g['targets'][j];assert (g['starts'][e]==v and g['ends'][e]==to) or (g['ends'][e]==v and g['starts'][e]==to);seen[e]+=1
assert all(n==2 for n in seen)
assert not subprocess.check_output(['git','diff','--name-only','863b84a','--','research'])
lock=json.loads((ROOT/'donghaeng-nav/dist/runtime-integrity.json').read_text())
for item in lock['data']:assert sha((ROOT/'donghaeng-nav/dist'/item['path']).read_bytes())==item['sha256']
report={'pass':True,'segments_checked':checked,'original_node_coordinates_and_ids_checked':m['nodes'],'adjacency_arcs_checked':len(g['targets']),'building_overlap_withheld':dropped,'outside_extent_withheld':outside,'unknown_incline_preserved':unknown,'original_runtime_datasets_unchanged':9,'prior_research_unchanged':True,'field_verified':False,'accessibility_verified':False,'new_measured_slopes':0}
(ROOT/'donghaeng-nav/docs/city-walk-source-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,indent=2))
