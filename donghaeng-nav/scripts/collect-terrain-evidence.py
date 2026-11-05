"""Extract review evidence from the supplied OA-22241 archive, never a routing slope.
Run with pyproj, pyshp, scipy, numpy. Archive paths are explicit; no downloads or credentials.
"""
from pathlib import Path
import argparse,io,json,hashlib,zipfile,subprocess
import numpy as np
import shapefile
from pyproj import CRS,Transformer
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[2]
a=argparse.ArgumentParser();a.add_argument('--archive',type=Path,required=True);args=a.parse_args()
out=ROOT/'research/accessibility/round3-2026-11-05';out.mkdir(parents=True,exist_ok=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source='https://data.seoul.go.kr/dataList/OA-22241/F/1/datasetView.do'
# A 200m margin around the entire runtime bbox, not just the school circle.
bbox=(127.017,37.577,127.061,37.614);features=[];spots=[];source_counts={}
with zipfile.ZipFile(args.archive) as z:
 for prefix,kind in [('표고 5000/N3P_F002','spot'),('등고선 5000/N3L_F001','contour')]:
  crs=CRS.from_wkt(z.read(prefix+'.prj').decode());assert crs.to_epsg()==5174
  transform=Transformer.from_crs(crs,4326,always_xy=True)
  r=shapefile.Reader(shp=io.BytesIO(z.read(prefix+'.shp')),dbf=io.BytesIO(z.read(prefix+'.dbf')),encoding='cp949');source_counts[kind]=len(r)
  for item in r.iterShapeRecords():
   d=item.record.as_dict();points=[list(transform.transform(*p[:2])) for p in item.shape.points]
   if not any(bbox[0]<=p[0]<=bbox[2] and bbox[1]<=p[1]<=bbox[3] for p in points):continue
   assert np.isfinite(d['HEIGHT'])
   if kind=='spot':geometry={'type':'Point','coordinates':points[0]};spots.append((d['UFID'],points[0],d['HEIGHT']))
   else:
    indices=list(item.shape.parts)+[len(points)];geometry={'type':'MultiLineString','coordinates':[points[indices[i]:indices[i+1]] for i in range(len(indices)-1)]}
   features.append({'type':'Feature','geometry':geometry,'properties':{'source_id':d['UFID'],'kind':kind,'source_height':d['HEIGHT'],'source_crs':'EPSG:5174','source_url':source,'vertical_datum':'unconfirmed','field_verified':False,'routing_eligible':False}})
assert spots
# Distances in metric UTM52. Store measured source HEIGHT without claiming a
# road-surface elevation or deriving slopes from off-road point pairs.
tm=Transformer.from_crs(4326,32652,always_xy=True);tree=cKDTree([tm.transform(*s[1]) for s in spots])
code="const E=require('./donghaeng-nav/dist/engine'),g=E.createGraph(require('./donghaeng-nav/dist/map-data.json'));let seen=new Set(),rows=[];for(const n of g.nodes.values())for(const e of n.edges)if(!seen.has(e.key)){seen.add(e.key);rows.push({key:e.key,a:n.ll,b:g.nodes.get(e.to).ll,structure:!!E.terrainApplicability(e,n,g.nodes.get(e.to))})}console.log(JSON.stringify(rows))"
rows=json.loads(subprocess.check_output(['node','-e',code],cwd=ROOT));edges={}
for row in rows:
 ll=[(row['a'][1]+row['b'][1])/2,(row['a'][0]+row['b'][0])/2];dist,ids=tree.query(tm.transform(*ll),k=3)
 edges[row['key']]={'nearestSpotMeters':round(float(dist[0]),1),'spotsWithin100m':len(tree.query_ball_point(tm.transform(*ll),100)),'supports':[{'id':spots[int(i)][0],'distanceMeters':round(float(d),1),'sourceHeight':spots[int(i)][2]} for d,i in zip(dist,ids) if d<=100],'structureExcluded':row['structure']}
report={'version':1,'reviewed_date':'2026-11-05','archive_originally_collected':'2026-10-31','source_url':source,'archive_sha256':sha(args.archive),'graph_sha256':sha(ROOT/'donghaeng-nav/dist/map-data.json'),'source_crs':'EPSG:5174','display_crs':'EPSG:4326','distance_crs':'EPSG:32652','support_reference':'edge_midpoint','vertical_datum':'unconfirmed','source_height_units':'not independently verified','field_verified':False,'routing_eligible':False,'new_slope_values_promoted':0,'bbox':bbox,'source_counts':source_counts,'selected_points':len(spots),'selected_contours':len(features)-len(spots),'edges_with_support':sum(bool(e['supports']) for e in edges.values()),'edges_without_support':sum(not e['supports'] for e in edges.values()),'edges':edges}
(out/'terrain-source-features.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'donghaeng-nav/dist/data/terrain/evidence.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':'))+'\n')
summary={k:v for k,v in report.items() if k!='edges'};(out/'terrain-evidence-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,ensure_ascii=False,indent=2))
