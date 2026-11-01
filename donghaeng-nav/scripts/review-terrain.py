"""Independent source comparison. Requires the GIS review environment, never used by the web server.
All new elevation sources are comparison-only until road surface, datum and local accuracy are verified.
"""
from pathlib import Path
import json,math,hashlib,csv,subprocess,importlib.util,zipfile,re,collections,sys
import numpy as np
import geopandas as gpd
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer,Geod
from pyproj.transformer import TransformerGroup
from scipy.spatial import cKDTree,Delaunay
from shapely.geometry import Point,LineString,Polygon,box,mapping
from shapely.strtree import STRtree
from shapely import transform as geom_transform
ROOT=Path(__file__).resolve().parent.parent
R=ROOT/'data/terrain/research';OUT=ROOT/'data/terrain/review';OUT.mkdir(parents=True,exist_ok=True)
baseline=json.loads((ROOT/'dist/terrain-data.json').read_text())['edges']
POLICY={'version':'2026-10-31-v1','comparison_window_m':100,'minimum_distinct_copernicus_cells':3,'difference_warning_pp':2,'difference_conflict_pp':5,'spot_comparison_radius_m':100,'new_source_promotion':False,'note':'Screening thresholds are conservative review policy, not accuracy or confidence bounds. No source is ground truth.'}
G=Geod(ellps='WGS84');T=Transformer.from_crs(4326,32652,always_xy=True)
def h(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def q(a):
 a=np.asarray([x for x in a if x is not None and np.isfinite(x)],float)
 return {'count':len(a),'min':float(a.min()),'median':float(np.median(a)),'p90':float(np.percentile(a,90)),'max':float(a.max())} if len(a) else {'count':0}
def scalar(x):return round(float(x),5) if x is not None and np.isfinite(x) else None
def structure(tags):
 if tags.get('bridge') not in (None,'no'):return 'bridge'
 if tags.get('tunnel') not in (None,'no'):return 'tunnel'
 if str(tags.get('layer','0'))!='0':return 'non_surface_layer'
 if tags.get('location') not in (None,'surface','outdoor','overground'):return 'non_surface_location'
 if tags.get('indoor') not in (None,'no'):return 'indoor'
 if tags.get('level') not in (None,'0','0;0'):return 'non_ground_level'
 if tags.get('covered') not in (None,'no'):return 'covered_surface_unverified'
 if re.search('지하보도|지하차도|육교|고가',tags.get('name','')):return 'structure_name_unverified'
 if tags.get('highway')=='steps':return 'stairs_not_continuous_surface'
 return None

node_script="const E=require('./dist/engine.js'),d=require('./dist/map-data.json'),g=E.createGraph(d);console.log(JSON.stringify({nodes:Object.fromEntries([...g.nodes].map(([id,n])=>[id,{ll:n.ll,tags:n.tags||{}}])),ways:g.ways.map(w=>({id:w.id,nodes:w.nodes,tags:w.tags||{}}))}));"
net=json.loads(subprocess.check_output(['node','-e',node_script],cwd=ROOT,text=True));N=net['nodes'];ways=net['ways']
read=lambda p:json.loads(Path(p).read_text())
spots=gpd.read_file(R/'derived/seoul_spot_heights.geojson');contours=gpd.read_file(R/'derived/seoul_contours.geojson');spots_m=spots.to_crs(32652);contours_m=contours.to_crs(32652)
xy=np.array([[p.x,p.y] for p in spots_m.geometry]);heights=np.asarray(spots.HEIGHT,float);spot_tree=cKDTree(xy);nn=spot_tree.query(xy,k=2)[0][:,1];tri=Delaunay(xy);contour_tree=STRtree(contours_m.geometry.values)
source_checks={};raw_hashes={}
for p in sorted((R/'raw').iterdir()):raw_hashes[str(p.relative_to(ROOT))]=h(p)
with zipfile.ZipFile(R/'raw/seoul-2.zip') as z:
 prjs=[n for n in z.namelist() if n.endswith('.prj')];xmls=[n for n in z.namelist() if n.endswith('.xml')];source_checks['seoul_prj_text']={n:z.read(n).decode(errors='replace') for n in prjs};source_checks['seoul_metadata_dates']={n:sorted(set(re.findall(r'20\d{6}',z.read(n).decode(errors='replace')))) for n in xmls}
raw_spot_path='/vsizip/'+str((R/'raw/seoul-2.zip').resolve())+'/표고 5000/N3P_F002.shp';inverse=Transformer.from_crs(4326,5174,always_xy=True);bbox=read(R/'derived/validation.json')['bbox_wgs84'];corners=[inverse.transform(x,y) for x,y in [(bbox[0],bbox[1]),(bbox[0],bbox[3]),(bbox[2],bbox[1]),(bbox[2],bbox[3])]];bounds=(min(p[0] for p in corners),min(p[1] for p in corners),max(p[0] for p in corners),max(p[1] for p in corners));raw_spots=gpd.read_file(raw_spot_path,bbox=bounds);source_checks['seoul_raw_horizontal_crs']=raw_spots.crs.to_string();raw_wgs=raw_spots.to_crs(4326);lookup={r.UFID:r for _,r in raw_wgs.iterrows()};deltas=[];field_mismatches=[]
for _,r in spots.iterrows():
 original=lookup.get(r.UFID)
 if original is None:field_mismatches.append(str(r.UFID));continue
 deltas.append(G.inv(r.geometry.x,r.geometry.y,original.geometry.x,original.geometry.y)[2])
 if not math.isclose(float(r.HEIGHT),float(original.HEIGHT),abs_tol=1e-7):field_mismatches.append(str(r.UFID))
source_checks['seoul_derived_vs_raw']={'matched':len(deltas),'missing_or_height_changed':len(field_mismatches),'position_difference_m':q(deltas),'local_control_point_accuracy_verified':False,'vertical_datum':'unconfirmed','surface_class':'unconfirmed'}
old_path='/vsizip/'+str((R/'raw/seoul-1.zip').resolve())+'/표고 5000/N3P_F002.shp';old_spots=gpd.read_file(old_path,bbox=bounds).to_crs(4326);old_spots=old_spots[old_spots.geometry.intersects(box(*bbox))];old_lookup={row.UFID:row for _,row in old_spots.iterrows()};historical=[]
for _,row in spots.iterrows():
 old=old_lookup.get(row.UFID)
 if old is not None:historical.append(float(row.HEIGHT)-float(old.HEIGHT))
source_checks['seoul_2023_archive_comparison']={'points_in_research_bbox':len(old_spots),'shared_ufids':len(historical),'height_difference_2025_provided_minus_2023_provided_m':q(historical),'note':'Publication/copy dates are not observation dates or proof of improved accuracy.'}
raw_contours=gpd.read_file('/vsizip/'+str((R/'raw/seoul-2.zip').resolve())+'/등고선 5000/N3L_F001.shp',bbox=bounds);contour_heights={row.UFID:float(row.HEIGHT) for _,row in raw_contours.iterrows()};source_checks['seoul_contours_derived_vs_raw']={'derived_count':len(contours),'matching_height_count':sum(row.UFID in contour_heights and math.isclose(float(row.HEIGHT),contour_heights[row.UFID],abs_tol=1e-7) for _,row in contours.iterrows()),'vertical_datum':'unconfirmed','road_surface_verified':False}
group=TransformerGroup(5174,4326,always_xy=True);source_checks['seoul_horizontal_transform']={'best_available':group.best_available,'operations':[{'description':t.description,'declared_operation_accuracy_m':t.accuracy} for t in group.transformers],'note':'Operation metadata is not a local control-point validation.'}
cop=rasterio.open(R/'derived/wolgok_copernicus_glo30_dsm.tif');raster=cop.read(1).astype(float);inv=~cop.transform
with rasterio.open(R/'raw/Copernicus_DSM_COG_10_N37_00_E127_00_DEM.tif') as original:
 window=from_bounds(*cop.bounds,transform=original.transform).round_offsets().round_lengths();array=original.read(1,window=window);source_checks['copernicus_crop']={'crs':str(cop.crs),'shape':list(cop.shape),'transform':list(cop.transform)[:6],'pixel_values_equal_original':array.shape==raster.shape and bool(np.array_equal(array,raster)),'affine_equal_to_original_window':bool(np.allclose(list(original.window_transform(window)),list(cop.transform),atol=1e-10,rtol=0)),'raw_area_or_point':original.tags().get('AREA_OR_POINT'),'derived_area_or_point':cop.tags().get('AREA_OR_POINT'),'vertical_datum':'EGM2008 per product specification; not a verified road datum','surface_class':'DSM includes buildings/infrastructure/vegetation','height_units':'m'}
if not source_checks['copernicus_crop']['pixel_values_equal_original'] or not source_checks['copernicus_crop']['affine_equal_to_original_window']:raise ValueError('Crop differs from original grid')
lat=37.60192;cell_x=G.inv(127.04,lat,127.04+cop.res[0],lat)[2];cell_y=G.inv(127.04,lat,127.04,lat+cop.res[1])[2];source_checks['copernicus_cell_m']={'east_west':cell_x,'north_south':cell_y,'sample_spacing_not_accuracy':True}
def cop_height(ll):
 col,row=inv*(ll[1],ll[0]);x,y=col-.5,row-.5;i,j=math.floor(x),math.floor(y)
 if i<0 or j<0 or i+1>=cop.width or j+1>=cop.height:return None
 v=raster[j:j+2,i:i+2]
 if not np.isfinite(v).all() or (v<=-1000).any():return None
 dx,dy=x-i,y-j;return float(v[0,0]*(1-dx)*(1-dy)+v[0,1]*dx*(1-dy)+v[1,0]*(1-dx)*dy+v[1,1]*dx*dy)
def cell(ll):return tuple(int(math.floor(v)) for v in inv*(ll[1],ll[0]))
spec=importlib.util.spec_from_file_location('legacy_terrain',ROOT/'scripts/prepare-terrain.py');legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
def seoul_height(ll):
 p=np.asarray(T.transform(ll[1],ll[0]));simplex=int(tri.find_simplex(p));near,ids=spot_tree.query(p,k=3);info={'nearest_m':scalar(near[0]),'points_within_50m':len(spot_tree.query_ball_point(p,50)),'points_within_100m':len(spot_tree.query_ball_point(p,100))}
 if simplex<0:return None,info
 vertices=tri.simplices[simplex];distance=np.linalg.norm(xy[vertices]-p,axis=1)
 if distance.max()>POLICY['spot_comparison_radius_m']:return None,info
 transform=tri.transform[simplex];bary=transform[:2].dot(p-transform[2]);bary=np.r_[bary,1-bary.sum()];value=float(heights[vertices].dot(bary));info.update({'support_ufids':[str(spots.iloc[v].UFID) for v in vertices],'maximum_support_distance_m':scalar(distance.max())});return value,info

roads=[];road_ways=[];building_polygons=[];context=read(ROOT/'dist/map-context.json');context_nodes={e['id']:(e['lon'],e['lat']) for e in context['elements'] if e['type']=='node'}
for e in context['elements']:
 if e['type']=='way' and e.get('tags',{}).get('building') not in (None,'no'):
  ll=[context_nodes[n] for n in e.get('nodes',[]) if n in context_nodes]
  if len(ll)>=4 and ll[0]==ll[-1]:
   p=Polygon(ll)
   if p.is_valid and not p.is_empty:building_polygons.append(geom_transform(p,T.transform,interleaved=False))
building_tree=STRtree(building_polygons) if building_polygons else None
for w in ways:
 ll=[N[str(n)]['ll'] for n in w['nodes'] if str(n) in N]
 if len(ll)==len(w['nodes']) and len(ll)>=2:roads.append(LineString([T.transform(p[1],p[0]) for p in ll]));road_ways.append(w)
road_tree=STRtree(roads);pairs,road_dist=road_tree.query_nearest(spots_m.geometry.values,return_distance=True,all_matches=False);spot_nearest_road=np.full(len(spots),np.nan);spot_nearest_road[pairs[0]]=road_dist
building_hits=set(building_tree.query(spots_m.geometry.values,predicate='intersects')[0].tolist()) if building_tree else set()
for i,r in spots.iterrows():
 if legacy.elevation([r.geometry.y,r.geometry.x]) is None:continue
bboxpoly=Polygon([(bbox[0],bbox[1]),(bbox[2],bbox[1]),(bbox[2],bbox[3]),(bbox[0],bbox[3])]);area_km2=abs(G.geometry_area_perimeter(bboxpoly)[0])/1e6
spot_differences=[]
for i,r in spots.iterrows():
 ll=[r.geometry.y,r.geometry.x];a=legacy.elevation(ll);b=cop_height(ll);spot_differences.append({'ufid':str(r.UFID),'coordinate':[r.geometry.x,r.geometry.y],'height_m':float(r.HEIGHT),'nearest_road_m':scalar(spot_nearest_road[i]),'inside_mapped_building':i in building_hits,'seoul_minus_tilezen_m':scalar(float(r.HEIGHT)-a) if a is not None else None,'seoul_minus_copernicus_m':scalar(float(r.HEIGHT)-b) if b is not None else None})

records={};detailed=[];structure_counts=collections.Counter();nearest=[]
for wi,w in enumerate(road_ways):
 ids=w['nodes'];ll=[N[str(n)]['ll'] for n in ids];line=roads[wi];reason=structure(w['tags']);cumulative=[0.]
 for a,b in zip(ll,ll[1:]):cumulative.append(cumulative[-1]+G.inv(a[1],a[0],b[1],b[0])[2])
 def along(d):
  i=min(max(int(np.searchsorted(cumulative,d,side='right'))-1,0),len(ll)-2);length=cumulative[i+1]-cumulative[i];f=(d-cumulative[i])/length if length else 0;return [ll[i][j]+(ll[i+1][j]-ll[i][j])*f for j in [0,1]]
 for i,(a,b) in enumerate(zip(ids,ids[1:])):
  key='-'.join(sorted([str(a),str(b)]));mid=(cumulative[i]+cumulative[i+1])/2;edge_reason=reason
  if not edge_reason:
   for node in [N[str(a)],N[str(b)]]:
    t=node['tags']
    if t.get('location') not in (None,'surface','outdoor','overground') or t.get('level') not in (None,'0') or t.get('indoor') not in (None,'no'):edge_reason='node_surface_unverified'
  item={'key':key,'way_id':w['id'],'from':a,'to':b,'name':w['tags'].get('name','이름 없는 보행로'),'edge_length_m':scalar(cumulative[i+1]-cumulative[i]),'status':'legacy_hint' if key in baseline else 'unconfirmed','reasons':[],'sources':{},'window':None,'improvement_evidence':False}
  middle=along(mid);item['within_research_bbox']=bool(bbox[0]<=middle[1]<=bbox[2] and bbox[1]<=middle[0]<=bbox[3]);item['legacy_support_m']=scalar(min(cumulative[-1],mid+30)-max(0,mid-30));near=spot_tree.query(T.transform(middle[1],middle[0]),k=1)[0];nearest.append(near);item['spot_nearest_midpoint_m']=scalar(near)
  if edge_reason:item['status']='terrain_inapplicable';item['reasons']=[edge_reason];structure_counts[edge_reason]+=1
  elif cumulative[-1]<POLICY['comparison_window_m']:item['reasons']=['comparison_support_too_short','seoul_vertical_datum_unconfirmed','road_surface_unverified']
  else:
   start=max(0,min(mid-50,cumulative[-1]-100));end=start+100;A,B=along(start),along(end);item['window']={'length_m':100,'start_lonlat':[A[1],A[0]],'end_lonlat':[B[1],B[0]],'measured_along_horizontal_road':True}
   sample_points=[along(d) for d in np.linspace(start,end,11)];unique_cells=len(set(cell(p) for p in sample_points));ta,tb=legacy.elevation(A),legacy.elevation(B);ca,cb=cop_height(A),cop_height(B);sa,si=seoul_height(A);sb,sj=seoul_height(B)
   def profile(a,b,source):return {'source':source,'start_height_m':scalar(a),'end_height_m':scalar(b),'signed_grade_percent':scalar((b-a)/100*100) if a is not None and b is not None else None,'used_for_routing':False,'road_surface_verified':False}
   item['sources']['tilezen']=profile(ta,tb,'legacy_ground_terrain_estimate');item['sources']['copernicus']=profile(ca,cb,'DSM_comparison_only');item['sources']['copernicus']['distinct_native_cells']=unique_cells
   if unique_cells<3:item['sources']['copernicus']['signed_grade_percent']=None;item['reasons'].append('insufficient_native_cells')
   item['sources']['seoul_spots']=profile(sa,sb,'linear_point_surface_comparison_only');item['sources']['seoul_spots'].update({'start_support':si,'end_support':sj,'vertical_datum':'unconfirmed'})
   curve=LineString([T.transform(p[1],p[0]) for p in sample_points]);crossings=[]
   for ci in contour_tree.query(curve,predicate='intersects'):
    intersection=curve.intersection(contours_m.geometry.iloc[ci]);pts=[intersection] if intersection.geom_type=='Point' else list(intersection.geoms) if intersection.geom_type=='MultiPoint' else []
    for p in pts:crossings.append((curve.project(p),float(contours.iloc[ci].HEIGHT),str(contours.iloc[ci].UFID)))
   item['sources']['seoul_contours']={'crossings':len(crossings),'crossing_heights_m':sorted(set(v[1] for v in crossings)),'signed_grade_percent':None,'used_for_routing':False,'reason':'Contours are not road surface heights; vertical datum and along-road support unverified'}
   item['reasons']+=['seoul_vertical_datum_unconfirmed','road_surface_unverified','DSM_building_tree_effect_unverified','source_epochs_differ']
   hitsA=building_tree.query(Point(T.transform(A[1],A[0])),predicate='intersects') if building_tree else [];hitsB=building_tree.query(Point(T.transform(B[1],B[0])),predicate='intersects') if building_tree else [];item['mapped_building_at_window_endpoint']=bool(len(hitsA) or len(hitsB))
   tg=item['sources']['tilezen']['signed_grade_percent'];cg=item['sources']['copernicus']['signed_grade_percent']
   if tg is not None and cg is not None:
    item['grade_difference_pp']=scalar(abs(tg-cg))
    if abs(tg-cg)>=POLICY['difference_conflict_pp']:item['status']='source_disagreement';item['reasons'].append('large_cross_source_grade_difference')
    elif abs(tg-cg)>=POLICY['difference_warning_pp']:item['reasons'].append('cross_source_grade_difference_notice')
   if not any(v.get('signed_grade_percent') is not None for v in item['sources'].values()):item['reasons'].append('comparison_not_supported')
  # If duplicate geometry has incompatible structural metadata, never select the convenient version.
  if key in records:
   old=records[key]
   if old['status']=='terrain_inapplicable':continue
   if item['status']!='terrain_inapplicable':
    if old['status']=='source_disagreement':continue
    if item['status']!='source_disagreement' and old.get('window'):continue
  records[key]=item

items=list(records.values());full=read(ROOT/'dist/map-data.json');tagged=collections.Counter(str(w.get('tags',{}).get('incline')) for w in full['elements'] if w.get('tags',{}).get('incline') is not None)
summary={'policy':POLICY,'inputs':{'review_script_sha256':h(Path(__file__)),'map_data_sha256':h(ROOT/'dist/map-data.json'),'map_context_sha256':h(ROOT/'dist/map-context.json'),'files':{**{str(p.relative_to(ROOT)):h(p) for p in sorted((ROOT/'data/terrain/tiles').rglob('*.png'))},'data/terrain/research/README.md':h(R/'README.md'),'data/terrain/research/sources.csv':h(R/'sources.csv'),'scripts/prepare-terrain.py':h(ROOT/'scripts/prepare-terrain.py'),'scripts/terrain-review-policy.py':h(ROOT/'scripts/terrain-review-policy.py'),'dist/engine.js':h(ROOT/'dist/engine.js'),**raw_hashes,**{str(p.relative_to(ROOT)):h(p) for p in sorted((R/'derived').iterdir())},'data/terrain/tile-audit.json':h(ROOT/'data/terrain/tile-audit.json')}},'source_checks':source_checks,'spot_density':{'count':len(spots),'within_existing_terrain_bbox':int(sum(127.020<=p.x<=127.058 and 37.580<=p.y<=37.611 for p in spots.geometry)),'bbox_area_km2':area_km2,'points_per_km2':len(spots)/area_km2,'nearest_neighbor_m':q(nn),'spot_to_nearest_runtime_road_m':q(spot_nearest_road),'spots_within_5m_of_road':int((spot_nearest_road<=5).sum()),'spots_within_10m_of_road':int((spot_nearest_road<=10).sum()),'spots_inside_mapped_buildings':len(building_hits),'building_map_complete':False},'roads':{'runtime_ways':len(ways),'unique_edges':len(items),'edge_midpoint_nearest_spot_m':q(nearest),'status_counts':dict(collections.Counter(i['status'] for i in items)),'structure_reasons':dict(structure_counts),'incline_tag_values':dict(tagged),'new_sources_promoted':0,'inside_research_bbox_edges':sum(i['within_research_bbox'] for i in items),'reason_no_promotion':['Seoul vertical datum, point accuracy and road-surface identity unconfirmed','Copernicus is DSM, no independent local road validation','Cross-source agreement cannot prove road truth']},'comparison':{'tilezen_copernicus_grade_difference_pp':q([i.get('grade_difference_pp') for i in items]),'seoul_tilezen_collocated_height_difference_m':q([i['seoul_minus_tilezen_m'] for i in spot_differences]),'seoul_copernicus_collocated_height_difference_m':q([i['seoul_minus_copernicus_m'] for i in spot_differences]),'threshold_sensitivity':{str(t):sum((i.get('grade_difference_pp') or 0)>=t for i in items) for t in [2,3,5,8]},'note':'Differences are not accuracy errors; no vertical datum correction or truth source selected.'},'attributions':{'seoul':'서울특별시 · 원천 국토지리정보원 수치지형도 · 공공누리 제1유형','copernicus':'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved','tilezen':'Mapzen/Tilezen; SRTM/GMTED2010 terrain data courtesy of the U.S. Geological Survey'}}
summary['source_decisions']={'seoul_spots':{'mode':'comparison_only','promoted':0},'seoul_contours':{'mode':'comparison_only','promoted':0},'copernicus':{'mode':'comparison_only','promoted':0},'tilezen':{'mode':'existing_low_confidence_hint_except_conflicts_and_structures','native_resolution_confirmed':False}}
(OUT/'validation-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');(OUT/'spot-comparison.json').write_text(json.dumps(spot_differences,ensure_ascii=False,separators=(',',':'))+'\n');(OUT/'road-review.json').write_text(json.dumps(items,ensure_ascii=False,separators=(',',':'))+'\n')
features=[{'type':'Feature','properties':i,'geometry':{'type':'LineString','coordinates':[[N[str(i['from'])]['ll'][1],N[str(i['from'])]['ll'][0]],[N[str(i['to'])]['ll'][1],N[str(i['to'])]['ll'][0]]]}} for i in items if i['status']!='legacy_hint' or 'cross_source_grade_difference_notice' in i['reasons']]
(OUT/'needs-validation.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},ensure_ascii=False,separators=(',',':'))+'\n')
with (OUT/'road-review.csv').open('w',encoding='utf-8-sig',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['key','way_id','name','edge_length_m','status','spot_nearest_midpoint_m','grade_difference_pp','reasons']);writer.writeheader()
 for i in items:writer.writerow({k:' | '.join(i[k]) if k=='reasons' else i.get(k) for k in writer.fieldnames})
compact={'version':1,'policy':POLICY,'inputs':summary['inputs'],'summary':summary['roads'],'source_decisions':summary['source_decisions'],'attributions':summary['attributions'],'edges':{i['key']:{'status':i['status'],'reasons':i['reasons'],'way_id':i['way_id'],'from':i['from'],'to':i['to'],'difference_pp':i.get('grade_difference_pp'),'support_m':i['window']['length_m'] if i['window'] else None,'legacy_support_m':i['legacy_support_m'],'signed_grades':{k:v.get('signed_grade_percent') for k,v in i['sources'].items()}} for i in items}}
(OUT/'edge-quality.json').write_text(json.dumps(compact,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'spot_density':summary['spot_density'],'roads':summary['roads'],'comparison':summary['comparison'],'crop_checks':source_checks['copernicus_crop']},ensure_ascii=False,indent=2))
