import json,math,collections,pathlib
r=pathlib.Path(__file__).resolve().parent.parent/'data/accessibility/seoul';f=json.loads((r/'seoul-facilities.geojson').read_text())['features'];idx=collections.defaultdict(list)
for a in f:
 p=a['properties'];g=a['geometry']
 if p['kind'] not in ('bench','seating','shelter') or g['type']!='Point' or p.get('access') in ('no','private','customers','residents'):continue
 lon,lat=g['coordinates'];x,y=lon*88000,lat*111000;idx[int(x//50),int(y//50)].append((x,y))
gaps=[];samples=0;roads=0;seen=set()
for f in json.loads((r/'seoul-base.json').read_text())['features']:
 if f.get('k')!='road' or f.get('h') not in ('residential','living_street','pedestrian','tertiary','unclassified','footway') or len(f['c'])<2:continue
 roads+=1
 for a,b in zip(f['c'],f['c'][1:]):
  length=math.hypot((b[0]-a[0])*88000,(b[1]-a[1])*111000);n=max(1,math.ceil(length/25))
  for i in range(n):
   t=(i+.5)/n;lon=a[0]+t*(b[0]-a[0]);lat=a[1]+t*(b[1]-a[1]);x,y=lon*88000,lat*111000;key=int(x//50),int(y//50);samples+=1
   if not any((x-xx)**2+(y-yy)**2<=2500 for dx in (-1,0,1) for dy in (-1,0,1) for xx,yy in idx.get((key[0]+dx,key[1]+dy),[])) and key not in seen:
    seen.add(key);gaps.append({'lon':round(lon,7),'lat':round(lat,7),'road':f.get('n',''),'road_type':f['h']})
out={'road_features':roads,'samples_25m':samples,'unique_gap_grid_cells':len(gaps),'method':'Approximate 50 m straight-line proximity; not walking distance; private and customer-only markers excluded; unknown access, seasonal shelters and approximate site positions retained; only mapped roads and point features.','locations':gaps};path=r/'walk-gap-audit/seoul-walk-gap-samples.json';path.parent.mkdir(exist_ok=True);path.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')));print(roads,samples,len(gaps),flush=True)
