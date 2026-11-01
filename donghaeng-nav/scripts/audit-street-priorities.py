import json,math,collections
from pathlib import Path
root=str(Path(__file__).resolve().parent.parent/'data/accessibility/seoul')+'/'
base=json.load(open(root+'seoul-base.json'))['features'];fac=json.load(open(root+'seoul-facilities.geojson'))['features'];district=json.load(open(root+'street-audit/districts-2013.json'))['features']
def xy(c):return c[0]*88000,c[1]*111000
def inside(c,ring):
 x,y=c;z=False;j=len(ring)-1
 for i in range(len(ring)):
  a,b=ring[i],ring[j];j=i
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:z=not z
 return z
def district_of(c):
 for f in district:
  g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
  if any(inside(c,p[0]) and not any(inside(c,h) for h in p[1:]) for p in polys):return f['properties']['name']
def index(points,size):
 out=collections.defaultdict(list)
 for c,data in points:
  x,y=xy(c);out[(int(x//size),int(y//size))].append((x,y,data))
 return out
def nearest(c,index,size,maxdist):
 x,y=xy(c);bx=int(x//size);by=int(y//size);best=(maxdist,None)
 for i in range(bx-1,bx+2):
  for j in range(by-1,by+2):
   for ax,ay,data in index.get((i,j),[]):
    dist=math.hypot(x-ax,y-ay)
    if dist<best[0]:best=(dist,data)
 return best
stations=[(f['c'],f['n']) for f in base if f['k']=='station'];si=index(stations,500)
benches=[]
for f in fac:
 p=f['properties'];c=p.get('display_coordinates') or (f['geometry']['coordinates'] if f['geometry']['type']=='Point' else None)
 if c and p['kind'] in ('bench','seating','apartment'):benches.append((c,p['id']))
bi=index(benches,150);cells={}
for f in base:
 if f['k']!='road' or f.get('h') not in ('residential','living_street','pedestrian','footway','tertiary','secondary','unclassified') or not f.get('n'):continue
 coords=f['c']
 for a,b in zip(coords,coords[1:]):
  ax,ay=xy(a);bx,by=xy(b);length=math.hypot(ax-bx,ay-by)
  for k in range(max(1,math.ceil(length/50))):
   t=(k+.5)/max(1,math.ceil(length/50));c=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
   ds,station=nearest(c,si,500,450)
   if ds<90 or ds>=450:continue
   db,_=nearest(c,bi,150,150)
   if db<75:continue
   x,y=xy(c);key=(int(x//100),int(y//100));score=abs(ds-180)-min(db,150)/5
   if key not in cells or score<cells[key][0]:cells[key]=(score,c,f['n'],station,ds,db)
by=collections.defaultdict(list)
for score,c,road,station,ds,db in cells.values():
 gu=district_of(c)
 if gu:by[gu].append((score,c,road,station,round(ds),round(db)))
out=[]
for gu in sorted(f['properties']['name'] for f in district):
 chosen=[]
 for item in sorted(by[gu]):
  if all(math.hypot((item[1][0]-q[1][0])*88000,(item[1][1]-q[1][1])*111000)>500 for q in chosen):chosen.append(item)
  if len(chosen)==3:break
 for rank,(score,c,road,station,ds,db) in enumerate(chosen,1):out.append({'district':gu,'rank':rank,'coordinates':c,'road':road,'station':station,'station_distance_m_straight':ds,'nearest_known_reference_m_at_least':db,'status':'unreviewed'})
print('candidate cells',len(cells),'districts',len(by),'samples',len(out));json.dump(out,open(root+'street-audit/generated-candidates.json','w'),ensure_ascii=False,indent=2)
for d in out:
 if d['rank']==1:print(d['district'],d['road'],d['station'],d['coordinates'])
