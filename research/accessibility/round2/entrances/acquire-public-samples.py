#!/usr/bin/env python3
"""Collect documented public five-row samples through inherited proxy/CA settings.
No login, API-key acquisition, policy changes, or alternate proxy routes.
Run only when the runtime allows openapi.seoul.go.kr; errors are not facility states.
"""
import argparse, datetime, hashlib, json, pathlib, urllib.request
SERVICES = {
 'TbSubwayLineDetail': 'OA-22122',
 'tbTraficElvtr': 'OA-21212',
 'tbTraficEntrcLft': 'OA-21211',
 'getFcElvtr': 'OA-22725',
 'getWksnElvtr': 'OA-22740',
 'getWksnEsctr': 'OA-22742',
 'SmrtScnFcltsInfo': 'OA-12514',
 'getInCstrnStts': 'OA-22751',
}
p=argparse.ArgumentParser()
p.add_argument('--output',type=pathlib.Path,default=pathlib.Path('/workspace/research-downloads/entrances'))
p.add_argument('--dry-run',action='store_true')
a=p.parse_args()
logs=[]
for name,dataset in SERVICES.items():
 url=f'http://openapi.seoul.go.kr:8088/sample/json/{name}/1/5/'
 rec={'dataset_id':dataset,'url':url,'method':'GET','credential':'official_public_sample_literal','requested_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if a.dry_run:
  print(json.dumps(rec,ensure_ascii=False)); continue
 try:
  request=urllib.request.Request(url,headers={'User-Agent':'Donghaeng-accessibility-research/1.0'})
  with urllib.request.urlopen(request,timeout=15) as response:
   rec['http_status']=response.status; rec['final_url']=response.url;rec['content_type']=response.headers.get('content-type')
   data=response.read(10*1024*1024+1)
   if len(data)>10*1024*1024: raise ValueError('Response exceeds 10 MiB bound')
  rec.update(bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
  try:
   payload=json.loads(data); service=payload.get(name,{})
   rec['result']=service.get('RESULT',payload.get('RESULT'))
   rec['rows']=len(service.get('row',[]))
   rec['total_count']=service.get('list_total_count')
   rec['facility_status_verified']=False
  except (ValueError,AttributeError): rec['parse_status']='not_expected_json'
  a.output.mkdir(parents=True,exist_ok=True)
  target=a.output/(name+'.response');target.write_bytes(data);rec['local_path']=str(target)
 except Exception as e:
  rec['error_type']=type(e).__name__;rec['error']=str(e);rec['facility_status_verified']=False
 logs.append(rec)
if not a.dry_run:
 a.output.mkdir(parents=True,exist_ok=True)
 (a.output/'sample-acquisition-log.json').write_text(json.dumps(logs,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(logs,ensure_ascii=False,indent=2))
