"""Offline geometric/topological candidates, not physical access validation."""
import json,math,pathlib,collections,sys
ROOT=pathlib.Path(__file__).resolve().parents[4]; OUT=pathlib.Path(__file__).parent
D=json.loads((ROOT/'donghaeng-nav/dist/map-data.json').read_text()); E=json.loads((OUT/'local-evidence.json').read_text()); by={(x['type'],x['id']):x for x in D['elements']}; N={i:x for (t,i),x in by.items() if t=='node'}; W={i:x for (t,i),x in by.items() if t=='way'}
R=6371000; LAT=37.595; defunct=None
def xy(p):return(p[0]*111195*math.cos(math.radians(LAT)),p[1]*111195)
def length(a,b):
 x,y=xy(a);u,v=xy(b);return math.hypot(x-u,y-v)
def inside(p,poly):
 x,y=p;c=False
 for a,b in zip(poly,poly[1:]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:c=not c
 return c
def cross(a,b,c,d):
 # strict interior intersections only, avoiding endpoint numerical noise
 ax,ay=xy(a);bx,by=xy(b);cx,cy=xy(c);dx,dy=xy(d);rx,ry=bx-ax,by-ay;sx,sy=dx-cx,dy-cy;den=rx*sy-ry*sx
 if abs(den)<1e-9:return None
 t=((cx-ax)*sy-(cy-ay)*sx)/den;u=((cx-ax)*ry-(cy-ay)*rx)/den
 if 1e-7<t<1-1e-7 and 1e-7<u<1-1e-7:return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
 return None
school=E['school']['ring'];routeSummary=[];F=[];allrouteways={r['osm_id'] for r in E['route_way_records']};accepted=[]
allowed={'footway','path','pedestrian','residential','living_street','service','steps','unclassified','tertiary','secondary','primary','track','cycleway'}
for w in W.values():
 t=w.get('tags',{});foot=t.get('foot');access=t.get('access')
 if t.get('highway') not in allowed or t.get('area')=='yes' or foot in ('no','private') or (access in ('no','private') and foot not in ('yes','designated','permissive')) or(t.get('highway')=='cycleway' and foot not in ('yes','designated','permissive')):continue
 accepted.append(w)
insideways=[]
for w in accepted:
 coords=[[N[n]['lon'],N[n]['lat']] for n in w['nodes'] if n in N]
 m=sum(length(a,b) for a,b in zip(coords,coords[1:]) if inside([(a[0]+b[0])/2,(a[1]+b[1])/2],school))
 if m>0:insideways.append({'way_id':w['id'],'midpoint_inside_length_m':m,'tags':w.get('tags',{})})
# Deduplicated graph: bridge/cut-edge is topological bottleneck, not narrow width.
adj=collections.defaultdict(set)
for w in accepted:
 for a,b in zip(w['nodes'],w['nodes'][1:]):
  if a in N and b in N:adj[a].add(b);adj[b].add(a)
sys.setrecursionlimit(100000);disc={};low={};bridges=set();clock=0
def dfs(v,p=None):
 global clock
 clock+=1;disc[v]=low[v]=clock
 for u in adj[v]:
  if u==p:continue
  if u not in disc:
   dfs(u,v);low[v]=min(low[v],low[u])
   if low[u]>disc[v]:bridges.add(tuple(sorted((u,v))))
  else:low[v]=min(low[v],disc[u])
for v in list(adj):
 if v not in disc:dfs(v)
intersections=[];seen=set()
for r in E['routes']:
 lengthBy=collections.defaultdict(float); transitions=[];bneck=[];prev=None
 for s in r['segments']:
  t=s['tags'];lengthBy['total']+=s['length_m']
  if t.get('tunnel'):lengthBy['tunnel']+=s['length_m']
  if t.get('bridge'):lengthBy['bridge']+=s['length_m']
  if t.get('highway') in ('primary','secondary','tertiary','residential','service','unclassified'):lengthBy['road_centerline']+=s['length_m']
  if inside([(s['coords'][0][0]+s['coords'][1][0])/2,(s['coords'][0][1]+s['coords'][1][1])/2],school):lengthBy['midpoint_inside_school']+=s['length_m']
  if prev and prev['way_id']!=s['way_id'] and prev['tags'].get('layer','0')!=t.get('layer','0'):transitions.append({'node_id':s['from_id'],'ll':[N[s['from_id']]['lat'],N[s['from_id']]['lon']],'from_way':prev['way_id'],'from_layer':prev['tags'].get('layer','0'),'to_way':s['way_id'],'to_layer':t.get('layer','0'),'along_route_m':s['start_m'],'note':'Shared endpoint layer transition may be normal portal/bridge end; not automatically an error.'})
  if tuple(sorted((s['from_id'],s['to_id']))) in bridges:bneck.append({'from':s['from_id'],'to':s['to_id'],'way_id':s['way_id'],'length_m':s['length_m']})
  prev=s
  for w in W.values():
   if w['id']==s['way_id']:continue
   for aa,bb in zip(w.get('nodes',[]),w.get('nodes',[])[1:]):
    if aa not in N or bb not in N or aa in(s['from_id'],s['to_id']) or bb in(s['from_id'],s['to_id']):continue
    a=[N[aa]['lon'],N[aa]['lat']];b=[N[bb]['lon'],N[bb]['lat']]
    if max(a[0],b[0])<min(x[0] for x in s['coords']) or min(a[0],b[0])>max(x[0] for x in s['coords']) or max(a[1],b[1])<min(x[1] for x in s['coords']) or min(a[1],b[1])>max(x[1] for x in s['coords']):continue
    p=cross(*s['coords'],a,b)
    if p:
     key=(s['way_id'],w['id'],round(p[0],7),round(p[1],7))
     if key in seen:continue
     seen.add(key);rec={'route_way':s['way_id'],'other_way':w['id'],'coordinates':p,'route_layer':t.get('layer','0'),'other_layer':w.get('tags',{}).get('layer','0'),'other_tags':w.get('tags',{}),'note':'Geometric crossing without shared endpoint. No connection asserted. Difference in layer often explains intentional separation.'};intersections.append(rec);F.append({'type':'Feature','geometry':{'type':'Point','coordinates':p},'properties':{'kind':'unconnected_geometric_crossing',**rec}})
 routeSummary.append({'route':r['name'],'length_by_class_m':dict(lengthBy),'layer_transitions':transitions,'topological_cut_edges':bneck,'snap_gaps_m':r['snap_gaps_m']})
unique={k:v for k,v in by.items()};counts=collections.Counter(x['type'] for x in D['elements']);uniqueCounts=collections.Counter(t for t,i in by)
summary={'input':E['input'],'routes':routeSummary,'accepted_ways_with_midpoints_inside_school':insideways,'unconnected_geometric_crossings':intersections,'raw_record_counts':dict(counts),'unique_object_counts':dict(uniqueCounts),'duplicate_records':len(D['elements'])-len(by),'note':'Planar approximate distances; midpoint polygon test is screening rather than exact clipping. No measured widths/elevation or current metadata.'}
(OUT/'topology.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');(OUT/'topology.geojson').write_text(json.dumps({'type':'FeatureCollection','features':F},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'routes':routeSummary,'school_inside_ways':len(insideways),'geometric_crossings':len(intersections),'unique_counts':dict(uniqueCounts)},ensure_ascii=False,indent=2))
