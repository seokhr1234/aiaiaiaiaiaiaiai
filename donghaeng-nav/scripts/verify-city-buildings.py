"""Recheck all retained lines against the original registered building interiors.

Uses batched spatial joins and DE-9IM matrices, independently of the streaming
generator's per-line filter. This checks registered geometry, not field truth.
"""
from pathlib import Path
from array import array
import gzip,json
import shapely
from shapely import Polygon,box,STRtree
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'donghaeng-nav/services/city-walk'
with gzip.open(ROOT/'research/accessibility/round5-2026-11-11/derived/study-context.json.gz','rt') as f:data=json.load(f)['elements']
nodes={n['id']:(n['lon'],n['lat']) for n in data if n['type']=='node'};polygons=[]
for w in data:
 if w['type']!='way':continue
 ring=[nodes[i] for i in w['nodes']]
 polygon=Polygon(ring) if len(ring)>=4 and ring[0]==ring[-1] else None
 if polygon is None or not polygon.is_valid:
  xs,ys=zip(*ring);polygon=box(min(xs),min(ys),max(xs),max(ys))
 polygons.append(polygon)
del data,nodes
tree=STRtree(polygons);m=json.loads((BASE/'manifest.json').read_text());raw=gzip.decompress((BASE/'assets/graph.bin.gz').read_bytes());g={}
for key in ['coordinates','starts','ends']:
 d=m['layout'][key];a=array(d['type']);a.frombytes(raw[d['offset']:d['offset']+d['length']*array(d['type']).itemsize]);g[key]=a
tested=0;intersections=0
for offset in range(0,m['segments'],10000):
 coords=[[[g['coordinates'][v*2],g['coordinates'][v*2+1]] for v in [g['starts'][i],g['ends'][i]]] for i in range(offset,min(offset+10000,m['segments']))]
 lines=shapely.linestrings(coords);pairs=tree.query(lines,predicate='intersects');intersections+=len(pairs[0])
 if len(pairs[0]):
  matrices=shapely.relate(lines[pairs[0]],tree.geometries[pairs[1]])
  assert all(value[0]=='F' for value in matrices),('building interior intersection',offset)
 tested+=len(lines)
# Geometric fixtures include crossing, contained line, boundary touch and bridge
# tags (withheld by source policy, never waived by a two-dimensional test).
building=box(0,0,10,10)
assert shapely.relate(shapely.LineString([[-1,5],[11,5]]),building)[0]!='F'
assert shapely.relate(shapely.LineString([[1,1],[2,2]]),building)[0]!='F'
assert shapely.relate(shapely.LineString([[-1,0],[0,0]]),building)[0]=='F'
report={'pass':True,'retained_segments_checked':tested,'registered_building_footprints':len(polygons),'bounding_box_intersections':intersections,'retained_building_interior_intersections':0,'source_registered_geometry_only':True,'field_verified':False,'building_courtyard_holes_not_inferred':True}
(ROOT/'donghaeng-nav/docs/city-walk-building-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
