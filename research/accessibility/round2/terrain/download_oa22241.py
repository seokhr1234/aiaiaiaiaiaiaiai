#!/usr/bin/env python3
"""Download a public OA-22241 candidate URL after network policy permits it.
The request parameters were found in a third-party public acquisition script;
validate the returned archive independently. No credential, login, proxy bypass.
"""
import urllib.request,urllib.parse,datetime,hashlib,json,zipfile,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('output_dir');a=p.parse_args()
out=Path(a.output_dir);out.mkdir(parents=True,exist_ok=True)
u='https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false'
body=urllib.parse.urlencode({'infId':'OA-22241','seq':'2','infSeq':'1'}).encode()
r=urllib.request.Request(u,data=body,headers={'User-Agent':'DonghaengAccessibilityResearch/1.0','Content-Type':'application/x-www-form-urlencoded'})
f=out/'oa22241-seq2.zip';tmp=f.with_suffix('.download')
if f.exists(): raise SystemExit('Existing source preserved; choose a different output directory.')
with urllib.request.urlopen(r,timeout=60) as response,tmp.open('wb') as target:
 headers={k:v for k,v in response.headers.items() if k.lower() in ('content-type','content-length','last-modified','etag','content-disposition')}
 while True:
  b=response.read(1024*1024)
  if not b:break
  target.write(b)
if not zipfile.is_zipfile(tmp):raise SystemExit('Response is not ZIP; inspect it without claiming acquisition.')
with zipfile.ZipFile(tmp) as z:
 if z.testzip():raise SystemExit('ZIP CRC failure')
tmp.replace(f)
sha=hashlib.file_digest(f.open('rb'),'sha256').hexdigest()
m={'source_url':u,'method':'POST','form':body.decode(),'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':str(f),'bytes':f.stat().st_size,'sha256':sha,'response_headers':headers,'license':'KOGL type 1 according to OA-22241 metadata','source_date':'2023 per dataset description; per-feature survey date unknown','coordinate_reference_system':'pending PRJ inspection','vertical_datum':None,'unit':'pending field and metadata inspection','third_party_reference_sha256':'4fbe3c7e061b5974e7403ec116855304ed8ae321eebcc0d12c31ca8fb7be30bf','matches_third_party_reference':sha=='4fbe3c7e061b5974e7403ec116855304ed8ae321eebcc0d12c31ca8fb7be30bf'}
(out/'download-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print(json.dumps(m,ensure_ascii=False,indent=2))
