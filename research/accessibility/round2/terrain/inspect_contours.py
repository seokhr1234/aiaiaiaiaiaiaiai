#!/usr/bin/env python3
"""Read an acquired OA-22241 ZIP; inspect PRJ/DBF and extract school-area features.
Dependencies: pyshp, pyproj, shapely. No network, no archive extraction, no slope inference.
Usage: PYTHONPATH=/tmp/terrain-python-deps python inspect_contours.py INPUT.zip OUTPUT_DIR
"""
import sys,json,hashlib,zipfile,io,collections,datetime
from pathlib import Path
import shapefile
from pyproj import CRS,Transformer
from shapely.geometry import shape,mapping,Point
from shapely.ops import transform

source=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
center=(127.038992,37.5950991)
to_metric=Transformer.from_crs(4326,32652,always_xy=True).transform
from_metric=Transformer.from_crs(32652,4326,always_xy=True).transform
circle=transform(to_metric,Point(*center)).buffer(2000,quad_segs=64)
report={'input':str(source),'bytes':source.stat().st_size,'sha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'inspected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'radius_m':2000,'school_lonlat':center,'distance_crs':'EPSG:32652','slope_generated':False,'layers':[]}
with zipfile.ZipFile(source) as z:
 if z.testzip(): raise ValueError('ZIP CRC failure')
 names=z.namelist();report['archive_members']=names
 for shp in [n for n in names if n.lower().endswith('.shp')]:
  stem=shp[:-4];matches={Path(n).suffix.lower():n for n in names if n[:-4]==stem}
  prj=z.read(matches['.prj']).decode('utf-8-sig');crs=CRS.from_wkt(prj)
  to_ll=Transformer.from_crs(crs,4326,always_xy=True).transform
  readers={k[1:]:io.BytesIO(z.read(v)) for k,v in matches.items() if k in ('.shp','.shx','.dbf')}
  # Numeric fields need no locale; preserve text safely using declared CPG when present.
  enc=z.read(matches['.cpg']).decode().strip() if '.cpg' in matches else 'cp949'
  if enc=='949':enc='cp949'
  r=shapefile.Reader(**readers,encoding=enc,encodingErrors='replace')
  layer={'name':stem,'shape_type':r.shapeType,'records':len(r),'fields':r.fields[1:],'crs_wkt':prj,'epsg':crs.to_epsg(),'encoding':enc,'selected':0,'height_min':None,'height_max':None,'height_units':'not independently established; inspect source metadata','vertical_datum':None}
  features=[];hs=[]
  for idx,sr in enumerate(r.iterShapeRecords()):
   attrs=sr.record.as_dict()
   if attrs.get('HEIGHT') is not None: hs.append(float(attrs['HEIGHT']))
   if sr.shape.shapeType==0:continue
   geom=transform(to_ll,shape(sr.shape.__geo_interface__))
   gm=transform(to_metric,geom)
   if not gm.intersects(circle):continue
   clipped=transform(from_metric,gm.intersection(circle))
   features.append({'type':'Feature','id':idx+1,'properties':{'record_index_1based':idx+1,'source_layer':stem,'source_attributes':attrs,'evidence_type':'source_contour_or_spot','field_verified':False,'derived_slope_pct':None},'geometry':mapping(clipped)})
  layer['selected']=len(features)
  if hs:layer.update(height_min=min(hs),height_max=max(hs))
  name=Path(stem).name
  fp=out/(name+'-school-2km.geojson');fp.write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
  layer['output']={'path':str(fp),'bytes':fp.stat().st_size,'sha256':hashlib.file_digest(fp.open('rb'),'sha256').hexdigest()}
  report['layers'].append(layer)
(out/'archive-inspection.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'layers':[(x['name'],x['records'],x['selected'],x['epsg']) for x in report['layers']]},ensure_ascii=False))
