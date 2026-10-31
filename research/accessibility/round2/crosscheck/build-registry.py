"""Build provenance registry from acquired local evidence and documented browser checks."""
import json,pathlib,hashlib,datetime
P=pathlib.Path(__file__).parent;ROOT=P.parents[3];now=datetime.datetime.now(datetime.timezone.utc).isoformat(); E=json.loads((P/'local-evidence.json').read_text())
S=[]
def add(id,url,title,status,meaning,license=None,date=None,local=None):
 rec={'id':id,'url':url,'title':title,'access_status':status,'checked_on':'2026-10-31','data_reference_date':date,'supports':meaning,'license':license,'raw_bytes':None,'raw_sha256':None,'raw_cache':None}
 if local:
  path=ROOT/local;b=path.read_bytes();rec.update(raw_bytes=len(b),raw_sha256=hashlib.sha256(b).hexdigest(),raw_cache=local)
 else:rec['raw_unavailable_reason']='Browser-rendered text/search extraction only; original HTTP body not downloaded or request failed.'
 S.append(rec)
add('snapshot','https://www.openstreetmap.org/copyright','Existing Overpass snapshot','local_data_acquired','OSM registered geometry/tags, not current field survey','ODbL 1.0',E['input']['snapshot'],'donghaeng-nav/dist/map-data.json')
for key,title,note in [('layer','Vertical relation','Relative vertical ordering, not metres or building storey.'),('level','Building level','Floor level differs from layer.'),('bridge','Bridge','Span structure does not establish ramp or curb-free entrance.'),('tunnel','Tunnel','Tunnel structure alone does not imply steps or wheelchair suitability.'),('access','Legal access','Permission separate from physical passability.'),('entrance','Entrance','Entry type/location separate from access rights.'),('barrier','Barrier','Physical barrier and its dimensions/access.'),('kerb','Kerb','Position on pedestrian surface and exact units matter.'),('incline','Incline','Percent/degree/direction/max versus average must not be conflated.'),('check_date','Survey freshness','Attribute observation date separate from object existence or edit date.')]:
 add('doc-'+key,'https://wiki.openstreetmap.org/wiki/Key:'+key,title,'browser_opened',note,'OSM Wiki content terms; linked document only')
add('doc-api','https://wiki.openstreetmap.org/wiki/API_v0.6','OSM API v0.6','browser_opened','Multi-fetch, object history and parent relations APIs; current API responses not acquired.')
add('doc-overpass','https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL','Overpass QL','browser_opened','Independent feature queries, recursion and metadata output; current query result not acquired.')
add('doc-kartaview-photos','https://kartaview.org/doc/photos','KartaView Photos API','search_extracted_open_js_shell','Public photo metadata API; shotDate differs from dateAdded; local coverage not confirmed.')
add('doc-kartaview-faq','https://kartaview.org/doc/faq','KartaView FAQ','search_extracted_open_js_shell','Most read endpoints public; no key acquired or requested; radius max 500 per Photos request table.')
add('doc-mapillary','https://help.mapillary.com/hc/en-us/articles/360010234680-Accessing-imagery-and-data-through-the-Mapillary-API','Mapillary API support','browser_opened','Official API pointer only; no school image metadata acquired.',date='2024-12-10 page update')
for w in E['route_way_records']:
 add('osm-way-'+str(w['osm_id']),w['url'],'Route way '+str(w['osm_id']),'local_snapshot_only_live_unavailable','Tags and geometry verified in downloaded project snapshot; per-object history not obtained.','ODbL 1.0',E['input']['snapshot'])
 S[-1]['snapshot_sha256']=E['input']['sha256'];S[-1]['history_url']=w['history_url'];S[-1]['tags']=w['tags']
for id,meaning in [(12464206320,'Bench POI/backrest=no; physical connector unknown.'),(357869790,'Destination is bus_stop/platform named 종월2교, not a bridge object.'),(14196290450,'Demo start is school-named bus stop, not a verified school gate.')]:
 add('osm-node-'+str(id),'https://www.openstreetmap.org/node/'+str(id),'Local POI '+str(id),'local_snapshot_only_live_unavailable',meaning,'ODbL 1.0',E['input']['snapshot']);S[-1]['snapshot_sha256']=E['input']['sha256']
photos=[{'name':'Seongbuk Jongam-dong Community Service Center.jpg','date':'2013-08-15T12:53:10','timezone':'not_explicit_in_page_summary','author':'안우석','license':'CC0 1.0','coordinates':[127.035167,37.599167],'heading_deg':196.4595959596,'file_bytes_exact':None,'page_reported_file_size':'4.39 MB'}, {'name':'Seongbuk Wolgok 2-dong Community Service Center.jpg','date':'2013-08-15T13:34:59','timezone':'not_explicit_in_page_summary','author':'안우석','license':'CC0 1.0','coordinates':[127.048,37.606],'heading_deg':215.8009478673,'file_bytes_exact':None,'page_reported_file_size':'4.19 MB'}, {'name':'Seoul-metro-641-Wolgok-station-entrance-5-20181125-145306.jpg','date':'2018-11-25T14:53:06+09:00','timezone':'KST explicit','author':'LERK','license':'CC BY-SA 4.0 (or CC BY-SA 2.1 Japan)','coordinates':None,'heading_deg':None,'file_bytes_exact':None,'page_reported_file_size':'2.46 MB'}]
for i,photo in enumerate(photos):
 photo.update(url='https://commons.wikimedia.org/wiki/File:'+photo['name'].replace(' ','_'),checked_on='2026-10-31',image_downloaded=False,image_visually_interpreted=False,accessibility_measurements_created=False)
 add('photo-'+str(i+1),photo['url'],photo['name'],'browser_metadata_opened','Existence/date/license only; not evidence of current curb/width/slope or public access.',photo['license'],photo['date'])
(P/'photo-candidates.json').write_text(json.dumps(photos,ensure_ascii=False,indent=2)+'\n')
(P/'sources.json').write_text(json.dumps(S,ensure_ascii=False,indent=2)+'\n')
# Preserve actual attempted requests, not planned collection jobs.
logs=[{'requested_on':'2026-10-31','transport':'web_tool','url':u,'status':'inaccessible','bytes':None,'sha256':None,'reason':'Browser tool reported not accessible; no HTTP code available.'} for u in ['https://api.openstreetmap.org/api/0.6/way/37402230/history.json','https://www.openstreetmap.org/way/37402230/history','https://api.openstreetmap.org/api/0.6/node/12464206320/history.json','https://www.openstreetmap.org/way/750640243/history','https://api.openstreetmap.org/api/0.6/way/750640242.json','https://www.openstreetmap.org/api/0.6/way/750640242','https://www.openstreetmap.org/way/379766295','https://www.openstreetmap.org/node/12464206320']]
u='https://api.openstreetmap.org/api/0.6/ways.json?ways=37402230,183272540,750640231,750640241,750640242,750640243'
logs += [{'requested_on':'2026-10-31','transport':'executor-default','url':u,'status':'failed_permission','error':'URLError [Errno 1] Operation not permitted','bytes':None,'sha256':None},{'requested_on':'2026-10-31','transport':'executor-with-network-permission-inherited-proxy','url':u,'status':'failed_proxy_policy','error':'Tunnel connection failed: 403 Forbidden','bytes':None,'sha256':None,'action':'Stopped network requests; did not bypass proxy or try alternate data mirror.'}]
logs += [{'requested_on':'2026-10-31','transport':'web_tool','url':s['url'],'status':s['access_status'],'bytes':None,'sha256':None} for s in S if s['id'].startswith(('doc-','photo-'))]
(P/'acquisition-log.json').write_text(json.dumps({'created_at':now,'actual_checks':logs,'planned_requests_file':'collection-run.json','network_limit':'Current OSM data/history, changesets and independent Overpass features not acquired. Planned requests are dry run only.'},ensure_ascii=False,indent=2)+'\n')
# Object ledger is local snapshot evidence only, with no forged metadata.
ledger=[]
for w in E['route_way_records']:
 ledger.append({'osm_type':'way','osm_id':w['osm_id'],'tags':w['tags'],'snapshot':E['input']['snapshot'],'object_edit_timestamp':None,'object_version':None,'changeset_id':None,'field_survey_date':w['tags'].get('survey:date'),'check_date':w['tags'].get('check_date'),'source_tag':w['tags'].get('source'),'history_fetch_status':'blocked_not_acquired','evidence_level':'registered_snapshot','source_url':w['url']})
(P/'object-ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
print('sources',len(S),'photo_metadata',len(photos),'actual_checks',len(logs))
