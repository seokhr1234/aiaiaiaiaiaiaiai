"""Collect small public OSM batches through inherited proxy; cache and record provenance.
No token, login, proxy override, or alternate endpoint is used.
Default is dry run. Pass --fetch once policy permits selected hosts.
History is optional (--history); max 16 objects, sequential, cached.
"""
import argparse,datetime,hashlib,json,pathlib,time,urllib.request,urllib.parse,urllib.error
P=pathlib.Path(__file__).parent;root=P.parents[3];cache=pathlib.Path('/workspace/research-downloads/crosscheck');cache.mkdir(parents=True,exist_ok=True)
p=argparse.ArgumentParser();p.add_argument('--fetch',action='store_true');p.add_argument('--history',action='store_true');p.add_argument('--overpass',action='store_true');p.add_argument('--photos',action='store_true');a=p.parse_args();e=json.loads((P/'local-evidence.json').read_text());ids=[x['osm_id'] for x in e['route_way_records']]
query='''[out:json][timeout:40];(nwr[barrier](37.592,127.035,37.600,127.044);nwr[kerb](37.592,127.035,37.600,127.044);nwr[entrance](37.592,127.035,37.600,127.044);nwr[crossing](37.592,127.035,37.600,127.044);node[highway=crossing](37.592,127.035,37.600,127.044);node[highway=elevator](37.592,127.035,37.600,127.044););out meta center;>;out meta qt;'''
(P/'independent-features.overpassql').write_text(query+'\n')
jobs=[('ways-current','https://api.openstreetmap.org/api/0.6/ways.json?ways='+','.join(map(str,ids)),None),('bench-current','https://api.openstreetmap.org/api/0.6/node/12464206320.json',None)]
if a.history:jobs += [(f'way-{i}-history',f'https://api.openstreetmap.org/api/0.6/way/{i}/history.json',None) for i in ids]+[('bench-history','https://api.openstreetmap.org/api/0.6/node/12464206320/history.json',None)]
# Parent relations for route nodes/ways require separate inspection; one route source way at a time is optional future work.
if a.overpass:
 jobs += [('independent-access-features','https://overpass-api.de/api/interpreter',urllib.parse.urlencode({'data':query}).encode())]
 relation_query='[out:json][timeout:30];way(id:'+','.join(map(str,ids))+')->.route;rel(bw.route);out meta;'
 (P/'route-parent-relations.overpassql').write_text(relation_query+'\n')
 jobs += [('route-parent-relations','https://overpass-api.de/api/interpreter',urllib.parse.urlencode({'data':relation_query}).encode())]
if a.photos:jobs += [('kartaview-near-school','https://api.openstreetcam.org/2.0/photo/?'+urllib.parse.urlencode({'lat':37.5950991,'lng':127.038992,'radius':500,'zoomLevel':18,'join':'sequence','itemsPerPage':20,'page':1}),None)]
logs=[]
for name,url,body in jobs:
 rec={'name':name,'url':url,'method':'POST' if body else 'GET','requested_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'license':'ODbL 1.0' if 'openstreetmap' in url or 'overpass' in url else 'provider terms: inspect before reuse','cache_path':str(cache/(name+'.json')),'query_sha256':hashlib.sha256(body).hexdigest() if body else None}
 dest=cache/(name+'.json')
 if dest.exists():
  data=dest.read_bytes();rec.update(status='cache_hit',bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
 elif not a.fetch:rec['status']='not_requested_dry_run'
 else:
  try:
   req=urllib.request.Request(url,data=body,headers={'User-Agent':'DonghaengAccessibilityResearch/1.0 (small noncommercial local study)','Accept':'application/json'})
   with urllib.request.urlopen(req,timeout=50) as r:data=r.read(20000000);rec.update(http_status=r.status,content_type=r.headers.get('Content-Type'))
   parsed=json.loads(data)
   if 'overpass' in url and 'remark' in parsed:raise ValueError('Overpass remark: '+parsed['remark'])
   dest.write_bytes(data);rec.update(status='acquired',bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),acquired_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
  except Exception as exc:rec.update(status='failed',error=type(exc).__name__+': '+str(exc),bytes=None,sha256=None)
  time.sleep(1)
 logs.append(rec)
 if rec.get('status')=='failed' and ('403' in rec.get('error','') or 'Operation not permitted' in rec.get('error','')):
  rec['stop_reason']='Policy or permission denial; no bypass/retry. Remaining jobs not attempted.';break
logfile=P/'collection-run.json';logfile.write_text(json.dumps(logs,ensure_ascii=False,indent=2)+'\n');print(json.dumps(logs,ensure_ascii=False,indent=2))
