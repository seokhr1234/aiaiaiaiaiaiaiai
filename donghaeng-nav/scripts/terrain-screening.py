"""Classify every runtime road edge; estimates are risk-screening proxies, never surveyed grades."""
import subprocess,json,math,hashlib,collections

def attach_screening(root,result,elevation):
 js="const E=require('./dist/engine.js'),g=E.createGraph(require('./dist/map-data.json')),seen=new Set(),out=[];for(const n of g.nodes.values())for(const e of n.edges){if(seen.has(e.key))continue;seen.add(e.key);out.push({key:e.key,a:n.ll,b:g.nodes.get(e.to).ll,wayId:e.id,name:e.name,d:e.d,incline:e.incline,reason:E.terrainApplicability(e,n,g.nodes.get(e.to))});}console.log(JSON.stringify(out))"
 roads=json.loads(subprocess.check_output(['node','-e',js],cwd=root));records={};counts=collections.Counter();lengths=collections.Counter()
 for road in roads:
  key=road['key'];review=result.get('review',{}).get('edges',{}).get(key,{})
  record={'kind':None,'minPercent':None,'maxPercent':None,'supportM':None,'sources':[],'roadSurfaceVerified':False}
  if road['incline'] is not None:
   record.update(kind='osm_registered',minPercent=road['incline'],maxPercent=road['incline'],sources=['osm'])
  elif road['reason'] or review.get('status')=='terrain_inapplicable':record.update(kind='structure_unresolved',reason=road['reason'] or 'terrain_inapplicable')
  else:
   values=[];sources=[];raw=result['edges'].get(key)
   if raw is not None:values.append(abs(raw));sources.append('tilezen_legacy')
   if review.get('status')=='source_disagreement':
    for source,grade in review.get('signed_grades',{}).items():
     if grade is not None and math.isfinite(grade):values.append(abs(grade));sources.append(source)
   if values:
    record.update(kind='source_range' if review.get('status')=='source_disagreement' else 'legacy_hint',minPercent=round(min(values),2),maxPercent=round(max(values),2),supportM=review.get('legacy_support_m') or review.get('support_m'),sources=list(dict.fromkeys(sources)))
   else:
    # 60m directional neighborhood, independent of short OSM way length.
    # This is a terrain proxy around the road, not elevation measured on its surface.
    a,b=road['a'],road['b'];lat=(a[0]+b[0])/2;lon=(a[1]+b[1])/2
    dx=(b[1]-a[1])*math.cos(math.radians(lat))*111195;dy=(b[0]-a[0])*111195;norm=math.hypot(dx,dy)
    samples=[]
    if norm>0:
     for t in [-30,-20,-10,0,10,20,30]:
      height=elevation([lat+t*dy/norm/111195,lon+t*dx/norm/(111195*math.cos(math.radians(lat)))])
      if height is None:break
      samples.append((t,height))
    if len(samples)==7:
     fit=abs(sum(t*h for t,h in samples)/sum(t*t for t,h in samples))*100
     endpoint=abs(samples[-1][1]-samples[0][1])/60*100
     record.update(kind='neighborhood_proxy',minPercent=round(min(fit,endpoint),2),maxPercent=round(max(fit,endpoint),2),supportM=60,sources=['tilezen_directional_60m'])
    else:record.update(kind='no_dem',reason='outside_dem_or_missing_samples')
  records[key]=record;counts[record['kind']]+=1;lengths[record['kind']]+=road['d']
 meta={'version':1,'method':'Risk screening only: OSM; retained legacy hints; cross-source range; 60m directional terrain fit for short ways. No road-surface validation or new source promotion.','road_edges':len(roads),'classified_edges':len(records),'counts':dict(counts),'meters':{k:round(v,1) for k,v in lengths.items()},'script_sha256':hashlib.sha256(__file__.encode()).hexdigest(),'notice':'지형 참고 추정은 보도 실측이 아닙니다. 구조물과 고도 결측은 별도 미확인으로 표시합니다.'}
 # Store actual script content fingerprint for reproducibility.
 from pathlib import Path
 meta['script_sha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
 result['screening']={'meta':meta,'edges':records}
 (root/'data/terrain/screening-summary.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 print('전체 도로 경사 검토:',len(records),'구간',dict(counts))
 return result
