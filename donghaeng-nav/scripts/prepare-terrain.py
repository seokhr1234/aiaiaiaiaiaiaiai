"""Derive clearly labelled terrain slope estimates from cached Terrarium DEM.
Pure Python, no network. OSM road JSON is read but never changed.
"""
from pathlib import Path
import math,struct,zlib,json,hashlib,bisect,runpy
root=Path(__file__).resolve().parent.parent
folder=root/'data/terrain';z=14

def decode_png(raw):
 if raw[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Not a PNG')
 offset=8;parts=[];width=height=bpp=None
 while offset<len(raw):
  size=struct.unpack_from('>I',raw,offset)[0];kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+size];crc=struct.unpack_from('>I',raw,offset+8+size)[0]
  if zlib.crc32(kind+data)&0xffffffff!=crc:raise ValueError('Terrain PNG checksum error')
  if kind==b'IHDR':
   width,height,bits,color,compression,filtering,interlace=struct.unpack('>IIBBBBB',data)
   if (width,height,bits,color,compression,filtering,interlace)!=(256,256,8,2,0,0,0):raise ValueError('Expected 256x256 RGB8 terrain PNG')
   bpp=3
  elif kind==b'IDAT':parts.append(data)
  elif kind==b'IEND':break
  offset+=size+12
 buf=zlib.decompress(b''.join(parts));stride=width*bpp;previous=bytearray(stride);result=[];at=0
 for _ in range(height):
  filt=buf[at];at+=1;row=bytearray(buf[at:at+stride]);at+=stride
  for i in range(stride):
   left=row[i-bpp] if i>=bpp else 0;up=previous[i];corner=previous[i-bpp] if i>=bpp else 0
   if filt==1:row[i]=(row[i]+left)&255
   elif filt==2:row[i]=(row[i]+up)&255
   elif filt==3:row[i]=(row[i]+((left+up)//2))&255
   elif filt==4:
    p=left+up-corner;pa,pb,pc=abs(p-left),abs(p-up),abs(p-corner);row[i]=(row[i]+(left if pa<=pb and pa<=pc else up if pb<=pc else corner))&255
   elif filt!=0:raise ValueError('Invalid PNG filter')
  result.extend((row[i]*256+row[i+1]+row[i+2]/256-32768) if row[i] else None for i in range(0,stride,3));previous=row
 return result

cache={}
def pixel(x,y):
 tx,ty=x//256,y//256;key=(tx,ty)
 if key not in cache:
  p=folder/'tiles'/str(z)/str(tx)/(str(ty)+'.png')
  if not p.exists():return None
  cache[key]=decode_png(p.read_bytes())
 return cache[key][(y%256)*256+x%256]
def elevation(ll,extended=False):
 lat,lon=ll
 if not extended and not (37.580<=lat<=37.611 and 127.020<=lon<=127.058):return None
 x=(lon+180)/360*2**z*256-.5;y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**z*256-.5
 ix,iy=math.floor(x),math.floor(y);dx,dy=x-ix,y-iy;v=[pixel(ix,iy),pixel(ix+1,iy),pixel(ix,iy+1),pixel(ix+1,iy+1)]
 if any(k is None for k in v):return None
 return v[0]*(1-dx)*(1-dy)+v[1]*dx*(1-dy)+v[2]*(1-dx)*dy+v[3]*dx*dy

def distance(a,b):return math.hypot((b[1]-a[1])*math.cos(math.radians((a[0]+b[0])/2)),b[0]-a[0])*111195

def main():
 raw=(root/'dist/map-data.json').read_bytes();data=json.loads(raw);nodes={n['id']:[n['lat'],n['lon']] for n in data['elements'] if n['type']=='node'};allowed={'footway','path','pedestrian','residential','living_street','service','steps','unclassified','tertiary','secondary','primary','track','cycleway'}
 edges={};used=set();skipped=0
 for w in data['elements']:
  tags=w.get('tags',{})
  if w['type']!='way' or tags.get('highway') not in allowed:continue
  if tags.get('bridge') not in (None,'no') or tags.get('tunnel') not in (None,'no') or tags.get('layer','0')!='0':skipped+=1;continue
  ids=w.get('nodes',[])
  if len(ids)<2 or any(i not in nodes for i in ids):continue
  ll=[nodes[i] for i in ids];cumulative=[0]
  for a,b in zip(ll,ll[1:]):cumulative.append(cumulative[-1]+distance(a,b))
  if cumulative[-1]<30:continue
  def along(d):
   i=min(max(bisect.bisect_right(cumulative,d)-1,0),len(ll)-2);span=cumulative[i+1]-cumulative[i];f=(d-cumulative[i])/span if span else 0;return [ll[i][j]+(ll[i+1][j]-ll[i][j])*f for j in [0,1]]
  for i,(a,b) in enumerate(zip(ids,ids[1:])):
   mid=(cumulative[i]+cumulative[i+1])/2;start=max(0,mid-30);end=min(cumulative[-1],mid+30)
   if end-start<30:continue
   low,high=elevation(along(start)),elevation(along(end))
   if low is None or high is None:continue
   grade=abs(high-low)/(end-start)*100
   if not math.isfinite(grade) or grade>100:continue
   key='-'.join(sorted([str(a),str(b)]));edges[key]=round(grade,2);used.update([a,b])
 heights={str(i):round(h,2) for i in used if (h:=elevation(nodes[i])) is not None}
 audit=json.loads((folder/'tile-audit.json').read_text());meta={'source':'Mapzen/Tilezen Terrain Tiles · AWS','source_url':audit['source_url'],'attribution':'Mapzen/Tilezen; SRTM/GMTED2010 terrain data courtesy of the U.S. Geological Survey','attribution_url':audit['attribution_url'],'fetched_date':audit['fetched_date'],'graph_sha256':hashlib.sha256(raw).hexdigest(),'height_unit':'metres','slope_unit':'percent','method':'Bilinear Terrarium elevations, along-way centred 60m window; minimum 30m support','tile_zoom':z,'tile_pixel_spacing_m_at_wolgok':round(math.cos(math.radians(37.602))*2*math.pi*6378137/(2**z*256),2),'underlying_dem_resolution':'Varies by source; pixel spacing is not DEM accuracy','field_verified':False,'excluded_bridge_tunnel_layer_ways':skipped,'notice':'지형 표고로 계산한 추정 경사 · 보도 실측 아님 · 턱/교량/지하/짧은 급경사·건물 영향은 별도 확인','coverage':audit['coverage']}
 result={'version':1,'meta':meta,'nodeElevations':heights,'edges':edges}
 result=runpy.run_path(str(root/'scripts/terrain-review-policy.py'))['attach_review'](root,result)
 result=runpy.run_path(str(root/'scripts/terrain-screening.py'))['attach_screening'](root,result,lambda ll:elevation(ll,extended=True))
 out=root/'dist/terrain-data.json';out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n');(folder/'terrain-summary.json').write_text(json.dumps({**meta,'edge_estimates':len(edges),'node_elevations':len(heights)},ensure_ascii=False,indent=2)+'\n')
 print('지형 경사 추정 준비:',len(edges),'구간 / 고도',len(heights),'점 · OSM 원본 변경 없음')
if __name__=='__main__':main()
