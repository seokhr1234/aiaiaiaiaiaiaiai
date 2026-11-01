"""Measure gaps in mapped bench data; straight-line proximity is not walking access."""
import argparse,json,math,collections
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--root',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
r=args.root/'data/accessibility/seoul';out=args.output;out.mkdir(parents=True,exist_ok=True)
fac=json.loads((r/'seoul-facilities.geojson').read_text())['features'];base=json.loads((r/'seoul-base.json').read_text())['features']
# A local equirectangular projection centred at 37.57 N. Distances are approximate.
SX=6371008.8*math.pi/180*math.cos(math.radians(37.57));SY=6371008.8*math.pi/180
xy=lambda c:(c[0]*SX,c[1]*SY)
idx=collections.defaultdict(list);bench_count=0;excluded=collections.Counter()
for f in fac:
 p=f['properties']
 if p.get('kind')!='bench':continue
 if p.get('context')=='urban_riverside_walkway':excluded['riverside_installation_points_not_street_benches']+=1;continue
 if p.get('access') in ('private','residents','customers','no'):excluded['restricted_benches']+=1;continue
 if f['geometry']['type']!='Point':excluded['nonpoint_benches']+=1;continue
 x,y=xy(f['geometry']['coordinates']);idx[(int(x//50),int(y//50))].append((x,y,p['id']));bench_count+=1

def nearest(c):
 x,y=xy(c);bx=int(x//50);by=int(y//50);best=(float('inf'),None)
 for i in range(bx-1,bx+2):
  for j in range(by-1,by+2):
   for a,b,id in idx.get((i,j),[]):
    d=math.hypot(x-a,y-b)
    if d<best[0]:best=(d,id)
 return best
allowed={'residential','living_street','pedestrian','tertiary','secondary','primary','unclassified'}
roads=collections.defaultdict(lambda:{'length_m':0.,'sampled_near_m':0.,'samples':0,'near_samples':0,'gaps':[]});total_samples=0
for f in base:
 if f['k']!='road' or f.get('h') not in allowed or not f.get('n'):continue
 row=roads[f['n']]
 for a,b in zip(f['c'],f['c'][1:]):
  ax,ay=xy(a);bx,by=xy(b);length=math.hypot(bx-ax,by-ay)
  if length==0:continue
  n=max(1,math.ceil(length/25));weight=length/n;row['length_m']+=length
  for k in range(n):
   t=(k+.5)/n;c=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];d,id=nearest(c);row['samples']+=1;total_samples+=1
   if d<=50:row['sampled_near_m']+=weight;row['near_samples']+=1
   elif len(row['gaps'])<20:row['gaps'].append(c)
queue=[]
for name,row in roads.items():
 l=row['length_m'];covered=row['sampled_near_m'];queue.append({'road':name,'mapped_road_length_m':round(l,1),'near_bench_sample_weighted_m':round(covered,1),'gap_sample_weighted_m':round(l-covered,1),'sample_weighted_near_percent':round(covered/l*100,2),'sample_count':row['samples'],'gap_sample_coordinates':row['gaps']})
queue.sort(key=lambda x:-x['gap_sample_weighted_m']);length=sum(x['length_m'] for x in roads.values());near=sum(x['sampled_near_m'] for x in roads.values())
summary={'bench_objects_used':bench_count,'excluded':dict(excluded),'road_names':len(roads),'sample_count':total_samples,'sample_spacing_max_m':25,'proximity_threshold_m':50,'mapped_road_length_km':round(length/1000,3),'sample_weighted_near_percent':round(near/length*100,3),'gap_sample_weighted_km':round((length-near)/1000,3),'coverage_satisfied':False,'metric':'Length-weighted samples within 50 m straight line of a mapped bench point; NOT a walking-distance or 50 m maximum interval guarantee.','limitations':['Named urban roads only; footway/path/steps/unnamed roads excluded. This is not all Seoul walkable roads.','Parallel OSM ways may represent both directions; lengths are OSM mapped geometry length, not deduplicated street lengths.','Unknown-access OSM benches included; current accessibility and existence are not verified.','Photo-estimated bench positions retain approximately 30 m uncertainty.','No data is not evidence of no actual bench.']}
(out/'coverage-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));(out/'road-gap-queue.json').write_text(json.dumps(queue,ensure_ascii=False,separators=(',',':')));print(json.dumps(summary,ensure_ascii=False,indent=2))
